import type { Issue, Engineer } from "../../db/schema.js";
import { getStartedIssues, upsertEngineer } from "../../db/queries.js";
import { WIP_LIMIT } from "../../constants/thresholds.js";
import {
  hasMissingEstimate,
  hasMissingPriority,
  hasNoRecentComment,
  hasWIPAgeViolation,
} from "../../utils/issue-validators.js";

/**
 * Get allowed engineer names from ENGINEER_TEAM_MAPPING.
 * Returns null if mapping is not configured (no filtering).
 * Returns a Set of engineer names (case-insensitive matching) if configured.
 */
function getAllowedEngineers(): Set<string> | null {
  const mapping = process.env.ENGINEER_TEAM_MAPPING;
  if (!mapping) {
    return null;
  }

  const pairs = mapping.split(",");
  const engineers = new Set<string>();

  for (const pair of pairs) {
    const [engineer] = pair.split(":").map((s) => s.trim());
    if (engineer) {
      engineers.add(engineer.toLowerCase());
    }
  }

  return engineers.size > 0 ? engineers : null;
}

/**
 * Issue summary for storing in engineer's active_issues JSON
 */
interface IssueSummary {
  id: string;
  identifier: string;
  title: string;
  estimate: number | null;
  priority: number;
  last_comment_at: string | null;
  comment_count: number | null;
  started_at: string | null;
  url: string;
  team_name: string;
  project_name: string | null;
  state_name?: string;
  state_type?: string;
}

/**
 * Compute engineer WIP metrics from started issues and store in engineers table.
 * If ENGINEER_TEAM_MAPPING is configured, only engineers in the mapping are included.
 */
export function computeAndStoreEngineers(): number {
  const startedIssues = getStartedIssues();

  // Get allowed engineers from ENGINEER_TEAM_MAPPING (null = no filtering)
  const allowedEngineers = getAllowedEngineers();

  // Group by assignee_id (skip unassigned)
  const engineerGroups = new Map<
    string,
    { name: string; avatarUrl: string | null; issues: Issue[] }
  >();

  for (const issue of startedIssues) {
    if (!issue.assignee_id || !issue.assignee_name) continue;

    // Filter by ENGINEER_TEAM_MAPPING if configured
    if (
      allowedEngineers &&
      !allowedEngineers.has(issue.assignee_name.toLowerCase())
    ) {
      continue;
    }

    if (!engineerGroups.has(issue.assignee_id)) {
      engineerGroups.set(issue.assignee_id, {
        name: issue.assignee_name,
        avatarUrl: issue.assignee_avatar_url,
        issues: [],
      });
    }
    engineerGroups.get(issue.assignee_id)!.issues.push(issue);
  }

  const activeEngineerIds = new Set<string>();

  // Compute metrics for each engineer
  for (const [assigneeId, { name, avatarUrl, issues }] of engineerGroups) {
    activeEngineerIds.add(assigneeId);

    // Collect unique teams and projects
    const teamIds = new Set<string>();
    const teamNames = new Set<string>();
    const projectIds = new Set<string>();
    for (const issue of issues) {
      teamIds.add(issue.team_id);
      teamNames.add(issue.team_name);
      if (issue.project_id) {
        projectIds.add(issue.project_id);
      }
    }

    // Calculate active project count (healthy = 1 project)
    const activeProjectCount = projectIds.size;
    const multiProjectViolation = activeProjectCount > 1 ? 1 : 0;

    // Calculate WIP metrics
    const wipIssueCount = issues.length;
    let wipTotalPoints = 0;
    for (const issue of issues) {
      if (issue.estimate !== null) {
        wipTotalPoints += issue.estimate;
      }
    }

    // Check WIP limit violation
    const wipLimitViolation = wipIssueCount > WIP_LIMIT ? 1 : 0;

    // Calculate oldest WIP age (days since started)
    let oldestWipAgeDays: number | null = null;
    const now = Date.now();
    for (const issue of issues) {
      if (issue.started_at) {
        const startedAt = new Date(issue.started_at).getTime();
        const ageDays = (now - startedAt) / (1000 * 60 * 60 * 24);
        if (oldestWipAgeDays === null || ageDays > oldestWipAgeDays) {
          oldestWipAgeDays = ageDays;
        }
      }
    }

    // Find last activity
    let lastActivityAt: string | null = null;
    for (const issue of issues) {
      if (
        !lastActivityAt ||
        new Date(issue.updated_at) > new Date(lastActivityAt)
      ) {
        lastActivityAt = issue.updated_at;
      }
    }

    // Calculate violation counts
    let missingEstimateCount = 0;
    let missingPriorityCount = 0;
    let noRecentCommentCount = 0;
    let wipAgeViolationCount = 0;

    for (const issue of issues) {
      if (hasMissingEstimate(issue)) missingEstimateCount++;
      if (hasMissingPriority(issue)) missingPriorityCount++;
      if (hasNoRecentComment(issue)) noRecentCommentCount++;
      if (hasWIPAgeViolation(issue)) wipAgeViolationCount++;
    }

    // Build active issues summary
    const activeIssues: IssueSummary[] = issues.map((issue) => ({
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      estimate: issue.estimate,
      priority: issue.priority,
      last_comment_at: issue.last_comment_at,
      comment_count: issue.comment_count,
      started_at: issue.started_at,
      url: issue.url,
      team_name: issue.team_name,
      project_name: issue.project_name,
      state_name: issue.state_name,
      state_type: issue.state_type,
    }));

    const engineer: Engineer = {
      assignee_id: assigneeId,
      assignee_name: name,
      avatar_url: avatarUrl,
      team_ids: JSON.stringify(Array.from(teamIds)),
      team_names: JSON.stringify(Array.from(teamNames)),
      wip_issue_count: wipIssueCount,
      wip_total_points: wipTotalPoints,
      wip_limit_violation: wipLimitViolation,
      oldest_wip_age_days: oldestWipAgeDays,
      last_activity_at: lastActivityAt,
      missing_estimate_count: missingEstimateCount,
      missing_priority_count: missingPriorityCount,
      no_recent_comment_count: noRecentCommentCount,
      wip_age_violation_count: wipAgeViolationCount,
      active_project_count: activeProjectCount,
      multi_project_violation: multiProjectViolation,
      active_issues: JSON.stringify(activeIssues),
    };

    upsertEngineer(engineer);
  }

  // Note: We no longer delete engineers - all data is preserved for historical tracking

  return activeEngineerIds.size;
}

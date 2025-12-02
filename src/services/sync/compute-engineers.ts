import type { Issue, Engineer } from "../../db/schema.js";
import { getStartedIssues, upsertEngineer, getExistingEngineerIds, deleteEngineersByIds } from "../../db/queries.js";
import { WIP_THRESHOLDS } from "../../constants/thresholds.js";
import {
  hasMissingEstimate,
  hasMissingPriority,
  hasNoRecentComment,
  hasWIPAgeViolation,
} from "../../utils/issue-validators.js";

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
 * Compute engineer WIP metrics from started issues and store in engineers table
 */
export function computeAndStoreEngineers(): number {
  const startedIssues = getStartedIssues();

  // Group by assignee_id (skip unassigned)
  const engineerGroups = new Map<
    string,
    { name: string; avatarUrl: string | null; issues: Issue[] }
  >();

  for (const issue of startedIssues) {
    if (!issue.assignee_id || !issue.assignee_name) continue;

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

    // Collect unique teams
    const teamIds = new Set<string>();
    const teamNames = new Set<string>();
    for (const issue of issues) {
      teamIds.add(issue.team_id);
      teamNames.add(issue.team_name);
    }

    // Calculate WIP metrics
    const wipIssueCount = issues.length;
    let wipTotalPoints = 0;
    for (const issue of issues) {
      if (issue.estimate !== null) {
        wipTotalPoints += issue.estimate;
      }
    }

    // Check WIP limit violation
    const wipLimitViolation = wipIssueCount >= WIP_THRESHOLDS.WARNING ? 1 : 0;

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
      active_issues: JSON.stringify(activeIssues),
    };

    upsertEngineer(engineer);
  }

  // Delete engineers that no longer have WIP
  const existingEngineerIds = getExistingEngineerIds();
  const engineersToDelete = Array.from(existingEngineerIds).filter(
    (id) => !activeEngineerIds.has(id)
  );

  if (engineersToDelete.length > 0) {
    deleteEngineersByIds(engineersToDelete);
    console.log(
      `[SYNC] Deleted ${engineersToDelete.length} engineer(s) with no WIP`
    );
  }

  return activeEngineerIds.size;
}


import { getDatabase } from "../db/connection.js";
import { getDomainForTeam } from "../utils/domain-mapping.js";
import { WIP_LIMIT, PROJECT_THRESHOLDS } from "../constants/thresholds.js";
import type { Issue } from "../db/schema.js";
import type {
  AssigneeViolation,
  ProjectViolation,
  EngineerMultiProjectViolation,
  ProjectsData,
} from "../types/violations.js";
import { hasNoRecentComment } from "../utils/issue-validators.js";

/**
 * Calculate violation counts for a set of issues
 */
function calculateViolationCounts(issues: Issue[]): {
  missingEstimate: number;
  noRecentComment: number;
  missingPriority: number;
} {
  const missingEstimate = issues.filter((i) => !i.estimate).length;
  const noRecentComment = issues.filter((i) => hasNoRecentComment(i)).length;
  const missingPriority = issues.filter((i) => i.priority === 0).length;

  return { missingEstimate, noRecentComment, missingPriority };
}

/**
 * Load and calculate all projects data
 */
export function loadProjectsData(): ProjectsData {
  const db = getDatabase();

  // Load assignee violations (started issues only, > 5 issues)
  const startedIssues = db
    .prepare(`SELECT * FROM issues WHERE state_type = 'started'`)
    .all() as Issue[];

  const issuesByAssignee = new Map<string, Issue[]>();
  for (const issue of startedIssues) {
    const assignee = issue.assignee_name || "Unassigned";
    if (!issuesByAssignee.has(assignee)) {
      issuesByAssignee.set(assignee, []);
    }
    issuesByAssignee.get(assignee)?.push(issue);
  }

  // Track unassigned issues separately (exclude Paused/Blocked - often intentional)
  const unassignedIssues = issuesByAssignee.get("Unassigned");
  const actionableUnassigned = unassignedIssues?.filter(
    (issue) => issue.state_name !== "Paused" && issue.state_name !== "Blocked"
  );
  const unassignedCount = actionableUnassigned?.length || 0;

  const violations: AssigneeViolation[] = [];
  for (const [name, issues] of issuesByAssignee) {
    // Skip unassigned - they're tracked separately
    if (name === "Unassigned") continue;

    const count = issues.length;
    if (count > WIP_LIMIT) {
      violations.push({
        name,
        count,
        status: "warning",
      });
    }
  }
  violations.sort((a, b) => b.count - a.count);

  // Don't count unassigned in total assignees
  const totalAssignees = issuesByAssignee.size - (unassignedIssues ? 1 : 0);

  // Calculate violation counts across all started issues
  const violationCounts = calculateViolationCounts(startedIssues);

  // Calculate team statistics
  const teamMap = new Map<string, Issue[]>();
  for (const issue of startedIssues) {
    const teamKey = issue.team_key;
    if (!teamMap.has(teamKey)) {
      teamMap.set(teamKey, []);
    }
    teamMap.get(teamKey)?.push(issue);
  }

  const totalTeams = teamMap.size;

  // Count teams with violations
  let teamsWithViolationsCount = 0;
  for (const [_, issues] of teamMap) {
    const teamViolations = calculateViolationCounts(issues);

    // Check for WIP violations (assignees with > 5 issues)
    const teamIssuesByAssignee = new Map<string, Issue[]>();
    for (const issue of issues) {
      const assignee = issue.assignee_name || "Unassigned";
      if (!teamIssuesByAssignee.has(assignee)) {
        teamIssuesByAssignee.set(assignee, []);
      }
      teamIssuesByAssignee.get(assignee)?.push(issue);
    }
    const hasWipViolation = Array.from(teamIssuesByAssignee.values()).some(
      (assigneeIssues) => assigneeIssues.length > WIP_LIMIT
    );

    if (
      teamViolations.missingEstimate > 0 ||
      teamViolations.noRecentComment > 0 ||
      teamViolations.missingPriority > 0 ||
      hasWipViolation
    ) {
      teamsWithViolationsCount++;
    }
  }

  // Calculate domain statistics
  const domainMap = new Map<string, Issue[]>();
  for (const issue of startedIssues) {
    const domain = getDomainForTeam(issue.team_key);
    if (domain) {
      if (!domainMap.has(domain)) {
        domainMap.set(domain, []);
      }
      domainMap.get(domain)?.push(issue);
    }
  }

  const totalDomains = domainMap.size;

  // Count domains with violations
  let domainsWithViolationsCount = 0;
  for (const [_, issues] of domainMap) {
    const domainViolations = calculateViolationCounts(issues);

    // Check for WIP violations (any assignee in domain with > 5 started issues)
    const assigneeCountsInDomain = new Map<string, number>();
    for (const issue of issues) {
      if (issue.assignee_name) {
        assigneeCountsInDomain.set(
          issue.assignee_name,
          (assigneeCountsInDomain.get(issue.assignee_name) || 0) + 1
        );
      }
    }
    const hasWipViolation = Array.from(assigneeCountsInDomain.values()).some(
      (count) => count > WIP_LIMIT
    );

    if (
      domainViolations.missingEstimate > 0 ||
      domainViolations.noRecentComment > 0 ||
      domainViolations.missingPriority > 0 ||
      hasWipViolation
    ) {
      domainsWithViolationsCount++;
    }
  }

  // Load engineers working on multiple projects
  const startedProjectIssues = db
    .prepare(
      `
      SELECT * FROM issues 
      WHERE state_type = 'started' 
      AND project_id IS NOT NULL 
      AND assignee_name IS NOT NULL
    `
    )
    .all() as Issue[];

  // Group by engineer to see how many projects each is working on
  const engineerProjects = new Map<string, Set<string>>();
  const engineerProjectNames = new Map<string, Map<string, string>>();

  for (const issue of startedProjectIssues) {
    const engineerName = issue.assignee_name!;
    const projectId = issue.project_id!;
    const projectName = issue.project_name || "Unknown Project";

    if (!engineerProjects.has(engineerName)) {
      engineerProjects.set(engineerName, new Set());
      engineerProjectNames.set(engineerName, new Map());
    }

    engineerProjects.get(engineerName)!.add(projectId);
    engineerProjectNames.get(engineerName)!.set(projectId, projectName);
  }

  // Find engineers working on multiple projects
  const multiProjectViolations: EngineerMultiProjectViolation[] = [];
  for (const [engineerName, projectIds] of engineerProjects) {
    if (projectIds.size > 1) {
      const projectNamesList = Array.from(projectIds).map(
        (id) => engineerProjectNames.get(engineerName)!.get(id)!
      );

      multiProjectViolations.push({
        engineerName,
        projectCount: projectIds.size,
        projects: projectNamesList,
      });
    }
  }

  multiProjectViolations.sort((a, b) => b.projectCount - a.projectCount);

  // Load project violations (status mismatch and staleness only)
  const allIssues = db
    .prepare(`SELECT * FROM issues WHERE project_id IS NOT NULL`)
    .all() as Issue[];

  const projectGroups = new Map<string, Issue[]>();
  for (const issue of allIssues) {
    if (!issue.project_id) continue;
    if (!projectGroups.has(issue.project_id)) {
      projectGroups.set(issue.project_id, []);
    }
    projectGroups.get(issue.project_id)?.push(issue);
  }

  const projViolations: ProjectViolation[] = [];
  for (const [_projectId, issues] of projectGroups) {
    const hasStartedIssues = issues.some((i) => i.state_type === "started");
    if (!hasStartedIssues) continue; // Only active projects

    const engineers = new Set(
      issues.filter((i) => i.assignee_name).map((i) => i.assignee_name)
    );

    const projectStateCategory =
      issues[0].project_state_category?.toLowerCase() || "";
    const isProjectStarted =
      projectStateCategory.includes("progress") ||
      projectStateCategory.includes("started");
    const hasStatusMismatch = hasStartedIssues && !isProjectStarted;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - PROJECT_THRESHOLDS.STALE_DAYS);
    const isStale = issues[0].project_updated_at
      ? new Date(issues[0].project_updated_at) < cutoffDate
      : true;

    // Remove the engineerCount > 1 check - we're tracking that separately now
    if (hasStatusMismatch || isStale) {
      projViolations.push({
        name: issues[0].project_name || "Unknown Project",
        engineerCount: engineers.size,
        hasStatusMismatch,
        isStale,
      });
    }
  }
  projViolations.sort((a, b) => b.engineerCount - a.engineerCount);

  return {
    assigneeViolations: violations,
    projectViolations: projViolations,
    engineerMultiProjectViolations: multiProjectViolations,
    totalAssignees,
    totalProjects: projectGroups.size,
    unassignedCount,
    missingEstimateCount: violationCounts.missingEstimate,
    noRecentCommentCount: violationCounts.noRecentComment,
    missingPriorityCount: violationCounts.missingPriority,
    totalTeams,
    teamsWithViolations: teamsWithViolationsCount,
    totalDomains,
    domainsWithViolations: domainsWithViolationsCount,
  };
}

import { createLinearClient } from "../linear/client.js";
import {
  getExistingIssueIds,
  upsertIssue,
  deleteIssuesByTeams,
  getTotalIssueCount,
  getAllIssues,
  getAllProjects,
  upsertProject,
  deleteProjectsByProjectIds,
} from "../db/queries.js";
import type { Issue, Project } from "../db/schema.js";
import { isProjectActive } from "../utils/status-helpers.js";
import {
  hasStatusMismatch,
  isStaleUpdate,
  isMissingLead,
} from "../utils/status-helpers.js";
import {
  hasViolations,
  hasMissingEstimate,
  hasMissingPriority,
  hasNoRecentComment,
  hasWIPAgeViolation,
  hasMissingDescription,
} from "../utils/issue-validators.js";
import {
  calculateTotalPoints,
  calculateAverageCycleTime,
  calculateAverageLeadTime,
  calculateLinearProgress,
  calculateVelocity,
  calculateVelocityByTeam,
  calculateEstimateAccuracy,
} from "../lib/utils/project-helpers.js";

export interface SyncResult {
  success: boolean;
  newCount: number;
  updatedCount: number;
  totalCount: number;
  issueCount: number;
  projectCount: number;
  projectIssueCount: number;
  error?: string;
}

export interface SyncCallbacks {
  onIssueCountUpdate?: (count: number) => void;
  onProjectCountUpdate?: (count: number) => void;
  onProjectIssueCountUpdate?: (count: number) => void;
  onProgressPercent?: (percent: number) => void;
}

/**
 * Performs sync of Linear issues to local database
 * @param includeProjectSync - Whether to also fetch all issues from active projects
 * @param callbacks - Optional callbacks for progress updates
 */
export async function performSync(
  includeProjectSync: boolean = true,
  callbacks?: SyncCallbacks
): Promise<SyncResult> {
  try {
    // Get ignored team keys
    const ignoredTeamKeys = process.env.IGNORED_TEAM_KEYS
      ? process.env.IGNORED_TEAM_KEYS.split(",").map((key) => key.trim())
      : [];

    // Connect to Linear
    const linearClient = createLinearClient();
    callbacks?.onProgressPercent?.(0);
    console.log("[SYNC] Testing Linear API connection...");
    const connected = await linearClient.testConnection();

    if (!connected) {
      console.error("[SYNC] Failed to connect to Linear API");
      return {
        success: false,
        newCount: 0,
        updatedCount: 0,
        totalCount: 0,
        issueCount: 0,
        projectCount: 0,
        projectIssueCount: 0,
        error: "Failed to connect to Linear. Check your API key.",
      };
    }
    console.log("[SYNC] Linear API connection successful");

    // Fetch issues (step 1 of N+1 where N is number of projects)
    const allIssues = await linearClient.fetchStartedIssues((count) => {
      callbacks?.onIssueCountUpdate?.(count);
    });
    console.log(
      `[SYNC] Fetched ${allIssues.length} started issues from Linear`
    );

    // Filter ignored teams
    const startedIssues = allIssues.filter(
      (issue) => !ignoredTeamKeys.includes(issue.teamKey)
    );
    if (ignoredTeamKeys.length > 0) {
      const filteredCount = allIssues.length - startedIssues.length;
      console.log(
        `[SYNC] Filtered out ${filteredCount} issues from ${ignoredTeamKeys.length} ignored team(s)`
      );
    }

    // Phase 2: Fetch all issues for projects with active work (optional)
    let projectIssues: typeof allIssues = [];
    let projectCount = 0;
    const activeProjectIds = new Set<string>();
    const projectDescriptionsMap = new Map<string, string | null>();

    if (includeProjectSync) {
      const projectIdsFromIssues = new Set(
        startedIssues
          .filter((issue) => issue.projectId)
          .map((issue) => issue.projectId as string)
      );

      // Add to activeProjectIds set
      for (const id of projectIdsFromIssues) {
        activeProjectIds.add(id);
      }

      projectCount = projectIdsFromIssues.size;
      callbacks?.onProjectCountUpdate?.(projectCount);
      console.log(
        `[SYNC] Found ${projectCount} active project(s) with started issues`
      );

      if (projectIdsFromIssues.size > 0) {
        // Total steps = 1 (started issues) + N (projects)
        const totalSteps = 1 + projectCount;

        // Step 1 complete (started issues)
        callbacks?.onProgressPercent?.(Math.round((1 / totalSteps) * 100));

        // Fetch issues and descriptions together - descriptions are fetched inline during issue fetching
        projectIssues = await linearClient.fetchIssuesByProjects(
          Array.from(projectIdsFromIssues),
          (count, pageSize, projectIndex, totalProjects) => {
            callbacks?.onProjectIssueCountUpdate?.(count);
            // Update progress when starting a new project (pageSize is undefined at start)
            // When projectIndex is 0, we're starting the first project (1 step done: started issues)
            // When projectIndex is 1, we've completed project 0 (2 steps done: started + project 0)
            if (
              projectIndex !== undefined &&
              totalProjects !== undefined &&
              totalSteps > 0 &&
              pageSize === undefined
            ) {
              // Completed steps: 1 (started issues) + projectIndex (completed projects)
              const completedSteps = 1 + projectIndex;
              const percent = Math.min(
                Math.round((completedSteps / totalSteps) * 100),
                99
              );
              callbacks?.onProgressPercent?.(percent);
            }
          },
          projectDescriptionsMap
        );
        // All projects complete - set to 100%
        callbacks?.onProgressPercent?.(100);
        console.log(
          `[SYNC] Fetched ${projectIssues.length} issues from ${projectCount} project(s)`
        );
        console.log(
          `[SYNC] Fetched descriptions for ${projectDescriptionsMap.size} project(s)`
        );
      } else {
        // No projects, sync is complete
        callbacks?.onProgressPercent?.(100);
      }
    } else {
      // No project sync, sync is complete after started issues
      callbacks?.onProgressPercent?.(100);
    }

    // Combine all issues and deduplicate
    const allIssuesMap = new Map<string, (typeof allIssues)[0]>();
    // Track project labels from Linear API
    const projectLabelsMap = new Map<string, string[]>();
    for (const issue of [...startedIssues, ...projectIssues]) {
      allIssuesMap.set(issue.id, issue);
      // Collect project labels
      if (
        issue.projectId &&
        issue.projectLabels &&
        issue.projectLabels.length > 0
      ) {
        // Use the labels from any issue (they should be the same for all issues in a project)
        if (!projectLabelsMap.has(issue.projectId)) {
          projectLabelsMap.set(issue.projectId, issue.projectLabels);
        }
      }
    }
    const issues = Array.from(allIssuesMap.values());
    const totalBeforeDedup = startedIssues.length + projectIssues.length;
    const duplicatesRemoved = totalBeforeDedup - issues.length;
    if (duplicatesRemoved > 0) {
      console.log(
        `[SYNC] Deduplicated: ${duplicatesRemoved} duplicate issue(s) removed (${totalBeforeDedup} → ${issues.length})`
      );
    }

    // Store in database (final step, already at 100% if no projects, otherwise maintain)
    const existingIds = getExistingIssueIds();
    console.log(
      `[SYNC] Found ${existingIds.size} existing issue(s) in database`
    );

    let newIssues = 0;
    let updatedIssues = 0;

    for (const issue of issues) {
      if (existingIds.has(issue.id)) {
        updatedIssues++;
      } else {
        newIssues++;
      }

      upsertIssue({
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        description: issue.description,
        team_id: issue.teamId,
        team_name: issue.teamName,
        team_key: issue.teamKey,
        state_id: issue.stateId,
        state_name: issue.stateName,
        state_type: issue.stateType,
        assignee_id: issue.assigneeId,
        assignee_name: issue.assigneeName,
        creator_id: issue.creatorId,
        creator_name: issue.creatorName,
        priority: issue.priority,
        estimate: issue.estimate,
        last_comment_at: issue.lastCommentAt
          ? issue.lastCommentAt.toISOString()
          : null,
        created_at: issue.createdAt.toISOString(),
        updated_at: issue.updatedAt.toISOString(),
        started_at: issue.startedAt ? issue.startedAt.toISOString() : null,
        completed_at: issue.completedAt
          ? issue.completedAt.toISOString()
          : null,
        canceled_at: issue.canceledAt ? issue.canceledAt.toISOString() : null,
        url: issue.url,
        project_id: issue.projectId,
        project_name: issue.projectName,
        project_state: issue.projectState,
        project_health: issue.projectHealth,
        project_updated_at: issue.projectUpdatedAt
          ? issue.projectUpdatedAt.toISOString()
          : null,
        project_lead_id: issue.projectLeadId,
        project_lead_name: issue.projectLeadName,
      });
    }

    // Remove ignored teams from database
    if (ignoredTeamKeys.length > 0) {
      deleteIssuesByTeams(ignoredTeamKeys);
      console.log(
        `[SYNC] Removed issues from ${ignoredTeamKeys.length} ignored team(s)`
      );
    }

    // Get total count
    const total = getTotalIssueCount();
    console.log(`[SYNC] Database now contains ${total} total issue(s)`);

    // Count started issues for reporting
    const startedCount = issues.filter((i) => i.stateType === "started").length;

    // Compute and store project metrics
    console.log(`[SYNC] Computing project metrics...`);
    const computedProjectCount = await computeAndStoreProjects(
      projectLabelsMap,
      projectDescriptionsMap
    );
    console.log(
      `[SYNC] Computed metrics for ${computedProjectCount} project(s)`
    );

    console.log(
      `[SYNC] Summary - New: ${newIssues}, Updated: ${updatedIssues}, Started: ${startedCount}, Projects: ${projectCount}, Project Issues: ${projectIssues.length}, Computed Projects: ${computedProjectCount}`
    );

    return {
      success: true,
      newCount: newIssues,
      updatedCount: updatedIssues,
      totalCount: total,
      issueCount: startedCount,
      projectCount: computedProjectCount,
      projectIssueCount: projectIssues.length,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "An unknown error occurred";
    console.error(`[SYNC] Sync error: ${errorMessage}`, error);

    // Check if it's a schema mismatch error
    const isSchemaError =
      (errorMessage.includes("values for") &&
        errorMessage.includes("columns")) ||
      errorMessage.includes("no such column") ||
      errorMessage.includes("table_info");

    const finalError = isSchemaError
      ? `${errorMessage}\n\n💡 Tip: This looks like a schema mismatch. Try resetting the database:\n   bun run reset-db`
      : errorMessage;

    return {
      success: false,
      newCount: 0,
      updatedCount: 0,
      totalCount: 0,
      issueCount: 0,
      projectCount: 0,
      projectIssueCount: 0,
      error: finalError,
    };
  }
}

/**
 * Compute project metrics from issues and store in projects table
 */
async function computeAndStoreProjects(
  projectLabelsMap?: Map<string, string[]>,
  projectDescriptionsMap?: Map<string, string | null>
): Promise<number> {
  const allIssues = getAllIssues();

  // Group issues by project
  const projectGroups = new Map<string, Issue[]>();
  for (const issue of allIssues) {
    if (!issue.project_id) continue;
    if (!projectGroups.has(issue.project_id)) {
      projectGroups.set(issue.project_id, []);
    }
    projectGroups.get(issue.project_id)!.push(issue);
  }

  const activeProjectIds = new Set<string>();

  // Compute metrics for each project
  for (const [projectId, projectIssues] of projectGroups) {
    // Only include active projects
    if (!isProjectActive(projectIssues)) continue;

    activeProjectIds.add(projectId);

    const firstIssue = projectIssues[0];
    const issuesByState = new Map<string, number>();
    const engineers = new Set<string>();
    const teams = new Set<string>();

    let lastActivityDate = firstIssue.updated_at;
    let earliestCreatedAt = firstIssue.created_at;
    let completedCount = 0;
    let inProgressCount = 0;

    for (const issue of projectIssues) {
      // Track issue states
      const stateName = issue.state_name;
      issuesByState.set(stateName, (issuesByState.get(stateName) || 0) + 1);

      // Count completed and in-progress
      if (
        stateName.toLowerCase().includes("done") ||
        stateName.toLowerCase().includes("completed")
      ) {
        completedCount++;
      }
      if (
        stateName.toLowerCase() === "in progress" ||
        issue.state_type === "started"
      ) {
        inProgressCount++;
      }

      // Track engineers
      if (issue.assignee_name) {
        engineers.add(issue.assignee_name);
      }

      // Track teams
      teams.add(issue.team_key);

      // Track latest activity
      if (new Date(issue.updated_at) > new Date(lastActivityDate)) {
        lastActivityDate = issue.updated_at;
      }

      // Track earliest creation
      if (new Date(issue.created_at) < new Date(earliestCreatedAt)) {
        earliestCreatedAt = issue.created_at;
      }
    }

    // Calculate violation counts
    let missingEstimateCount = 0;
    let missingPriorityCount = 0;
    let noRecentCommentCount = 0;
    let wipAgeViolationCount = 0;
    let missingDescriptionCount = 0;

    for (const issue of projectIssues) {
      if (hasMissingEstimate(issue)) missingEstimateCount++;
      if (hasMissingPriority(issue)) missingPriorityCount++;
      if (hasNoRecentComment(issue)) noRecentCommentCount++;
      if (hasWIPAgeViolation(issue)) wipAgeViolationCount++;
      if (hasMissingDescription(issue)) missingDescriptionCount++;
    }

    // Calculate flags
    const hasStatusMismatchFlag = hasStatusMismatch(
      firstIssue.project_state,
      projectIssues
    );
    const isStaleUpdateFlag = isStaleUpdate(lastActivityDate);
    const missingLeadFlag = isMissingLead(
      firstIssue.project_state,
      firstIssue.project_lead_name,
      projectIssues
    );
    const hasViolationsFlag = hasViolations(projectIssues);
    const missingHealthFlag = !firstIssue.project_health;

    // Calculate metrics using helper functions
    const totalPoints = calculateTotalPoints(projectIssues);
    const averageCycleTime = calculateAverageCycleTime(projectIssues);
    const averageLeadTime = calculateAverageLeadTime(projectIssues);
    const linearProgress = calculateLinearProgress(projectIssues);
    const velocity = calculateVelocity(projectIssues, earliestCreatedAt);
    const velocityByTeam = calculateVelocityByTeam(
      projectIssues,
      earliestCreatedAt
    );
    const estimateAccuracy = calculateEstimateAccuracy(projectIssues);

    // Calculate days per story point for accuracy
    const completedIssues = projectIssues
      .filter((issue) => {
        const stateName = issue.state_name?.toLowerCase() || "";
        return stateName.includes("done") || stateName.includes("completed");
      })
      .filter(
        (issue) => issue.estimate !== null && issue.estimate !== undefined
      );

    let daysPerStoryPoint: number | null = null;
    if (completedIssues.length > 0) {
      let totalStoryPoints = 0;
      let totalDays = 0;
      let issuesWithData = 0;

      for (const issue of completedIssues) {
        if (!issue.estimate) continue;
        const startTime = issue.started_at
          ? new Date(issue.started_at).getTime()
          : new Date(issue.created_at).getTime();
        const completedTime = issue.completed_at
          ? new Date(issue.completed_at).getTime()
          : new Date(issue.updated_at).getTime();
        const actualDays = (completedTime - startTime) / (1000 * 60 * 60 * 24);

        if (actualDays > 0) {
          totalStoryPoints += issue.estimate;
          totalDays += actualDays;
          issuesWithData++;
        }
      }

      if (issuesWithData > 0 && totalStoryPoints > 0) {
        daysPerStoryPoint = totalDays / totalStoryPoints;
      }
    }

    // Estimate completion date
    let estimatedEndDate: string | null = null;
    if (earliestCreatedAt) {
      const remainingIssues = projectIssues.length - completedCount;
      const daysElapsed = Math.max(
        1,
        (Date.now() - new Date(earliestCreatedAt).getTime()) /
          (1000 * 60 * 60 * 24)
      );
      const velocityPerDay = completedCount / daysElapsed;

      if (velocityPerDay > 0) {
        const daysToComplete = remainingIssues / velocityPerDay;
        const estimated = new Date();
        estimated.setDate(estimated.getDate() + daysToComplete);
        // Round up to end of month
        estimated.setMonth(estimated.getMonth() + 1, 0);
        estimated.setHours(23, 59, 59, 999);
        estimatedEndDate = estimated.toISOString();
      } else {
        // No velocity data, assume 6 months from now
        const estimated = new Date();
        estimated.setMonth(estimated.getMonth() + 6);
        estimated.setMonth(estimated.getMonth() + 1, 0);
        estimated.setHours(23, 59, 59, 999);
        estimatedEndDate = estimated.toISOString();
      }
    }

    // Convert Maps/Sets to JSON
    const issuesByStateJson = JSON.stringify(Object.fromEntries(issuesByState));
    const engineersJson = JSON.stringify(Array.from(engineers));
    const teamsJson = JSON.stringify(Array.from(teams));
    const velocityByTeamJson = JSON.stringify(
      Object.fromEntries(velocityByTeam)
    );

    // Get project labels from map or default to empty array
    const projectLabels = projectLabelsMap?.get(projectId) || [];
    const labelsJson =
      projectLabels.length > 0 ? JSON.stringify(projectLabels) : null;

    // Get project description from map
    const projectDescription = projectDescriptionsMap?.get(projectId) || null;

    const project: Project = {
      project_id: projectId,
      project_name: firstIssue.project_name || "Unknown Project",
      project_state: firstIssue.project_state,
      project_health: firstIssue.project_health,
      project_updated_at: firstIssue.project_updated_at,
      project_lead_id: firstIssue.project_lead_id,
      project_lead_name: firstIssue.project_lead_name,
      project_description: projectDescription,
      total_issues: projectIssues.length,
      completed_issues: completedCount,
      in_progress_issues: inProgressCount,
      engineer_count: engineers.size,
      missing_estimate_count: missingEstimateCount,
      missing_priority_count: missingPriorityCount,
      no_recent_comment_count: noRecentCommentCount,
      wip_age_violation_count: wipAgeViolationCount,
      missing_description_count: missingDescriptionCount,
      total_points: totalPoints.total,
      missing_points: totalPoints.missing,
      average_cycle_time: averageCycleTime,
      average_lead_time: averageLeadTime,
      linear_progress: linearProgress,
      velocity: velocity,
      estimate_accuracy: estimateAccuracy,
      days_per_story_point: daysPerStoryPoint,
      has_status_mismatch: hasStatusMismatchFlag ? 1 : 0,
      is_stale_update: isStaleUpdateFlag ? 1 : 0,
      missing_lead: missingLeadFlag ? 1 : 0,
      has_violations: hasViolationsFlag ? 1 : 0,
      missing_health: missingHealthFlag ? 1 : 0,
      start_date: earliestCreatedAt,
      last_activity_date: lastActivityDate,
      estimated_end_date: estimatedEndDate,
      issues_by_state: issuesByStateJson,
      engineers: engineersJson,
      teams: teamsJson,
      velocity_by_team: velocityByTeamJson,
      labels: labelsJson,
    };

    upsertProject(project);
  }

  // Delete projects that no longer exist
  const allProjects = getAllProjects();
  const projectsToDelete = allProjects
    .filter((p) => !activeProjectIds.has(p.project_id))
    .map((p) => p.project_id);

  if (projectsToDelete.length > 0) {
    deleteProjectsByProjectIds(projectsToDelete);
    console.log(
      `[SYNC] Deleted ${projectsToDelete.length} inactive project(s)`
    );
  }

  return activeProjectIds.size;
}

import type { ProjectUpdate, ProjectFullData } from "../../linear/client.js";
import type { Issue, Project } from "../../db/schema.js";
import {
  getAllIssues,
  getProjectById,
  upsertProject,
} from "../../db/queries.js";
import {
  hasStatusMismatch,
  isStaleUpdate,
  isMissingLead,
  isPlannedProject,
} from "../../utils/status-helpers.js";
import {
  hasViolations,
  hasMissingEstimate,
  hasMissingPriority,
  hasNoRecentComment,
  hasWIPAgeViolation,
  hasMissingDescription,
  hasMissingProjectScopedLabels,
} from "../../utils/issue-validators.js";
import {
  calculateTotalPoints,
  calculateAverageCycleTime,
  calculateAverageLeadTime,
  calculateLinearProgress,
  calculateVelocity,
  calculateVelocityByTeam,
  calculateEstimateAccuracy,
} from "../../lib/utils/project-helpers.js";

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
 * Data for projects with zero issues (from fetchProjectFullData)
 */
export interface EmptyProjectData {
  projectId: string;
  fullData: ProjectFullData;
}

/**
 * Compute project metrics from issues and store in projects table
 * @param skipDeletion - If true, skip deletion of inactive projects (used during incremental sync)
 * @param emptyProjects - Projects with zero issues that should still be stored
 * @param whitelistTeamKeys - Team keys to include (filters out teams not in this list)
 */
export async function computeAndStoreProjects(
  projectLabelsMap?: Map<string, string[]>,
  projectDescriptionsMap?: Map<string, string | null>,
  projectUpdatesMap?: Map<string, ProjectUpdate[]>,
  syncedProjectIds?: Set<string>,
  _skipDeletion: boolean = false,
  projectContentMap?: Map<string, string | null>,
  emptyProjects?: EmptyProjectData[],
  whitelistTeamKeys?: string[]
): Promise<number> {
  const syncTimestamp = syncedProjectIds ? new Date().toISOString() : null;
  const allIssues = getAllIssues();

  // Create whitelist set for efficient lookups
  const whitelistSet = whitelistTeamKeys?.length
    ? new Set(whitelistTeamKeys)
    : null;

  // Get allowed engineers from ENGINEER_TEAM_MAPPING (null = no filtering)
  const allowedEngineers = getAllowedEngineers();

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
    // Include all projects: active, planned, and completed
    // Previously we only included active projects, but now we want all projects
    // for planning views and historical views
    activeProjectIds.add(projectId);

    const firstIssue = projectIssues[0];
    const issuesByState = new Map<string, number>();
    const engineers = new Set<string>();
    const teams = new Set<string>();

    let lastActivityDate = firstIssue.updated_at;
    let earliestCreatedAt = firstIssue.created_at;
    let earliestStartedAt: string | null = firstIssue.started_at; // Track when work actually began
    let linearTargetDate: string | null = firstIssue.project_target_date; // Linear's target date
    let linearStartDate: string | null = firstIssue.project_start_date; // Linear's start date
    let linearCompletedAt: string | null = null; // Linear's completedAt date
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

      // Track engineers (filter by ENGINEER_TEAM_MAPPING if configured)
      if (issue.assignee_name) {
        if (
          !allowedEngineers ||
          allowedEngineers.has(issue.assignee_name.toLowerCase())
        ) {
          engineers.add(issue.assignee_name);
        }
      }

      // Track teams (filter by whitelist if set)
      if (!whitelistSet || whitelistSet.has(issue.team_key)) {
        teams.add(issue.team_key);
      }

      // Track latest activity
      if (new Date(issue.updated_at) > new Date(lastActivityDate)) {
        lastActivityDate = issue.updated_at;
      }

      // Track earliest creation
      if (new Date(issue.created_at) < new Date(earliestCreatedAt)) {
        earliestCreatedAt = issue.created_at;
      }

      // Track earliest started_at (when work actually began)
      if (issue.started_at) {
        if (
          !earliestStartedAt ||
          new Date(issue.started_at) < new Date(earliestStartedAt)
        ) {
          earliestStartedAt = issue.started_at;
        }
      }

      // Capture Linear's project target date (should be same for all issues in project)
      if (issue.project_target_date && !linearTargetDate) {
        linearTargetDate = issue.project_target_date;
      }
      if (issue.project_start_date && !linearStartDate) {
        linearStartDate = issue.project_start_date;
      }
      // Capture Linear's project completedAt date (should be same for all issues in project)
      if (issue.project_completed_at && !linearCompletedAt) {
        linearCompletedAt = issue.project_completed_at;
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

    // Count started issues (state_type === "started")
    const startedIssuesCount = projectIssues.filter(
      (i) => i.state_type === "started"
    ).length;

    // Check if project is in planning phase
    const projectStateCategory =
      firstIssue.project_state_category?.toLowerCase() || "";
    const isPlanningPhase = projectStateCategory.includes("planned");

    // Calculate flags
    const hasStatusMismatchFlag = hasStatusMismatch(
      firstIssue.project_state_category,
      projectIssues
    );
    const isStaleUpdateFlag = isStaleUpdate(lastActivityDate);
    const missingLeadFlag = isMissingLead(
      firstIssue.project_state_category,
      firstIssue.project_lead_name,
      projectIssues
    );
    const hasViolationsFlag = hasViolations(projectIssues);
    // Don't require health if project is in planning phase AND has zero started issues
    const missingHealthFlag =
      !firstIssue.project_health &&
      !(isPlanningPhase && startedIssuesCount === 0);

    // Check for missing RICE scoped labels (will be set below after we get existing project)
    let missingRICEScopedLabelsFlag = false;

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

    // Store Linear's target date (if available) - this is the project's explicit due date
    const targetDate = linearTargetDate
      ? new Date(linearTargetDate).toISOString()
      : null;

    // Always calculate velocity-based estimated completion date
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

    // Calculate date discrepancy flag (target vs predicted differ by >30 days)
    let hasDateDiscrepancyFlag = false;
    if (targetDate && estimatedEndDate) {
      const targetMs = new Date(targetDate).getTime();
      const predictedMs = new Date(estimatedEndDate).getTime();
      const diffDays = Math.abs(targetMs - predictedMs) / (1000 * 60 * 60 * 24);
      hasDateDiscrepancyFlag = diffDays > 30;
    }

    // Convert Maps/Sets to JSON
    const issuesByStateJson = JSON.stringify(Object.fromEntries(issuesByState));
    const engineersJson = JSON.stringify(Array.from(engineers));
    const teamsJson = JSON.stringify(Array.from(teams));
    const velocityByTeamJson = JSON.stringify(
      Object.fromEntries(velocityByTeam)
    );

    // Get existing project to check for existing labels/content
    const existingProject = getProjectById(projectId);

    // Get project labels from map, or preserve existing labels if project wasn't synced
    let projectLabels: string[] = [];
    if (projectLabelsMap?.has(projectId)) {
      projectLabels = projectLabelsMap.get(projectId) || [];
    } else if (existingProject?.labels) {
      // Preserve existing labels if project wasn't synced in this run
      try {
        projectLabels = JSON.parse(existingProject.labels) as string[];
      } catch (_e) {
        // Invalid JSON, use empty array
        projectLabels = [];
      }
    }
    const labelsJson =
      projectLabels.length > 0 ? JSON.stringify(projectLabels) : null;

    // Get project description from map
    const projectDescription = projectDescriptionsMap?.get(projectId) || null;

    // Get project content from map, or preserve existing content if project wasn't synced
    let projectContent: string | null = null;
    if (projectContentMap?.has(projectId)) {
      projectContent = projectContentMap.get(projectId) || null;
    } else if (existingProject?.project_content) {
      // Preserve existing content if project wasn't synced in this run
      projectContent = existingProject.project_content;
    }

    // Check for missing RICE scoped labels
    // Use existingProject we already fetched above
    if (existingProject) {
      missingRICEScopedLabelsFlag =
        hasMissingProjectScopedLabels(existingProject);
    }

    // Get project updates from map, sort by createdAt descending (newest first), and serialize to JSON
    // Only update project_updates if this project was synced in this run
    // Otherwise, preserve existing updates from the database
    let projectUpdatesJson: string | null = null;
    if (syncedProjectIds?.has(projectId)) {
      // Project was synced - use updates from map (or null if empty/not found)
      const projectUpdates = projectUpdatesMap?.get(projectId) || [];
      const sortedUpdates = projectUpdates.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      projectUpdatesJson =
        sortedUpdates.length > 0 ? JSON.stringify(sortedUpdates) : null;
    } else {
      // Project was not synced - preserve existing updates from database
      const existingProject = getProjectById(projectId);
      projectUpdatesJson = existingProject?.project_updates || null;
    }

    const project: Project = {
      project_id: projectId,
      project_name: firstIssue.project_name || "Unknown Project",
      project_state_category: firstIssue.project_state_category,
      project_status: firstIssue.project_status,
      project_health: firstIssue.project_health,
      project_updated_at: firstIssue.project_updated_at,
      project_lead_id: firstIssue.project_lead_id,
      project_lead_name: firstIssue.project_lead_name,
      project_lead_avatar_url: firstIssue.project_lead_avatar_url,
      project_description: projectDescription,
      project_content: projectContent,
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
      has_violations: hasViolationsFlag || missingRICEScopedLabelsFlag ? 1 : 0,
      missing_health: missingHealthFlag ? 1 : 0,
      has_date_discrepancy: hasDateDiscrepancyFlag ? 1 : 0,
      start_date: linearStartDate || earliestStartedAt || earliestCreatedAt, // Prefer Linear's start date, then started_at, fallback to created_at
      last_activity_date: lastActivityDate,
      estimated_end_date: estimatedEndDate,
      target_date: targetDate, // Linear's explicit target date for the project
      completed_at: linearCompletedAt
        ? new Date(linearCompletedAt).toISOString()
        : null, // Linear's completedAt date for the project
      issues_by_state: issuesByStateJson,
      engineers: engineersJson,
      teams: teamsJson,
      velocity_by_team: velocityByTeamJson,
      labels: labelsJson,
      project_updates: projectUpdatesJson,
      last_synced_at: syncedProjectIds?.has(projectId) ? syncTimestamp : null,
    };

    upsertProject(project);
  }

  // Handle empty projects (projects with zero issues)
  // These are typically planned projects that haven't had any issues created yet
  if (emptyProjects && emptyProjects.length > 0) {
    console.log(
      `[SYNC] Processing ${emptyProjects.length} project(s) with zero issues...`
    );

    for (const { projectId, fullData } of emptyProjects) {
      // Skip if this project was already processed via issues
      if (activeProjectIds.has(projectId)) {
        continue;
      }

      // Get teams from fullData, filtering by whitelist if set
      const allTeamKeys = fullData.teams?.map((t) => t.key) || [];
      const filteredTeamKeys = whitelistSet
        ? allTeamKeys.filter((key) => whitelistSet.has(key))
        : allTeamKeys;
      const teams = new Set<string>(filteredTeamKeys);

      // Skip empty projects that have no whitelisted teams
      if (teams.size === 0) {
        console.log(
          `[SYNC] Skipping empty project "${fullData.name}" (${projectId}) - no whitelisted teams (had: ${allTeamKeys.join(", ")})`
        );
        continue;
      }

      activeProjectIds.add(projectId);

      // Get project labels from fullData or map
      let projectLabels: string[] = fullData.labels || [];
      if (projectLabelsMap?.has(projectId)) {
        projectLabels = projectLabelsMap.get(projectId) || [];
      }

      // Get project updates from map
      const projectUpdates =
        projectUpdatesMap?.get(projectId) || fullData.updates || [];
      const sortedUpdates = projectUpdates.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      const projectUpdatesJson =
        sortedUpdates.length > 0 ? JSON.stringify(sortedUpdates) : null;

      // Calculate flags for empty projects
      const projectStateCategory = fullData.state || null;
      const isPlanningPhase = isPlannedProject(projectStateCategory);
      // For empty projects in planning phase, don't require health
      const missingHealthFlag = !fullData.health && !isPlanningPhase;
      // Missing lead if project is in planning phase but has no lead
      const missingLeadFlag = isPlanningPhase && !fullData.leadName;
      // Check stale update based on project's updatedAt
      const isStaleUpdateFlag = fullData.updatedAt
        ? isStaleUpdate(fullData.updatedAt)
        : true;

      const emptyProject: Project = {
        project_id: projectId,
        project_name: fullData.name || "Unknown Project",
        project_state_category: projectStateCategory,
        project_status: fullData.statusName || null,
        project_health: fullData.health || null,
        project_updated_at: fullData.updatedAt || null,
        project_lead_id: fullData.leadId || null,
        project_lead_name: fullData.leadName || null,
        project_lead_avatar_url: fullData.leadAvatarUrl || null,
        project_description: fullData.description || null,
        project_content: fullData.content || null,
        total_issues: 0,
        completed_issues: 0,
        in_progress_issues: 0,
        engineer_count: 0,
        missing_estimate_count: 0,
        missing_priority_count: 0,
        no_recent_comment_count: 0,
        wip_age_violation_count: 0,
        missing_description_count: 0,
        total_points: 0,
        missing_points: 0,
        average_cycle_time: null,
        average_lead_time: null,
        linear_progress: 0,
        velocity: 0,
        estimate_accuracy: null,
        days_per_story_point: null,
        has_status_mismatch: 0, // No issues, so no mismatch possible
        is_stale_update: isStaleUpdateFlag ? 1 : 0,
        missing_lead: missingLeadFlag ? 1 : 0,
        has_violations: 0, // No issues, so no violations
        missing_health: missingHealthFlag ? 1 : 0,
        has_date_discrepancy: 0, // No velocity data, so can't calculate discrepancy
        start_date: fullData.startDate || null,
        last_activity_date: fullData.updatedAt || new Date().toISOString(),
        estimated_end_date: null, // No velocity data to estimate
        target_date: fullData.targetDate || null,
        completed_at: fullData.completedAt || null,
        issues_by_state: JSON.stringify({}),
        engineers: JSON.stringify([]),
        teams: JSON.stringify(Array.from(teams)),
        velocity_by_team: JSON.stringify({}),
        labels: projectLabels.length > 0 ? JSON.stringify(projectLabels) : null,
        project_updates: projectUpdatesJson,
        last_synced_at: syncedProjectIds?.has(projectId) ? syncTimestamp : null,
      };

      upsertProject(emptyProject);
      console.log(
        `[SYNC] Stored empty project: ${emptyProject.project_name} (${projectId})`
      );
    }
  }

  // Note: We no longer delete projects - all data is preserved for historical tracking

  return activeProjectIds.size;
}

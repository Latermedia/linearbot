import { createLinearClient } from "../linear/client.js";
import {
  getExistingIssueIds,
  upsertIssue,
  deleteIssuesByTeams,
  getTotalIssueCount,
} from "../db/queries.js";

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
    console.log('[SYNC] Testing Linear API connection...');
    const connected = await linearClient.testConnection();

    if (!connected) {
      console.error('[SYNC] Failed to connect to Linear API');
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
    console.log('[SYNC] Linear API connection successful');

    // Fetch issues (step 1 of N+1 where N is number of projects)
    const allIssues = await linearClient.fetchStartedIssues((count) => {
      callbacks?.onIssueCountUpdate?.(count);
    });
    console.log(`[SYNC] Fetched ${allIssues.length} started issues from Linear`);

    // Filter ignored teams
    const startedIssues = allIssues.filter(
      (issue) => !ignoredTeamKeys.includes(issue.teamKey)
    );
    if (ignoredTeamKeys.length > 0) {
      const filteredCount = allIssues.length - startedIssues.length;
      console.log(`[SYNC] Filtered out ${filteredCount} issues from ${ignoredTeamKeys.length} ignored team(s)`);
    }

    // Phase 2: Fetch all issues for projects with active work (optional)
    let projectIssues: typeof allIssues = [];
    let projectCount = 0;

    if (includeProjectSync) {
      const activeProjectIds = new Set(
        startedIssues
          .filter((issue) => issue.projectId)
          .map((issue) => issue.projectId as string)
      );

      projectCount = activeProjectIds.size;
      callbacks?.onProjectCountUpdate?.(projectCount);
      console.log(`[SYNC] Found ${projectCount} active project(s) with started issues`);

      if (activeProjectIds.size > 0) {
        // Total steps = 1 (started issues) + N (projects)
        const totalSteps = 1 + projectCount;
        
        // Step 1 complete (started issues)
        callbacks?.onProgressPercent?.(Math.round((1 / totalSteps) * 100));
        
        projectIssues = await linearClient.fetchIssuesByProjects(
          Array.from(activeProjectIds),
          (count, pageSize, projectIndex, totalProjects) => {
            callbacks?.onProjectIssueCountUpdate?.(count);
            // Update progress when starting a new project (pageSize is undefined at start)
            // When projectIndex is 0, we're starting the first project (1 step done: started issues)
            // When projectIndex is 1, we've completed project 0 (2 steps done: started + project 0)
            if (projectIndex !== undefined && totalProjects !== undefined && totalSteps > 0 && pageSize === undefined) {
              // Completed steps: 1 (started issues) + projectIndex (completed projects)
              const completedSteps = 1 + projectIndex;
              const percent = Math.min(Math.round((completedSteps / totalSteps) * 100), 99);
              callbacks?.onProgressPercent?.(percent);
            }
          }
        );
        // All projects complete - set to 100%
        callbacks?.onProgressPercent?.(100);
        console.log(`[SYNC] Fetched ${projectIssues.length} issues from ${projectCount} project(s)`);
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
    for (const issue of [...startedIssues, ...projectIssues]) {
      allIssuesMap.set(issue.id, issue);
    }
    const issues = Array.from(allIssuesMap.values());
    const totalBeforeDedup = startedIssues.length + projectIssues.length;
    const duplicatesRemoved = totalBeforeDedup - issues.length;
    if (duplicatesRemoved > 0) {
      console.log(`[SYNC] Deduplicated: ${duplicatesRemoved} duplicate issue(s) removed (${totalBeforeDedup} → ${issues.length})`);
    }

    // Store in database (final step, already at 100% if no projects, otherwise maintain)
    const existingIds = getExistingIssueIds();
    console.log(`[SYNC] Found ${existingIds.size} existing issue(s) in database`);

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
        url: issue.url,
        project_id: issue.projectId,
        project_name: issue.projectName,
        project_state: issue.projectState,
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
      console.log(`[SYNC] Removed issues from ${ignoredTeamKeys.length} ignored team(s)`);
    }

    // Get total count
    const total = getTotalIssueCount();
    console.log(`[SYNC] Database now contains ${total} total issue(s)`);

    // Count started issues for reporting
    const startedCount = issues.filter((i) => i.stateType === "started").length;

    console.log(`[SYNC] Summary - New: ${newIssues}, Updated: ${updatedIssues}, Started: ${startedCount}, Projects: ${projectCount}, Project Issues: ${projectIssues.length}`);

    return {
      success: true,
      newCount: newIssues,
      updatedCount: updatedIssues,
      totalCount: total,
      issueCount: startedCount,
      projectCount,
      projectIssueCount: projectIssues.length,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    console.error(`[SYNC] Sync error: ${errorMessage}`, error);
    return {
      success: false,
      newCount: 0,
      updatedCount: 0,
      totalCount: 0,
      issueCount: 0,
      projectCount: 0,
      projectIssueCount: 0,
      error: errorMessage,
    };
  }
}


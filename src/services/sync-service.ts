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
    const connected = await linearClient.testConnection();

    if (!connected) {
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

    // Fetch issues
    const allIssues = await linearClient.fetchStartedIssues((count) => {
      callbacks?.onIssueCountUpdate?.(count);
    });

    // Filter ignored teams
    const startedIssues = allIssues.filter(
      (issue) => !ignoredTeamKeys.includes(issue.teamKey)
    );

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

      if (activeProjectIds.size > 0) {
        projectIssues = await linearClient.fetchIssuesByProjects(
          Array.from(activeProjectIds),
          (count) => {
            callbacks?.onProjectIssueCountUpdate?.(count);
          }
        );
      }
    }

    // Combine all issues and deduplicate
    const allIssuesMap = new Map<string, (typeof allIssues)[0]>();
    for (const issue of [...startedIssues, ...projectIssues]) {
      allIssuesMap.set(issue.id, issue);
    }
    const issues = Array.from(allIssuesMap.values());

    // Store in database
    const existingIds = getExistingIssueIds();

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
    }

    // Get total count
    const total = getTotalIssueCount();

    // Count started issues for reporting
    const startedCount = issues.filter((i) => i.stateType === "started").length;

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
    return {
      success: false,
      newCount: 0,
      updatedCount: 0,
      totalCount: 0,
      issueCount: 0,
      projectCount: 0,
      projectIssueCount: 0,
      error: error instanceof Error ? error.message : "An unknown error occurred",
    };
  }
}


import { getDatabase } from "../db/connection.js";
import { createLinearClient } from "../linear/client.js";
import type { Issue } from "../db/schema.js";

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
    const db = getDatabase();

    const getExistingIssueIds = db.prepare(`SELECT id FROM issues`);
    const existingIds = new Set(
      (getExistingIssueIds.all() as { id: string }[]).map((row) => row.id)
    );

    const upsertIssue = db.prepare(`
      INSERT INTO issues (
        id, identifier, title, description, team_id, team_name, team_key,
        state_id, state_name, state_type,
        assignee_id, assignee_name, priority, estimate, last_comment_at,
        created_at, updated_at, url,
        project_id, project_name, project_state, project_updated_at,
        project_lead_id, project_lead_name
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        identifier = excluded.identifier,
        title = excluded.title,
        description = excluded.description,
        team_id = excluded.team_id,
        team_name = excluded.team_name,
        team_key = excluded.team_key,
        state_id = excluded.state_id,
        state_name = excluded.state_name,
        state_type = excluded.state_type,
        assignee_id = excluded.assignee_id,
        assignee_name = excluded.assignee_name,
        priority = excluded.priority,
        estimate = excluded.estimate,
        last_comment_at = excluded.last_comment_at,
        updated_at = excluded.updated_at,
        url = excluded.url,
        project_id = excluded.project_id,
        project_name = excluded.project_name,
        project_state = excluded.project_state,
        project_updated_at = excluded.project_updated_at,
        project_lead_id = excluded.project_lead_id,
        project_lead_name = excluded.project_lead_name
    `);

    let newIssues = 0;
    let updatedIssues = 0;

    const syncTransaction = db.transaction(() => {
      for (const issue of issues) {
        if (existingIds.has(issue.id)) {
          updatedIssues++;
        } else {
          newIssues++;
        }

        upsertIssue.run(
          issue.id,
          issue.identifier,
          issue.title,
          issue.description,
          issue.teamId,
          issue.teamName,
          issue.teamKey,
          issue.stateId,
          issue.stateName,
          issue.stateType,
          issue.assigneeId,
          issue.assigneeName,
          issue.priority,
          issue.estimate,
          issue.lastCommentAt ? issue.lastCommentAt.toISOString() : null,
          issue.createdAt.toISOString(),
          issue.updatedAt.toISOString(),
          issue.url,
          issue.projectId,
          issue.projectName,
          issue.projectState,
          issue.projectUpdatedAt ? issue.projectUpdatedAt.toISOString() : null,
          issue.projectLeadId,
          issue.projectLeadName
        );
      }
    });

    syncTransaction();

    // Remove ignored teams from database
    if (ignoredTeamKeys.length > 0) {
      const placeholders = ignoredTeamKeys.map(() => "?").join(",");
      const deleteIgnored = db.prepare(`
        DELETE FROM issues WHERE team_key IN (${placeholders})
      `);
      deleteIgnored.run(...ignoredTeamKeys);
    }

    // Get total count
    const getTotalCount = db.prepare(`SELECT COUNT(*) as count FROM issues`);
    const total = (getTotalCount.get() as { count: number }).count;

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


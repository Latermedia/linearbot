import { getDatabase } from "../db/connection.js";
import { createLinearClient } from "../linear/client.js";
import { displayError, displaySyncSummary } from "../ui/display.js";
import {
  ProgressDisplay,
  formatProgress,
  formatElapsed,
} from "../ui/progress.js";

export async function syncIssues(): Promise<void> {
  const startTime = Date.now();
  const progress = new ProgressDisplay();

  try {
    console.log("\n🔄 Syncing from Linear...\n");

    // Get ignored team keys from environment
    const ignoredTeamKeys = process.env.IGNORED_TEAM_KEYS
      ? process.env.IGNORED_TEAM_KEYS.split(",").map((key) => key.trim())
      : [];

    if (ignoredTeamKeys.length > 0) {
      console.log(`🚫 Ignoring teams: ${ignoredTeamKeys.join(", ")}\n`);
    }

    // Initialize Linear client
    progress.update("🔌 Connecting to Linear...\n");
    const linearClient = createLinearClient();

    // Test connection
    const connected = await linearClient.testConnection();
    if (!connected) {
      progress.clear();
      displayError("Failed to connect to Linear. Please check your API key.");
      return;
    }

    // Get database
    const db = getDatabase();

    // Fetch all issues with state.type = "started" in ONE query!
    progress.update(
      `📥 Fetching issues with 'started' state from Linear...\n` +
        `   Issues found: 0\n` +
        `   Elapsed: ${formatElapsed(startTime)}\n`
    );

    const allIssues = await linearClient.fetchStartedIssues(
      (issuesCount, lastPageSize) => {
        progress.update(
          `📥 Fetching issues with 'started' state from Linear...\n` +
            `   Issues found: ${issuesCount} (+${lastPageSize} this page)\n` +
            `   Elapsed: ${formatElapsed(startTime)}\n`
        );
      }
    );

    // Filter out ignored teams
    const startedIssues = allIssues.filter(
      (issue) => !ignoredTeamKeys.includes(issue.teamKey)
    );

    const ignoredCount = allIssues.length - startedIssues.length;
    if (ignoredCount > 0) {
      progress.update(
        `✓ Fetched ${allIssues.length} started issues, filtered ${ignoredCount} from ignored teams\n` +
          `  Elapsed: ${formatElapsed(startTime)}\n\n`
      );
    }

    // Phase 2: Fetch all issues for active projects
    const activeProjectIds = new Set(
      startedIssues
        .filter((issue) => issue.projectId)
        .map((issue) => issue.projectId as string)
    );

    let projectIssues: typeof allIssues = [];
    if (activeProjectIds.size > 0) {
      progress.update(
        `📦 Fetching all issues for ${activeProjectIds.size} active projects...\n` +
          `   Additional issues found: 0\n` +
          `   Elapsed: ${formatElapsed(startTime)}\n`
      );

      projectIssues = await linearClient.fetchIssuesByProjects(
        Array.from(activeProjectIds),
        (projectIssueCount) => {
          progress.update(
            `📦 Fetching all issues for ${activeProjectIds.size} active projects...\n` +
              `   Additional issues found: ${projectIssueCount}\n` +
              `   Elapsed: ${formatElapsed(startTime)}\n`
          );
        }
      );

      progress.update(
        `✓ Fetched ${projectIssues.length} additional issues from ${activeProjectIds.size} projects\n` +
          `  Elapsed: ${formatElapsed(startTime)}\n\n`
      );
    }

    // Combine and deduplicate
    const allIssuesMap = new Map<string, (typeof allIssues)[0]>();
    for (const issue of [...startedIssues, ...projectIssues]) {
      allIssuesMap.set(issue.id, issue);
    }
    const issues = Array.from(allIssuesMap.values());

    if (issues.length === 0) {
      progress.clear();
      console.log("⚠️  No issues found in 'started' states.");
      if (ignoredCount > 0) {
        console.log(
          `\n${ignoredCount} issues were filtered out from ignored teams.\n`
        );
      } else {
        console.log(
          "\nThis means no issues are currently in progress across all teams.\n"
        );
      }
      return;
    }

    progress.update(
      `✓ Fetched ${issues.length} issues in 'started' states\n` +
        `  Elapsed: ${formatElapsed(startTime)}\n\n`
    );

    // Store issues in database
    progress.update(
      `✓ Fetched ${issues.length} issues\n` +
        `💾 Storing in database...\n` +
        `  Elapsed: ${formatElapsed(startTime)}\n`
    );

    // Track existing issues
    const getExistingIssueIds = db.prepare(`
      SELECT id FROM issues
    `);
    const existingIds = new Set(
      (getExistingIssueIds.all() as { id: string }[]).map((row) => row.id)
    );

    // Insert or update issues
    const upsertIssue = db.prepare(`
      INSERT INTO issues (
        id, identifier, title, description, team_id, team_name, team_key,
        state_id, state_name, state_type,
        assignee_id, assignee_name, priority, 
        created_at, updated_at, url,
        project_id, project_name, project_state, project_updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        updated_at = excluded.updated_at,
        url = excluded.url,
        project_id = excluded.project_id,
        project_name = excluded.project_name,
        project_state = excluded.project_state,
        project_updated_at = excluded.project_updated_at
    `);

    let newCount = 0;
    let updatedCount = 0;

    const syncIssuesTransaction = db.transaction(() => {
      for (const issue of issues) {
        if (existingIds.has(issue.id)) {
          updatedCount++;
        } else {
          newCount++;
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
          issue.createdAt.toISOString(),
          issue.updatedAt.toISOString(),
          issue.url,
          issue.projectId,
          issue.projectName,
          issue.projectState,
          issue.projectUpdatedAt ? issue.projectUpdatedAt.toISOString() : null
        );
      }
    });

    syncIssuesTransaction();

    // Clean up old issues: remove issues that are no longer in "started" state
    // These are issues in the DB but not in our current fetch
    const fetchedIds = new Set(issues.map((i) => i.id));
    const idsToDelete = Array.from(existingIds).filter(
      (id) => !fetchedIds.has(id)
    );

    let cleanedCount = 0;
    if (idsToDelete.length > 0) {
      const placeholders = idsToDelete.map(() => "?").join(",");
      const deleteStale = db.prepare(`
        DELETE FROM issues WHERE id IN (${placeholders})
      `);
      const result = deleteStale.run(...idsToDelete);
      cleanedCount = result.changes;
    }

    // Remove any issues from ignored teams
    let removedCount = 0;
    if (ignoredTeamKeys.length > 0) {
      const placeholders = ignoredTeamKeys.map(() => "?").join(",");
      const deleteIgnored = db.prepare(`
        DELETE FROM issues WHERE team_key IN (${placeholders})
      `);
      const result = deleteIgnored.run(...ignoredTeamKeys);
      removedCount = result.changes;
    }

    // Get total count of issues in database
    const getTotalCount = db.prepare(`SELECT COUNT(*) as count FROM issues`);
    const totalCount = (getTotalCount.get() as { count: number }).count;

    // Clear progress and show final summary
    progress.clear();

    console.log("✓ Sync complete!\n");
    displaySyncSummary(newCount, updatedCount, totalCount);
    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned up ${cleanedCount} issues no longer in WIP\n`);
    }
    if (removedCount > 0) {
      console.log(`Removed ${removedCount} issues from ignored teams\n`);
    }
    console.log(`Total time: ${formatElapsed(startTime)}\n`);
    console.log("Next step: Run 'bun start list' to view active issues.\n");

    // Exit cleanly after sync
    process.exit(0);
  } catch (error) {
    progress.clear();
    if (error instanceof Error) {
      displayError(error.message);
    } else {
      displayError("An unknown error occurred");
    }
    process.exit(1);
  }
}

import {
  createLinearClient,
  type ProjectUpdate,
  RateLimitError,
  type LinearIssueData,
} from "../../linear/client.js";
import { isMockMode, generateMockData } from "../mock-data.js";
import {
  getTotalIssueCount,
  updateSyncMetadata,
  setSyncStatus,
  setSyncProgress,
} from "../../db/queries.js";
import type { SyncResult, SyncCallbacks } from "./types.js";
import { writeIssuesToDatabase } from "./utils.js";
import { computeAndStoreProjects } from "./compute-projects.js";
import { computeAndStoreEngineers } from "./compute-engineers.js";

/**
 * Sync a single project by project ID
 * @param projectId - The Linear project ID to sync
 * @param callbacks - Optional callbacks for progress updates
 */
export async function syncProject(
  projectId: string,
  callbacks?: SyncCallbacks
): Promise<SyncResult> {
  let cumulativeNewCount = 0;
  let cumulativeUpdatedCount = 0;

  try {
    setSyncStatus("syncing");
    updateSyncMetadata({ sync_error: null, sync_progress_percent: 0 });

    if (isMockMode()) {
      console.log("[SYNC] Mock mode: skipping project sync");
      const mockData = generateMockData();
      const ignoredTeamKeys = process.env.IGNORED_TEAM_KEYS
        ? process.env.IGNORED_TEAM_KEYS.split(",").map((key) => key.trim())
        : [];
      const projectMockIssues = mockData.issues.filter(
        (i: LinearIssueData) =>
          i.projectId === projectId && !ignoredTeamKeys.includes(i.teamKey)
      );
      const counts = writeIssuesToDatabase(projectMockIssues);
      cumulativeNewCount += counts.newCount;
      cumulativeUpdatedCount += counts.updatedCount;

      callbacks?.onProgressPercent?.(100);
      setSyncProgress(100);

      const syncTime = new Date().toISOString();
      setSyncStatus("idle");
      updateSyncMetadata({
        last_sync_time: syncTime,
        sync_error: null,
        sync_progress_percent: null,
      });

      const total = getTotalIssueCount();
      return {
        success: true,
        newCount: counts.newCount,
        updatedCount: counts.updatedCount,
        totalCount: total,
        issueCount: projectMockIssues.length,
        projectCount: 1,
        projectIssueCount: projectMockIssues.length,
      };
    }

    const linearClient = createLinearClient();
    callbacks?.onProgressPercent?.(10);
    setSyncProgress(10);

    console.log(`[SYNC] Testing Linear API connection...`);
    const connected = await linearClient.testConnection();

    if (!connected) {
      const errorMsg = "Failed to connect to Linear. Check your API key.";
      console.error("[SYNC] Failed to connect to Linear API");
      setSyncStatus("error");
      updateSyncMetadata({ sync_error: errorMsg, sync_progress_percent: null });
      return {
        success: false,
        newCount: 0,
        updatedCount: 0,
        totalCount: 0,
        issueCount: 0,
        projectCount: 0,
        projectIssueCount: 0,
        error: errorMsg,
      };
    }
    console.log("[SYNC] Linear API connection successful");

    callbacks?.onProgressPercent?.(30);
    setSyncProgress(30);

    console.log(`[SYNC] Fetching issues for project: ${projectId}`);
    let projectIssues: LinearIssueData[] = [];
    let projectName: string | null = null;

    try {
      projectIssues = await linearClient.fetchIssuesByProjects(
        [projectId],
        (count, pageSize, projectIndex, totalProjects) => {
          callbacks?.onProjectIssueCountUpdate?.(count);
          if (projectIndex !== undefined && totalProjects !== undefined) {
            const percent = Math.min(30 + Math.round((count / 100) * 50), 80);
            callbacks?.onProgressPercent?.(percent);
            setSyncProgress(percent);
          }
        }
      );

      if (projectIssues.length > 0 && projectIssues[0].projectName) {
        projectName = projectIssues[0].projectName;
        callbacks?.onProjectProgress?.(1, 1, projectName);
      }

      if (projectIssues.length > 0) {
        // Get ignored team keys from environment
        const ignoredTeamKeys = process.env.IGNORED_TEAM_KEYS
          ? process.env.IGNORED_TEAM_KEYS.split(",").map((key) => key.trim())
          : [];

        // Filter out ignored teams before writing to database
        const filteredIssues =
          ignoredTeamKeys.length > 0
            ? projectIssues.filter(
                (issue) => !ignoredTeamKeys.includes(issue.teamKey)
              )
            : projectIssues;

        if (filteredIssues.length !== projectIssues.length) {
          console.log(
            `[SYNC] Filtered out ${projectIssues.length - filteredIssues.length} issues from ignored teams`
          );
        }

        if (filteredIssues.length > 0) {
          console.log(
            `[SYNC] Writing ${filteredIssues.length} project issues to database...`
          );
          const counts = writeIssuesToDatabase(filteredIssues);
          cumulativeNewCount += counts.newCount;
          cumulativeUpdatedCount += counts.updatedCount;
          // Update stats incrementally after writing issues
          callbacks?.onIssueCountsUpdate?.(
            cumulativeNewCount,
            cumulativeUpdatedCount
          );
        }
      }

      callbacks?.onProgressPercent?.(80);
      setSyncProgress(80);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error(`[SYNC] Error fetching project issues:`, errorMessage);

      if (error instanceof RateLimitError) {
        const errorMsg = "Rate limit exceeded during project sync";
        console.error(`[SYNC] ${errorMsg}`);
        setSyncStatus("error");
        updateSyncMetadata({
          sync_error: errorMsg,
          sync_progress_percent: null,
        });
        const total = getTotalIssueCount();
        return {
          success: false,
          newCount: cumulativeNewCount,
          updatedCount: cumulativeUpdatedCount,
          totalCount: total,
          issueCount: 0,
          projectCount: 0,
          projectIssueCount: projectIssues.length,
          error: errorMsg,
        };
      }
      throw error;
    }

    // Fetch all project metadata in a single consolidated API call
    // This replaces separate calls for data (labels/content) and updates
    const projectLabelsMap = new Map<string, string[]>();
    const projectContentMap = new Map<string, string | null>();
    const projectDescriptionsMap = new Map<string, string | null>();
    const projectUpdatesMap = new Map<string, ProjectUpdate[]>();

    try {
      const fullData = await linearClient.fetchProjectFullData(projectId);
      projectLabelsMap.set(projectId, fullData.labels);
      projectContentMap.set(projectId, fullData.content);
      projectDescriptionsMap.set(projectId, fullData.description);
      projectUpdatesMap.set(projectId, fullData.updates);
      if (fullData.updates.length > 0) {
        console.log(
          `[SYNC] Fetched ${fullData.updates.length} project update(s) for project: ${projectId}`
        );
      }
    } catch (error) {
      console.error(
        `[SYNC] Failed to fetch project data for ${projectId}:`,
        error instanceof Error ? error.message : error
      );
      // Continue without metadata - it's optional
      projectDescriptionsMap.set(projectId, null);
      projectUpdatesMap.set(projectId, []);
    }

    console.log(`[SYNC] Computing project metrics...`);
    callbacks?.onProgressPercent?.(90);
    setSyncProgress(90);

    const computedProjectCount = await computeAndStoreProjects(
      projectLabelsMap,
      projectDescriptionsMap,
      projectUpdatesMap,
      new Set([projectId]),
      false,
      projectContentMap
    );

    console.log(`[SYNC] Computing engineer WIP metrics...`);
    computeAndStoreEngineers();

    callbacks?.onProgressPercent?.(100);
    setSyncProgress(100);

    const syncTime = new Date().toISOString();
    setSyncStatus("idle");
    updateSyncMetadata({
      last_sync_time: syncTime,
      sync_error: null,
      sync_progress_percent: null,
    });

    const total = getTotalIssueCount();
    console.log(
      `[SYNC] Project sync complete - New: ${cumulativeNewCount}, Updated: ${cumulativeUpdatedCount}, Total: ${total}, Project Issues: ${projectIssues.length}`
    );

    // Final update to ensure counts are accurate (eventually consistent)
    callbacks?.onIssueCountsUpdate?.(
      cumulativeNewCount,
      cumulativeUpdatedCount
    );

    return {
      success: true,
      newCount: cumulativeNewCount,
      updatedCount: cumulativeUpdatedCount,
      totalCount: total,
      issueCount: projectIssues.length,
      projectCount: computedProjectCount,
      projectIssueCount: projectIssues.length,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`[SYNC] Project sync error:`, errorMessage);

    const isSchemaError =
      (errorMessage.includes("values for") &&
        errorMessage.includes("columns")) ||
      errorMessage.includes("no such column") ||
      errorMessage.includes("table_info");

    const finalError = isSchemaError
      ? `${errorMessage}\n\n💡 Tip: This looks like a schema mismatch. Try resetting the database:\n   bun run reset-db`
      : errorMessage;

    setSyncStatus("error");
    updateSyncMetadata({
      sync_error: finalError,
      sync_progress_percent: null,
    });

    return {
      success: false,
      newCount: cumulativeNewCount,
      updatedCount: cumulativeUpdatedCount,
      totalCount: 0,
      issueCount: 0,
      projectCount: 0,
      projectIssueCount: 0,
      error: finalError,
    };
  }
}

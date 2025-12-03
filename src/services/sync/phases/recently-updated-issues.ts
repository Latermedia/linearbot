import type { LinearIssueData } from "../../../linear/client.js";
import { RateLimitError } from "../../../linear/client.js";
import type { PartialSyncState } from "../../../db/queries.js";
import {
  savePartialSyncState,
  setSyncProgress,
  setSyncStatus,
  setSyncStatusMessage,
  updateSyncMetadata,
} from "../../../db/queries.js";
import { PROJECT_THRESHOLDS } from "../../../constants/thresholds.js";
import { writeIssuesToDatabase } from "../utils.js";
import type { PhaseContext } from "../types.js";

export interface RecentlyUpdatedIssuesResult {
  recentlyUpdatedIssues: LinearIssueData[];
  newCount: number;
  updatedCount: number;
}

export async function syncRecentlyUpdatedIssues(
  context: PhaseContext,
  startedIssues: LinearIssueData[]
): Promise<RecentlyUpdatedIssuesResult> {
  const {
    linearClient,
    callbacks,
    existingPartialSync,
    isResuming,
    ignoredTeamKeys,
    apiQueryCount,
    updatePhase,
    shouldRunPhase,
    getProjectSyncLimit,
  } = context;

  let recentlyUpdatedIssues: LinearIssueData[] = [];
  let newCount = 0;
  let updatedCount = 0;

  if (!shouldRunPhase("recently_updated_issues")) {
    console.log("[SYNC] Skipping recently updated issues phase (not selected)");
    return { recentlyUpdatedIssues, newCount, updatedCount };
  }

  updatePhase("recently_updated_issues");
  callbacks?.onProgressPercent?.(10);
  setSyncProgress(10);
  setSyncStatusMessage("Fetching recently updated issues...");

  if (
    !isResuming ||
    !existingPartialSync ||
    existingPartialSync.initialIssuesSync === "incomplete"
  ) {
    try {
      // In LIMIT_SYNC mode, use 12 hours (0.5 days) instead of 14 days
      const limitSync = getProjectSyncLimit() !== null;
      const daysToFetch = limitSync
        ? 0.5
        : PROJECT_THRESHOLDS.RECENT_ACTIVITY_DAYS;

      recentlyUpdatedIssues = await linearClient.fetchRecentlyUpdatedIssues(
        daysToFetch,
        (count) => {
          setSyncStatusMessage(
            `Fetching recently updated issues... (${count} found)`
          );
        }
      );
      console.log(
        `[SYNC] Fetched ${recentlyUpdatedIssues.length} recently updated issues from Linear`
      );

      // Filter ignored teams from recently updated issues
      recentlyUpdatedIssues = recentlyUpdatedIssues.filter(
        (issue) => !ignoredTeamKeys.includes(issue.teamKey)
      );

      // Deduplicate: remove issues that are already in startedIssues
      const startedIssueIds = new Set(startedIssues.map((i) => i.id));
      recentlyUpdatedIssues = recentlyUpdatedIssues.filter(
        (issue) => !startedIssueIds.has(issue.id)
      );

      // Write recently updated issues to database (deduplicated)
      if (recentlyUpdatedIssues.length > 0) {
        console.log(
          `[SYNC] Writing ${recentlyUpdatedIssues.length} recently updated issues to database...`
        );
        const counts = writeIssuesToDatabase(recentlyUpdatedIssues);
        newCount = counts.newCount;
        updatedCount = counts.updatedCount;
        console.log(
          `[SYNC] Wrote recently updated issues - New: ${counts.newCount}, Updated: ${counts.updatedCount}`
        );
      }
    } catch (error) {
      if (error instanceof RateLimitError) {
        // Save partial sync state before exiting
        const partialState: PartialSyncState = {
          currentPhase: "recently_updated_issues",
          initialIssuesSync: "complete",
          projectSyncs: [],
        };
        savePartialSyncState(partialState);
        const errorMsg =
          "Rate limit exceeded during recently updated issues sync";
        console.error(`[SYNC] ${errorMsg}`);
        setSyncStatus("error");
        updateSyncMetadata({
          sync_error: errorMsg,
          sync_progress_percent: null,
          api_query_count: apiQueryCount,
        });
        throw error;
      }
      // For non-rate-limit errors, log but continue (recently updated issues are supplementary)
      console.error(
        `[SYNC] Error fetching recently updated issues (continuing anyway):`,
        error instanceof Error ? error.message : error
      );
    }
  }

  // Phase complete - set to 20%
  callbacks?.onProgressPercent?.(20);
  setSyncProgress(20);

  return { recentlyUpdatedIssues, newCount, updatedCount };
}

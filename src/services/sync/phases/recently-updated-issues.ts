import type { LinearIssueData } from "../../../linear/client.js";
import { RateLimitError } from "../../../linear/client.js";
import type { PartialSyncState } from "../../../db/queries.js";
import {
  savePartialSyncState,
  setSyncProgress,
  setSyncStatus,
  setSyncStatusMessage,
  updateSyncMetadata,
  getSyncMetadata,
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
      // Determine days to fetch based on sync options:
      // Priority order:
      // 1. LIMIT_SYNC mode: 0.5 days (12 hours) - ALWAYS takes priority for local testing
      // 2. Incremental sync: use time since last successful sync
      // 3. Deep history sync: 365 days (1 year)
      // 4. Default: 14 days
      const limitSync = getProjectSyncLimit() !== null;
      const deepHistorySync = context.syncOptions?.deepHistorySync ?? false;
      const incrementalSync = context.syncOptions?.incrementalSync ?? false;

      let daysToFetch: number;
      let syncModeLabel: string;
      let maxIssues: number | undefined;

      if (limitSync) {
        // LIMIT_SYNC always takes priority - for local testing to avoid API rate limits
        // Use a generous time window but limit to 10 issues
        daysToFetch = PROJECT_THRESHOLDS.RECENT_ACTIVITY_DAYS;
        maxIssues = 10;
        syncModeLabel = "limited (max 10 issues)";
        if (incrementalSync || deepHistorySync) {
          console.log(
            `[SYNC] LIMIT_SYNC=true overrides ${incrementalSync ? "incremental" : "deep history"} mode`
          );
        }
      } else if (incrementalSync) {
        // Calculate days since last successful sync
        const syncMetadata = getSyncMetadata();
        const lastSyncTime = syncMetadata?.last_sync_time
          ? new Date(syncMetadata.last_sync_time)
          : null;

        if (lastSyncTime) {
          const now = new Date();
          const msSinceLastSync = now.getTime() - lastSyncTime.getTime();
          // Convert to days, add a small buffer (1 hour = 1/24 day)
          daysToFetch = Math.max(
            msSinceLastSync / (1000 * 60 * 60 * 24) + 1 / 24,
            0.1
          );
          const hoursAgo = Math.round(msSinceLastSync / (1000 * 60 * 60));
          syncModeLabel = `incremental (since ${hoursAgo}h ago)`;
          console.log(
            `[SYNC] Incremental sync: fetching issues updated since ${lastSyncTime.toISOString()} (${daysToFetch.toFixed(2)} days)`
          );
        } else {
          // No last sync time, fall back to default
          daysToFetch = PROJECT_THRESHOLDS.RECENT_ACTIVITY_DAYS;
          syncModeLabel = `incremental fallback (${PROJECT_THRESHOLDS.RECENT_ACTIVITY_DAYS} days - no previous sync found)`;
          console.log(
            `[SYNC] Incremental sync requested but no previous sync found, using default ${PROJECT_THRESHOLDS.RECENT_ACTIVITY_DAYS} days`
          );
        }
      } else if (deepHistorySync) {
        daysToFetch = PROJECT_THRESHOLDS.DEEP_HISTORY_DAYS;
        syncModeLabel = "deep history (1 year)";
      } else {
        daysToFetch = PROJECT_THRESHOLDS.RECENT_ACTIVITY_DAYS;
        syncModeLabel = `default (${PROJECT_THRESHOLDS.RECENT_ACTIVITY_DAYS} days)`;
      }

      console.log(
        `[SYNC] Fetching recently updated issues (${syncModeLabel})...`
      );

      recentlyUpdatedIssues = await linearClient.fetchRecentlyUpdatedIssues(
        daysToFetch,
        (count) => {
          const modeIndicator = limitSync
            ? " (limited)"
            : incrementalSync
              ? " (incremental)"
              : deepHistorySync
                ? " (deep history)"
                : "";
          setSyncStatusMessage(
            `Fetching recently updated issues${modeIndicator}... (${count} found)`
          );
        },
        maxIssues
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

import type { LinearIssueData } from "../../../linear/client.js";
import { RateLimitError } from "../../../linear/client.js";
import type { PartialSyncState } from "../../../db/queries.js";
import {
  getStartedIssues,
  savePartialSyncState,
  setSyncProgress,
  setSyncStatus,
  updateSyncMetadata,
} from "../../../db/queries.js";
import { convertDbIssueToLinearFormat } from "../utils.js";
import { writeIssuesToDatabase } from "../utils.js";
import type { PhaseContext } from "../types.js";

export interface InitialIssuesResult {
  allIssues: LinearIssueData[];
  newCount: number;
  updatedCount: number;
}

export async function syncInitialIssues(
  context: PhaseContext
): Promise<InitialIssuesResult> {
  const {
    linearClient,
    callbacks,
    existingPartialSync,
    isResuming,
    apiQueryCount,
    updatePhase,
    shouldRunPhase,
  } = context;

  let allIssues: LinearIssueData[] = [];
  let newCount = 0;
  let updatedCount = 0;

  if (!shouldRunPhase("initial_issues")) {
    // Phase skipped - load started issues from database if they exist
    console.log("[SYNC] Skipping initial issues phase (not selected)");
    const dbStartedIssues = getStartedIssues();
    allIssues = dbStartedIssues.map(convertDbIssueToLinearFormat);
    console.log(
      `[SYNC] Loaded ${allIssues.length} started issues from database`
    );
    return { allIssues, newCount, updatedCount };
  }

  updatePhase("initial_issues");
  callbacks?.onProgressPercent?.(5);
  setSyncProgress(5);

  if (
    !isResuming ||
    !existingPartialSync ||
    existingPartialSync.initialIssuesSync === "incomplete"
  ) {
    // Fetch started issues from Linear API
    try {
      allIssues = await linearClient.fetchStartedIssues((count) => {
        callbacks?.onIssueCountUpdate?.(count);
      });
      console.log(
        `[SYNC] Fetched ${allIssues.length} started issues from Linear`
      );
    } catch (error) {
      if (error instanceof RateLimitError) {
        // Write any partial data we might have before exiting
        const partialState: PartialSyncState = {
          currentPhase: "initial_issues",
          initialIssuesSync: "incomplete",
          projectSyncs: [],
        };
        savePartialSyncState(partialState);
        const errorMsg = "Rate limit exceeded during initial issues sync";
        console.error(`[SYNC] ${errorMsg}`);
        setSyncStatus("error");
        updateSyncMetadata({
          sync_error: errorMsg,
          sync_progress_percent: null,
          api_query_count: apiQueryCount,
        });
        throw error;
      }
      throw error;
    }
  } else {
    // Resuming with initial sync complete - load started issues from database
    console.log(
      "[SYNC] Loading started issues from database for project sync determination"
    );
    const dbStartedIssues = getStartedIssues();
    allIssues = dbStartedIssues.map(convertDbIssueToLinearFormat);
    console.log(
      `[SYNC] Loaded ${allIssues.length} started issues from database`
    );
  }

  // Filter ignored teams
  const startedIssues = allIssues.filter(
    (issue) => !context.ignoredTeamKeys.includes(issue.teamKey)
  );

  // Write started issues to database immediately after fetching
  // Skip writing if resuming with initial sync complete (they're already in the database)
  if (
    startedIssues.length > 0 &&
    (!isResuming ||
      !existingPartialSync ||
      existingPartialSync.initialIssuesSync === "incomplete")
  ) {
    console.log(
      `[SYNC] Writing ${startedIssues.length} started issues to database...`
    );
    const counts = writeIssuesToDatabase(startedIssues);
    newCount = counts.newCount;
    updatedCount = counts.updatedCount;
    console.log(
      `[SYNC] Wrote started issues - New: ${counts.newCount}, Updated: ${counts.updatedCount}`
    );
  } else if (
    isResuming &&
    existingPartialSync &&
    existingPartialSync.initialIssuesSync === "complete"
  ) {
    console.log(
      `[SYNC] Skipping write of started issues (already in database from previous sync)`
    );
  }

  return { allIssues: startedIssues, newCount, updatedCount };
}

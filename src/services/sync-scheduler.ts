import { performSync } from "./sync-service.js";
import { getSyncMetadata, getPartialSyncState } from "../db/queries.js";

const SYNC_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Run a scheduled sync (shared logic for both cron and interval)
 */
async function runScheduledSync(): Promise<void> {
  try {
    // Skip sync in local development mode
    const isProduction = process.env.NODE_ENV === "production";
    if (!isProduction) {
      console.log(
        "[SCHEDULER] Scheduled sync skipped in local development mode"
      );
      return;
    }

    // Check if sync already running
    const metadata = getSyncMetadata();
    if (metadata?.sync_status === "syncing") {
      console.log(
        "[SCHEDULER] Sync already in progress, skipping scheduled sync"
      );
      return;
    }

    // Check for recent errors (not rate limit related)
    // If there's an error that's not rate limit related, skip retry and wait for next scheduled sync
    if (metadata?.sync_status === "error" && metadata?.sync_error) {
      const errorMsg = metadata.sync_error.toLowerCase();
      const isRateLimitError = errorMsg.includes("rate limit");
      const hasPartialSync = getPartialSyncState() !== null;

      // Only skip if it's a non-rate-limit error and no partial sync exists
      if (!isRateLimitError && !hasPartialSync) {
        console.log(
          "[SCHEDULER] Previous sync had non-rate-limit error, skipping retry until next scheduled sync"
        );
        return;
      }
    }

    console.log("[SCHEDULER] Triggering scheduled sync...");
    const result = await performSync(true);

    if (result.success) {
      console.log(
        `[SCHEDULER] Scheduled sync completed successfully - New: ${result.newCount}, Updated: ${result.updatedCount}, Total: ${result.totalCount}`
      );
    } else {
      console.error(`[SCHEDULER] Scheduled sync failed: ${result.error}`);
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`[SCHEDULER] Error during scheduled sync: ${errorMessage}`);
  }
}

/**
 * Initialize the sync scheduler with a cron job or interval that runs every 10 minutes
 */
export function initializeSyncScheduler(): void {
  console.log(
    "[SYNC-SCHEDULER] Initializing sync scheduler (every 30 minutes)"
  );

  // Check if Bun.cron is available (Bun-specific API)
  if (
    typeof Bun !== "undefined" &&
    "cron" in Bun &&
    typeof (Bun as any).cron === "function"
  ) {
    try {
      (Bun as any).cron("*/30 * * * *", runScheduledSync);
      console.log("[SYNC-SCHEDULER] Using Bun.cron for scheduled syncs");
      return;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.warn(
        `[SYNC-SCHEDULER] Bun.cron failed: ${errorMsg}, falling back to setInterval`
      );
    }
  }

  // Fallback to setInterval if Bun.cron is not available
  console.log("[SYNC-SCHEDULER] Using setInterval for scheduled syncs");
  setInterval(runScheduledSync, SYNC_INTERVAL_MS);

  console.log("[SYNC-SCHEDULER] Sync scheduler initialized successfully");
}

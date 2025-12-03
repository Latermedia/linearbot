import { getDatabase } from "../db/connection.js";
import {
  getTotalIssueCount,
  getSyncMetadata,
  updateSyncMetadata,
} from "../db/queries.js";
import { initializeSyncScheduler } from "./sync-scheduler.js";

let startupInitialized = false;

/**
 * Initialize database and set up hourly sync scheduler.
 * Data is persistent, so no immediate sync is triggered on startup.
 * This runs once when the server starts.
 */
export function initializeStartup(): void {
  if (startupInitialized) {
    return;
  }
  startupInitialized = true;

  console.log("[STARTUP] Initializing application...");

  // Initialize database (lazy initialization on first access)
  // This ensures the database and schema are ready
  try {
    getDatabase();
    console.log("[STARTUP] Database initialized");

    // Reset sync status if it's stuck in "syncing" state (e.g., from a deployment during sync)
    // This ensures users can trigger a new sync after deployment
    const syncMetadata = getSyncMetadata();
    if (syncMetadata?.sync_status === "syncing") {
      console.log(
        "[STARTUP] Resetting sync status from 'syncing' to 'idle' (sync was interrupted by deployment)"
      );
      updateSyncMetadata({
        sync_status: "idle",
        sync_error: null,
        sync_progress_percent: null,
        partial_sync_state: null,
        sync_status_message: null,
      });
    }

    // Check for empty database in development and show helpful message
    const isProduction = process.env.NODE_ENV === "production";
    if (!isProduction) {
      const issueCount = getTotalIssueCount();
      if (issueCount === 0) {
        console.log(
          "[STARTUP] ℹ️  No data found. Run 'bun run sync' to generate mock data or set LINEAR_API_KEY for real data."
        );
      }
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[STARTUP] Failed to initialize database: ${errorMsg}`);
    return;
  }

  // Initialize sync scheduler (hourly syncs in production)
  try {
    initializeSyncScheduler();
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[STARTUP] Failed to initialize sync scheduler: ${errorMsg}`);
  }

  console.log("[STARTUP] Startup initialization complete");
}

import { getDatabase } from "../db/connection.js";
import { performSync } from "./sync-service.js";
import { initializeSyncScheduler } from "./sync-scheduler.js";

let startupInitialized = false;

/**
 * Initialize database, trigger startup sync, and set up cron scheduler
 * This runs once when the server starts
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
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[STARTUP] Failed to initialize database: ${errorMsg}`);
    return;
  }

  // Initialize sync scheduler (cron job for periodic syncs)
  try {
    initializeSyncScheduler();
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[STARTUP] Failed to initialize sync scheduler: ${errorMsg}`);
  }

  // Trigger initial sync (non-blocking)
  // Don't await - let server start serving requests immediately
  performSync(true)
    .then((result) => {
      if (result.success) {
        console.log(
          `[STARTUP] Initial sync completed successfully - New: ${result.newCount}, Updated: ${result.updatedCount}, Total: ${result.totalCount}`
        );
      } else {
        console.error(`[STARTUP] Initial sync failed: ${result.error}`);
      }
    })
    .catch((error) => {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error(`[STARTUP] Error during initial sync: ${errorMessage}`);
    });

  console.log("[STARTUP] Startup initialization complete");
}


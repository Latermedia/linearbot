import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { performSync } from "../../../services/sync-service.js";
import { getSyncState, setSyncState, updateSyncStats } from "./state.js";

const MIN_SYNC_INTERVAL_MS = 60 * 1000; // 1 minute

export const POST: RequestHandler = async () => {
  const syncState = getSyncState();

  // Check if sync is already running
  if (syncState.isRunning) {
    console.log("[SYNC] Request rejected: sync already in progress");
    return json(
      {
        success: false,
        message: "Sync already in progress",
        status: syncState.status,
      },
      { status: 409 }
    );
  }

  // Check rate limiting: only sync if last sync was OVER 1 minute ago
  const now = Date.now();
  if (syncState.lastSyncTime !== null) {
    const timeSinceLastSync = now - syncState.lastSyncTime;
    if (timeSinceLastSync < MIN_SYNC_INTERVAL_MS) {
      const waitTime = Math.ceil(
        (MIN_SYNC_INTERVAL_MS - timeSinceLastSync) / 1000
      );
      console.log(
        `[SYNC] Request rate limited: last sync ${Math.floor(timeSinceLastSync / 1000)}s ago, wait ${waitTime}s`
      );
      return json(
        {
          success: false,
          message: `Please wait ${waitTime} seconds before syncing again`,
          status: syncState.status,
          lastSyncTime: syncState.lastSyncTime,
        },
        { status: 429 }
      );
    }
  }

  // Start sync (non-blocking)
  const syncStartTime = Date.now();
  console.log("[SYNC] Starting sync...");
  setSyncState({
    isRunning: true,
    status: "syncing",
    error: undefined,
    progressPercent: 0,
    stats: {
      startedIssuesCount: 0,
      totalProjectsCount: 0,
      currentProjectIndex: 0,
      currentProjectName: null,
      projectIssuesCount: 0,
    },
  });

  // Run sync asynchronously
  performSync(true, {
    onProgressPercent: (percent) => {
      setSyncState({ progressPercent: percent });
    },
    onIssueCountUpdate: (count) => {
      updateSyncStats({ startedIssuesCount: count });
    },
    onProjectCountUpdate: (count) => {
      updateSyncStats({ totalProjectsCount: count });
    },
    onProjectIssueCountUpdate: (count) => {
      updateSyncStats({ projectIssuesCount: count });
    },
    onProjectProgress: (index, total, projectName) => {
      updateSyncStats({
        currentProjectIndex: index,
        totalProjectsCount: total,
        currentProjectName: projectName,
      });
    },
  })
    .then((result) => {
      const duration = Date.now() - syncStartTime;
      if (result.success) {
        console.log(
          `[SYNC] Completed successfully in ${duration}ms - New: ${result.newCount}, Updated: ${result.updatedCount}, Total: ${result.totalCount}, Issues: ${result.issueCount}, Projects: ${result.projectCount}`
        );
        setSyncState({
          isRunning: false,
          status: "idle",
          lastSyncTime: Date.now(),
          progressPercent: undefined,
          stats: undefined,
        });
      } else {
        console.error(
          `[SYNC] Failed after ${duration}ms: ${result.error || "Sync failed"}`
        );
        setSyncState({
          isRunning: false,
          status: "error",
          error: result.error || "Sync failed",
          progressPercent: undefined,
          stats: undefined,
        });
      }
    })
    .catch((error) => {
      const duration = Date.now() - syncStartTime;
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error(`[SYNC] Error after ${duration}ms:`, errorMessage);
      setSyncState({
        isRunning: false,
        status: "error",
        error: errorMessage,
        progressPercent: undefined,
        stats: undefined,
      });
    });

  return json({
    success: true,
    message: "Sync started",
    status: "syncing",
  });
};

import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getSyncState } from "../state.js";
import {
  getSyncMetadata,
  getPartialSyncState,
} from "../../../../db/queries.js";

export const GET: RequestHandler = async () => {
  // Read from database (primary source)
  const dbMetadata = getSyncMetadata();

  // Also check in-memory state for isRunning flag (for immediate updates during sync)
  const syncState = getSyncState();

  // Convert last_sync_time from ISO string to timestamp if present
  const lastSyncTime = dbMetadata?.last_sync_time
    ? new Date(dbMetadata.last_sync_time).getTime()
    : null;

  // Get partial sync state
  const partialSyncState = getPartialSyncState();

  // Calculate partial sync progress if available
  let partialSyncProgress: { completed: number; total: number } | null = null;
  if (partialSyncState) {
    const completedProjects = partialSyncState.projectSyncs.filter(
      (p) => p.status === "complete"
    ).length;
    const totalProjects = partialSyncState.projectSyncs.length;
    if (totalProjects > 0) {
      partialSyncProgress = {
        completed: completedProjects,
        total: totalProjects,
      };
    }
  }

  return json({
    status: dbMetadata?.sync_status || syncState.status || "idle",
    isRunning: syncState.isRunning || dbMetadata?.sync_status === "syncing",
    lastSyncTime: lastSyncTime || syncState.lastSyncTime,
    error: dbMetadata?.sync_error || syncState.error,
    progressPercent:
      dbMetadata?.sync_progress_percent ?? syncState.progressPercent,
    hasPartialSync: partialSyncState !== null,
    partialSyncProgress,
  });
};

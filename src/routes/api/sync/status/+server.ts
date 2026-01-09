import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getSyncState } from "../state.js";
import {
  getSyncMetadata,
  type SyncPhase,
  type PartialSyncState,
} from "../../../../db/queries.js";

/**
 * Get list of all sync phases in order
 */
function getAllSyncPhases(): Array<{ phase: SyncPhase; label: string }> {
  return [
    { phase: "initial_issues", label: "Initial Issues" },
    { phase: "recently_updated_issues", label: "Recently Updated Issues" },
    { phase: "active_projects", label: "Active Projects" },
    { phase: "planned_projects", label: "Planned Projects" },
    { phase: "completed_projects", label: "Completed Projects" },
    { phase: "computing_metrics", label: "Computing Metrics" },
    { phase: "complete", label: "Complete" },
  ];
}

export const GET: RequestHandler = async () => {
  const syncState = getSyncState();

  // If sync is running, serve purely from in-memory state to avoid blocking on SQLite.
  // The worker streams DB metadata snapshots into syncState while syncing.
  if (syncState.isRunning || syncState.status === "syncing") {
    const lastSyncTime = syncState.lastSyncTime ?? null;
    const currentPhase = syncState.currentPhase ?? null;

    const allPhases = getAllSyncPhases();
    const phases = allPhases.map(({ phase, label }) => {
      let status: "pending" | "in_progress" | "complete" = "pending";
      if (currentPhase) {
        const currentIndex = allPhases.findIndex(
          (p) => p.phase === currentPhase
        );
        const phaseIndex = allPhases.findIndex((p) => p.phase === phase);
        if (phaseIndex < currentIndex) {
          status = "complete";
        } else if (phaseIndex === currentIndex) {
          status = "in_progress";
        }
      }
      return { phase, label, status };
    });

    return json({
      status: syncState.status || "syncing",
      isRunning: true,
      lastSyncTime,
      error: syncState.error ?? null,
      progressPercent: syncState.progressPercent ?? null,
      hasPartialSync: syncState.hasPartialSync ?? false,
      partialSyncProgress: syncState.partialSyncProgress ?? null,
      currentPhase,
      phases,
      stats: syncState.stats ?? null,
      syncingProjectId: syncState.syncingProjectId ?? null,
      apiQueryCount: syncState.apiQueryCount ?? null,
      statusMessage: syncState.statusMessage ?? null,
    });
  }

  // Otherwise (idle), read from database (primary source) - single query for both metadata and partial state
  const dbMetadata = getSyncMetadata();

  // Convert last_sync_time from ISO string to timestamp if present
  const lastSyncTime = dbMetadata?.last_sync_time
    ? new Date(dbMetadata.last_sync_time).getTime()
    : null;

  // Parse partial sync state from metadata (already fetched above)
  // This avoids a second database query - we already have partial_sync_state from getSyncMetadata()
  let partialSyncState: PartialSyncState | null = null;
  if (dbMetadata?.partial_sync_state) {
    try {
      partialSyncState = JSON.parse(
        dbMetadata.partial_sync_state
      ) as PartialSyncState;
    } catch (error) {
      console.error("[API] Failed to parse partial sync state:", error);
      partialSyncState = null;
    }
  }

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

  // Build phase list with status
  const allPhases = getAllSyncPhases();
  const currentPhase = partialSyncState?.currentPhase || null;
  const phases = allPhases.map(({ phase, label }) => {
    let status: "pending" | "in_progress" | "complete" = "pending";
    if (currentPhase) {
      const currentIndex = allPhases.findIndex((p) => p.phase === currentPhase);
      const phaseIndex = allPhases.findIndex((p) => p.phase === phase);
      if (phaseIndex < currentIndex) {
        status = "complete";
      } else if (phaseIndex === currentIndex) {
        status = "in_progress";
      }
    } else if (dbMetadata?.sync_status === "idle" && !partialSyncState) {
      // All phases complete if sync is idle and no partial state
      status = "complete";
    }
    return { phase, label, status };
  });

  return json({
    status: dbMetadata?.sync_status || syncState.status || "idle",
    isRunning: syncState.isRunning || dbMetadata?.sync_status === "syncing",
    lastSyncTime: lastSyncTime || syncState.lastSyncTime,
    error: dbMetadata?.sync_error || syncState.error,
    progressPercent:
      dbMetadata?.sync_progress_percent ?? syncState.progressPercent,
    hasPartialSync: partialSyncState !== null,
    partialSyncProgress,
    currentPhase,
    phases,
    // Include detailed sync stats from in-memory state
    stats: syncState.stats ?? null,
    // Include project sync info
    syncingProjectId: syncState.syncingProjectId ?? null,
    // Include API query count
    apiQueryCount: dbMetadata?.api_query_count ?? null,
    // Include human-readable status message
    statusMessage: dbMetadata?.sync_status_message ?? null,
  });
};

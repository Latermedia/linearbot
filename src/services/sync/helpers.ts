import type { SyncPhase } from "../../db/queries.js";
import { getPartialSyncState, savePartialSyncState } from "../../db/queries.js";

/**
 * Get the maximum number of projects/initiatives to sync per type
 * Defaults to no limit (full sync). Set LIMIT_SYNC=true to limit to 10 for local development
 */
export function getProjectSyncLimit(): number | null {
  const limitSync = process.env.LIMIT_SYNC === "true";
  if (limitSync) {
    return 10; // Limit to 10 when LIMIT_SYNC is enabled
  }
  return null; // null means no limit (default: full sync)
}

/**
 * Concurrency limit for parallel project processing
 */
export const PROJECT_SYNC_CONCURRENCY = 5;

/**
 * Create a helper function to check if a phase should run
 */
export function createShouldRunPhase(syncOptions?: {
  phases: SyncPhase[];
}): (phase: SyncPhase) => boolean {
  return (phase: SyncPhase): boolean => {
    if (!syncOptions) {
      // Default behavior: run all phases if no options provided
      return true;
    }
    return syncOptions.phases.includes(phase);
  };
}

/**
 * Default API query counts per phase (for full sync, ~2000 total)
 * These are estimates and will be replaced with actual counts after first sync
 */
const DEFAULT_PHASE_QUERY_COUNTS: Record<SyncPhase, number> = {
  initial_issues: 50,
  recently_updated_issues: 100,
  active_projects: 1200,
  planned_projects: 200,
  completed_projects: 300,
  initiatives: 50,
  initiative_projects: 100,
  computing_metrics: 0, // No API queries, just computation
  complete: 0,
};

/**
 * Get expected query count for a phase
 * Uses historical data if available, otherwise defaults
 */
export function getExpectedQueryCountForPhase(
  phase: SyncPhase,
  historicalCounts: Record<string, number> | null
): number {
  if (historicalCounts && historicalCounts[phase] !== undefined) {
    return historicalCounts[phase];
  }
  return DEFAULT_PHASE_QUERY_COUNTS[phase] || 0;
}

/**
 * Calculate total expected queries for given phases
 */
export function calculateExpectedTotalQueries(
  phases: SyncPhase[],
  historicalCounts: Record<string, number> | null
): number {
  return phases.reduce((total, phase) => {
    return total + getExpectedQueryCountForPhase(phase, historicalCounts);
  }, 0);
}

/**
 * Create a helper function to update phase and save partial sync state
 * Returns a function that updates the phase and a ref object to track current phase
 */
export function createUpdatePhase(): {
  updatePhase: (phase: SyncPhase) => void;
  currentPhaseRef: { current: SyncPhase };
} {
  const currentPhaseRef: { current: SyncPhase } = { current: "initial_issues" };
  const updatePhase = (phase: SyncPhase) => {
    currentPhaseRef.current = phase;
    // Always try to update partial sync state if it exists
    const existingPartialSync = getPartialSyncState();
    if (existingPartialSync) {
      existingPartialSync.currentPhase = phase;
      savePartialSyncState(existingPartialSync);
    }
  };
  return { updatePhase, currentPhaseRef };
}

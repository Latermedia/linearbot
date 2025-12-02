import type { SyncPhase } from "../../db/queries.js";
import {
  getPartialSyncState,
  savePartialSyncState,
} from "../../db/queries.js";

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
export function createShouldRunPhase(
  syncOptions?: { phases: SyncPhase[] }
): (phase: SyncPhase) => boolean {
  return (phase: SyncPhase): boolean => {
    if (!syncOptions) {
      // Default behavior: run all phases if no options provided
      return true;
    }
    return syncOptions.phases.includes(phase);
  };
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


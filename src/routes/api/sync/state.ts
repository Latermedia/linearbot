// Simple in-memory sync state (ephemeral, minimal value)
// Favoring simplicity over resilience per requirements

export interface SyncStats {
  startedIssuesCount: number;
  totalProjectsCount: number;
  currentProjectIndex: number;
  currentProjectName: string | null;
  projectIssuesCount: number;
}

export interface SyncState {
  isRunning: boolean;
  lastSyncTime: number | null;
  status: "idle" | "syncing" | "error";
  error?: string;
  progressPercent?: number;
  stats?: SyncStats;
}

let syncState: SyncState = {
  isRunning: false,
  lastSyncTime: null,
  status: "idle",
};

export function getSyncState(): SyncState {
  return syncState;
}

export function setSyncState(state: Partial<SyncState>): void {
  syncState = { ...syncState, ...state };
}

export function updateSyncStats(stats: Partial<SyncStats>): void {
  syncState.stats = { ...syncState.stats, ...stats } as SyncStats;
}

export function resetSyncState(): void {
  syncState = {
    isRunning: false,
    lastSyncTime: null,
    status: "idle",
  };
}

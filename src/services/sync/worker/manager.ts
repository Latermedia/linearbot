import type { SyncOptions, SyncResult } from "../types.js";
import type { SyncJob, WorkerResponseMessage } from "./types.js";
import {
  getSyncState,
  setSyncState,
  updateSyncStats,
} from "../../../routes/api/sync/state.js";

type WorkerHandle = {
  worker: Worker;
  currentJob: SyncJob | null;
  resolve: ((result: SyncResult) => void) | null;
  reject: ((error: Error) => void) | null;
};

let handle: WorkerHandle | null = null;

function createWorker(): Worker {
  // In production builds this is typically emitted as `.js`; in dev it may remain `.ts`.
  try {
    return new Worker(new URL("./worker.js", import.meta.url), {
      type: "module",
    });
  } catch {
    return new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    });
  }
}

function ensureHandle(): WorkerHandle {
  if (handle) return handle;

  const worker = createWorker();
  handle = { worker, currentJob: null, resolve: null, reject: null };

  worker.addEventListener(
    "message",
    (event: MessageEvent<WorkerResponseMessage>) => {
      const msg = event.data;
      if (!msg || typeof msg !== "object") return;

      if (msg.type === "progress") {
        setSyncState({
          progressPercent: msg.progressPercent ?? undefined,
          apiQueryCount: msg.apiQueryCount,
        });
        return;
      }

      if (msg.type === "stats") {
        updateSyncStats(msg.stats);
        return;
      }

      if (msg.type === "metadata") {
        setSyncState({
          status: msg.status,
          apiQueryCount: msg.apiQueryCount ?? undefined,
          statusMessage: msg.statusMessage ?? null,
          currentPhase: msg.currentPhase ?? null,
          hasPartialSync: msg.hasPartialSync,
          partialSyncProgress: msg.partialSyncProgress ?? null,
        });
        return;
      }

      if (msg.type === "done") {
        const resolve = handle?.resolve;
        handle!.resolve = null;
        handle!.reject = null;
        handle!.currentJob = null;

        if (msg.result.success) {
          setSyncState({
            isRunning: false,
            status: "idle",
            error: undefined,
            lastSyncTime: Date.now(),
            progressPercent: undefined,
            syncingProjectId: undefined,
            stats: undefined,
            statusMessage: null,
            apiQueryCount: undefined,
            currentPhase: null,
            hasPartialSync: false,
            partialSyncProgress: null,
          });
        } else {
          setSyncState({
            isRunning: false,
            status: "error",
            error: msg.result.error || "Sync failed",
            progressPercent: undefined,
            syncingProjectId: undefined,
            stats: undefined,
          });
        }
        resolve?.(msg.result);
        return;
      }

      if (msg.type === "error") {
        const reject = handle?.reject;
        handle!.resolve = null;
        handle!.reject = null;
        handle!.currentJob = null;

        setSyncState({
          isRunning: false,
          status: "error",
          error: msg.error,
          progressPercent: undefined,
          syncingProjectId: undefined,
          stats: undefined,
        });

        reject?.(new Error(msg.error));
        return;
      }
    }
  );

  return handle;
}

function assertNoSyncRunning() {
  const state = getSyncState();
  if (state.isRunning) {
    throw new Error("Sync already in progress");
  }
}

export async function startFullSync(options: {
  includeProjectSync: boolean;
  syncOptions?: SyncOptions;
}): Promise<SyncResult> {
  assertNoSyncRunning();
  const h = ensureHandle();

  const job: SyncJob = {
    type: "full",
    includeProjectSync: options.includeProjectSync,
    syncOptions: options.syncOptions,
  };

  h.currentJob = job;
  setSyncState({
    isRunning: true,
    status: "syncing",
    error: undefined,
    syncingProjectId: undefined,
    progressPercent: 0,
    statusMessage: "Starting sync...",
    apiQueryCount: 0,
    currentPhase: null,
    hasPartialSync: false,
    partialSyncProgress: null,
    stats: {
      startedIssuesCount: 0,
      totalProjectsCount: 0,
      currentProjectIndex: 0,
      currentProjectName: null,
      projectIssuesCount: 0,
      newCount: 0,
      updatedCount: 0,
    },
  });

  return await new Promise<SyncResult>((resolve, reject) => {
    h.resolve = resolve;
    h.reject = reject;
    h.worker.postMessage({ type: "run", job });
  });
}

export async function startProjectSync(projectId: string): Promise<SyncResult> {
  assertNoSyncRunning();
  const h = ensureHandle();

  const job: SyncJob = { type: "project", projectId };
  h.currentJob = job;

  setSyncState({
    isRunning: true,
    status: "syncing",
    error: undefined,
    syncingProjectId: projectId,
    progressPercent: 0,
    statusMessage: "Starting project sync...",
    apiQueryCount: 0,
    currentPhase: null,
    hasPartialSync: false,
    partialSyncProgress: null,
    stats: {
      startedIssuesCount: 0,
      totalProjectsCount: 1,
      currentProjectIndex: 0,
      currentProjectName: null,
      projectIssuesCount: 0,
      newCount: 0,
      updatedCount: 0,
    },
  });

  return await new Promise<SyncResult>((resolve, reject) => {
    h.resolve = resolve;
    h.reject = reject;
    h.worker.postMessage({ type: "run", job });
  });
}

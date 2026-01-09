import { performSync, syncProject } from "../index.js";
import type { SyncPhase, SyncMetadata } from "../../../db/queries.js";
import { getSyncMetadata } from "../../../db/queries.js";
import type {
  WorkerRequestMessage,
  WorkerResponseMessage,
  SyncJob,
} from "./types.js";

function post(msg: WorkerResponseMessage) {
  postMessage(msg);
}

function computePartialProgress(partialSyncStateRaw: string | null): {
  currentPhase: SyncPhase | null;
  hasPartialSync: boolean;
  partialSyncProgress: { completed: number; total: number } | null;
} {
  if (!partialSyncStateRaw) {
    return {
      currentPhase: null,
      hasPartialSync: false,
      partialSyncProgress: null,
    };
  }

  try {
    const parsed = JSON.parse(partialSyncStateRaw) as {
      currentPhase?: SyncPhase;
      projectSyncs?: Array<{ status: "complete" | "incomplete" }>;
    };

    const projectSyncs = parsed.projectSyncs ?? [];
    const total = projectSyncs.length;
    const completed = projectSyncs.filter(
      (p) => p.status === "complete"
    ).length;

    return {
      currentPhase: parsed.currentPhase ?? null,
      hasPartialSync: true,
      partialSyncProgress: total > 0 ? { completed, total } : null,
    };
  } catch {
    return {
      currentPhase: null,
      hasPartialSync: false,
      partialSyncProgress: null,
    };
  }
}

function snapshotMetadata(metadata: SyncMetadata | null) {
  const partial = computePartialProgress(metadata?.partial_sync_state ?? null);
  post({
    type: "metadata",
    status: metadata?.sync_status ?? "idle",
    apiQueryCount: metadata?.api_query_count ?? null,
    statusMessage: metadata?.sync_status_message ?? null,
    currentPhase: partial.currentPhase ?? null,
    hasPartialSync: partial.hasPartialSync,
    partialSyncProgress: partial.partialSyncProgress,
  });
}

let running = false;

async function runJob(job: SyncJob): Promise<void> {
  if (running) {
    post({
      type: "error",
      error: "Worker is already running a sync",
      finishedAt: Date.now(),
    });
    return;
  }

  running = true;
  const startedAt = Date.now();
  post({ type: "started", job, startedAt });

  // While the sync runs, periodically snapshot DB metadata so the main thread can
  // serve `/api/sync/status` without touching SQLite.
  const metadataIntervalId = setInterval(() => {
    try {
      const m = getSyncMetadata();
      snapshotMetadata(m);
    } catch {
      // ignore
    }
  }, 500) as unknown as number;

  try {
    const callbacks = {
      onProgressPercent: (progressPercent: number, apiQueryCount: number) => {
        post({ type: "progress", progressPercent, apiQueryCount });
      },
      onIssueCountUpdate: (startedIssuesCount: number) => {
        post({ type: "stats", stats: { startedIssuesCount } });
      },
      onProjectCountUpdate: (totalProjectsCount: number) => {
        post({ type: "stats", stats: { totalProjectsCount } });
      },
      onProjectIssueCountUpdate: (projectIssuesCount: number) => {
        post({ type: "stats", stats: { projectIssuesCount } });
      },
      onProjectProgress: (
        currentProjectIndex: number,
        totalProjectsCount: number,
        currentProjectName: string | null
      ) => {
        post({
          type: "stats",
          stats: {
            currentProjectIndex,
            totalProjectsCount,
            currentProjectName,
          },
        });
      },
      onIssueCountsUpdate: (newCount: number, updatedCount: number) => {
        post({ type: "stats", stats: { newCount, updatedCount } });
      },
    };

    const result =
      job.type === "full"
        ? await performSync(job.includeProjectSync, callbacks, job.syncOptions)
        : await syncProject(job.projectId, callbacks);

    clearInterval(metadataIntervalId);
    try {
      snapshotMetadata(getSyncMetadata());
    } catch {
      // ignore
    }

    post({ type: "done", result, finishedAt: Date.now() });
  } catch (err) {
    clearInterval(metadataIntervalId);
    const error =
      err instanceof Error ? err.message : "Unknown error in sync worker";
    post({ type: "error", error, finishedAt: Date.now() });
  } finally {
    running = false;
  }
}

addEventListener("message", (event: MessageEvent<WorkerRequestMessage>) => {
  const msg = event.data;
  if (!msg || msg.type !== "run") return;
  void runJob(msg.job);
});

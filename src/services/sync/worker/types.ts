import type { SyncOptions, SyncResult } from "../types.js";

export type SyncJob =
  | {
      type: "full";
      includeProjectSync: boolean;
      syncOptions?: SyncOptions;
    }
  | {
      type: "project";
      projectId: string;
    };

export type WorkerRequestMessage = {
  type: "run";
  job: SyncJob;
};

export type WorkerResponseMessage =
  | {
      type: "started";
      job: SyncJob;
      startedAt: number;
    }
  | {
      type: "progress";
      progressPercent: number | null;
      apiQueryCount: number;
      currentPhase: string | null;
    }
  | {
      type: "stats";
      stats: {
        startedIssuesCount?: number;
        totalProjectsCount?: number;
        currentProjectIndex?: number;
        currentProjectName?: string | null;
        projectIssuesCount?: number;
        newCount?: number;
        updatedCount?: number;
      };
    }
  | {
      type: "metadata";
      status: "idle" | "syncing" | "error";
      apiQueryCount: number | null;
      statusMessage: string | null;
      currentPhase: string | null;
      hasPartialSync: boolean;
      partialSyncProgress: { completed: number; total: number } | null;
    }
  | {
      type: "done";
      result: SyncResult;
      finishedAt: number;
    }
  | {
      type: "error";
      error: string;
      finishedAt: number;
    };

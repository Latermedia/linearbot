import type { SyncPhase } from "../../db/queries.js";

export interface SyncResult {
  success: boolean;
  newCount: number;
  updatedCount: number;
  totalCount: number;
  issueCount: number;
  projectCount: number;
  projectIssueCount: number;
  error?: string;
}

export interface SyncCallbacks {
  onIssueCountUpdate?: (count: number) => void;
  onProjectCountUpdate?: (count: number) => void;
  onProjectIssueCountUpdate?: (count: number) => void;
  onProgressPercent?: (
    percent: number,
    apiQueryCount: number,
    currentPhase: string | null
  ) => void;
  onProjectProgress?: (
    currentIndex: number,
    total: number,
    projectName: string | null
  ) => void;
  onIssueCountsUpdate?: (newCount: number, updatedCount: number) => void;
}

export interface SyncOptions {
  phases: SyncPhase[];
  isFullSync: boolean;
  /** Enable deep history sync - fetches issues updated in the last year instead of 14 days */
  deepHistorySync?: boolean;
  /** Enable incremental sync - only fetches issues updated since last successful sync */
  incrementalSync?: boolean;
}

import type { LinearAPIClient } from "../../linear/client.js";
import type { LinearIssueData, ProjectUpdate } from "../../linear/client.js";
import type { PartialSyncState } from "../../db/queries.js";
import type { ProjectDataCache } from "./utils/project-cache.js";

/**
 * Cached result of project discovery (planned and completed projects)
 * Used to avoid fetching all projects twice when both phases run
 */
export interface ProjectDiscoveryCache {
  planned: { id: string; name: string }[];
  completed: { id: string; name: string }[];
}

/**
 * Tracks issue counts per project from bulk fetches (Phase 1+2)
 * Used to determine if we can skip per-project issue fetches in Phase 3+
 */
export interface ProjectIssueTracker {
  /** Map of projectId -> Set of issue IDs we've already fetched */
  issueIdsByProject: Map<string, Set<string>>;
  /** Map of projectId -> count of issues from bulk fetches */
  issueCountByProject: Map<string, number>;
}

export interface PhaseContext {
  linearClient: LinearAPIClient;
  callbacks?: SyncCallbacks;
  syncOptions?: SyncOptions;
  existingPartialSync: PartialSyncState | null;
  isResuming: boolean;
  ignoredTeamKeys: string[];
  startedIssues: LinearIssueData[];
  recentlyUpdatedIssues: LinearIssueData[];
  activeProjectIds: Set<string>;
  projectDescriptionsMap: Map<string, string | null>;
  projectUpdatesMap: Map<string, ProjectUpdate[]>;
  projectDataCache: ProjectDataCache;
  cumulativeNewCount: number;
  cumulativeUpdatedCount: number;
  apiQueryCount: number;
  updatePhase: (phase: SyncPhase) => void;
  shouldRunPhase: (phase: SyncPhase) => boolean;
  getProjectSyncLimit: () => number | null;
  /** Cached project discovery results (planned and completed projects) */
  projectDiscoveryCache?: ProjectDiscoveryCache;
  /** Tracks issues already fetched per project from Phase 1+2 to avoid redundant fetches */
  projectIssueTracker: ProjectIssueTracker;
}

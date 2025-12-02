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
  onProgressPercent?: (percent: number) => void;
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
}

import type { LinearAPIClient } from "../../linear/client.js";
import type { LinearIssueData, ProjectUpdate } from "../../linear/client.js";
import type { PartialSyncState } from "../../db/queries.js";

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
  cumulativeNewCount: number;
  cumulativeUpdatedCount: number;
  apiQueryCount: number;
  updatePhase: (phase: SyncPhase) => void;
  shouldRunPhase: (phase: SyncPhase) => boolean;
  getProjectSyncLimit: () => number | null;
}

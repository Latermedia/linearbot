import type { LinearAPIClient } from "../../../linear/client.js";
import type { LinearIssueData, ProjectUpdate } from "../../../linear/client.js";
import type { PartialSyncState } from "../../../db/queries.js";
import { RateLimitError } from "../../../linear/client.js";
import pLimit from "p-limit";
import { PROJECT_SYNC_CONCURRENCY } from "../helpers.js";
import { writeIssuesToDatabase } from "../utils.js";
import { computeAndStoreProjects } from "../compute-projects.js";
import {
  setSyncStatusMessage,
  savePartialSyncState,
} from "../../../db/queries.js";
import type { SyncCallbacks } from "../types.js";
import { ProjectDataCache } from "./project-cache.js";
import {
  handleRateLimitError,
  checkForRateLimitError,
  processSettledResults,
  type CancellationFlag,
} from "./error-handling.js";

export interface ProjectProcessingResult {
  projectId: string;
  issueCounts: { newCount: number; updatedCount: number };
  projectIndex: number;
  projectIssueCount: number;
  projectName: string | null;
}

export interface ProjectProcessingConfig {
  phaseName: string;
  statusMessagePrefix: string;
  projectNameMap?: Map<string, string>;
  onProgress?: (count: number) => void;
  updatePartialSyncState: (
    projectId: string,
    projectSyncStatuses: Array<{
      projectId: string;
      status: "complete" | "incomplete";
    }>,
    existingPartialSync: PartialSyncState | null
  ) => PartialSyncState;
  addToActiveProjectIds?: boolean;
  useAtomicProgress?: boolean; // Used for onProjectProgress callback, not for overall progress
}

export interface ProcessProjectsOptions {
  linearClient: LinearAPIClient;
  projectsToSync: string[];
  projectSyncStatuses: Array<{
    projectId: string;
    status: "complete" | "incomplete";
  }>;
  projectDescriptionsMap: Map<string, string | null>;
  projectUpdatesMap: Map<string, ProjectUpdate[]>;
  projectDataCache: ProjectDataCache;
  activeProjectIds: Set<string>;
  callbacks?: SyncCallbacks;
  existingPartialSync: PartialSyncState | null;
  config: ProjectProcessingConfig;
}

/**
 * Process multiple projects in parallel with shared logic
 */
export async function processProjectsInParallel(
  options: ProcessProjectsOptions
): Promise<{
  results: ProjectProcessingResult[];
  newCount: number;
  updatedCount: number;
}> {
  const {
    linearClient,
    projectsToSync,
    projectSyncStatuses,
    projectDescriptionsMap,
    projectUpdatesMap,
    projectDataCache,
    activeProjectIds,
    callbacks,
    existingPartialSync,
    config,
  } = options;

  const limit = pLimit(PROJECT_SYNC_CONCURRENCY);
  const cancelled: CancellationFlag = { value: false };
  const completedCountLock = config.useAtomicProgress
    ? { value: 0 }
    : undefined;

  const processProject = async (
    projectId: string,
    projectIndex: number
  ): Promise<ProjectProcessingResult> => {
    // Check cancellation flag before starting
    if (cancelled.value) {
      const projectName = config.projectNameMap?.get(projectId) || null;
      return {
        projectId,
        issueCounts: { newCount: 0, updatedCount: 0 },
        projectIndex,
        projectIssueCount: 0,
        projectName,
      };
    }

    const projectName = config.projectNameMap?.get(projectId) || null;
    // Only show project name in status message, not raw IDs
    const displayName = projectName || "Unknown project";

    setSyncStatusMessage(
      `${config.statusMessagePrefix} ${projectIndex} of ${projectsToSync.length}: ${displayName}`
    );

    console.log(
      `[SYNC] Processing project ${projectIndex}/${projectsToSync.length}: ${projectName || projectId}`
    );

    // Check cancellation before API call
    if (cancelled.value) {
      return {
        projectId,
        issueCounts: { newCount: 0, updatedCount: 0 },
        projectIndex,
        projectIssueCount: 0,
        projectName,
      };
    }

    let maxIssueCount = 0;
    let singleProjectIssues: LinearIssueData[];
    try {
      singleProjectIssues = await linearClient.fetchIssuesByProjects(
        [projectId],
        config.onProgress
          ? (count) => {
              // Check cancellation during progress callback
              if (cancelled.value) return;
              config.onProgress!(count);
              // Don't update progress here - query-based progress handles it smoothly
              // Progress updates are handled by incrementApiQuery() based on query count
              maxIssueCount = Math.max(maxIssueCount, count);
            }
          : undefined,
        projectDescriptionsMap,
        projectUpdatesMap
      );
    } catch (error) {
      handleRateLimitError(error, cancelled);
      throw error;
    }

    // Check cancellation after API call
    if (cancelled.value) {
      return {
        projectId,
        issueCounts: { newCount: 0, updatedCount: 0 },
        projectIndex,
        projectIssueCount: 0,
        projectName,
      };
    }

    let issueCounts = { newCount: 0, updatedCount: 0 };
    let projectIssueCount = 0;
    if (singleProjectIssues.length > 0) {
      console.log(
        `[SYNC] Writing ${singleProjectIssues.length} issues for project ${projectName || projectId}...`
      );
      issueCounts = writeIssuesToDatabase(singleProjectIssues);
      projectIssueCount = singleProjectIssues.length;
    }

    // Check cancellation before additional API calls
    if (cancelled.value) {
      return {
        projectId,
        issueCounts: { newCount: 0, updatedCount: 0 },
        projectIndex,
        projectIssueCount: 0,
        projectName,
      };
    }

    // Fetch project labels and content (using cache)
    const projectLabelsMap = new Map<string, string[]>();
    const projectContentMap = new Map<string, string | null>();

    if (!projectDataCache.has(projectId)) {
      try {
        const projectData = await linearClient.fetchProjectData(projectId);
        projectDataCache.set(projectId, {
          labels: projectData.labels,
          content: projectData.content,
        });
      } catch (error: unknown) {
        if (error instanceof RateLimitError) {
          cancelled.value = true;
          throw error;
        }
        console.error(
          `[SYNC] Failed to fetch project data for ${projectId}:`,
          error instanceof Error ? error.message : String(error)
        );
        // Continue without labels/content - they're optional
      }
    }

    // Use cached data if available
    const cachedData = projectDataCache.get(projectId);
    if (cachedData) {
      projectLabelsMap.set(projectId, cachedData.labels);
      projectContentMap.set(projectId, cachedData.content);
    }

    await computeAndStoreProjects(
      projectLabelsMap,
      projectDescriptionsMap,
      projectUpdatesMap,
      new Set([projectId]),
      true,
      projectContentMap
    );

    // Update project sync status
    const statusIndex = projectSyncStatuses.findIndex(
      (p) => p.projectId === projectId
    );
    if (statusIndex >= 0) {
      projectSyncStatuses[statusIndex].status = "complete";
    } else {
      projectSyncStatuses.push({ projectId, status: "complete" });
    }

    // Add to active project IDs if configured
    if (config.addToActiveProjectIds) {
      activeProjectIds.add(projectId);
    }

    // Update project progress callback (for stats), but don't update overall progress
    // Query-based progress (incrementApiQuery) handles smooth progress updates
    if (config.useAtomicProgress && completedCountLock) {
      completedCountLock.value++;
      const currentCompleted = completedCountLock.value;
      callbacks?.onProjectProgress?.(
        currentCompleted,
        projectsToSync.length,
        projectName
      );
      // Don't update overall progress here - query-based progress handles it
    }

    // Update partial sync state
    const partialState = config.updatePartialSyncState(
      projectId,
      projectSyncStatuses,
      existingPartialSync
    );
    savePartialSyncState(partialState);

    return {
      projectId,
      issueCounts,
      projectIndex,
      projectIssueCount,
      projectName,
    };
  };

  const results = await Promise.allSettled(
    projectsToSync.map((projectId, index) =>
      limit(() => processProject(projectId, index + 1))
    )
  );

  // Check if any promise was rejected due to rate limit
  const rateLimitError = checkForRateLimitError(results);
  if (rateLimitError) {
    throw rateLimitError;
  }

  // Filter out rejected promises (non-rate-limit errors are logged but don't stop sync)
  const successfulResults =
    processSettledResults<ProjectProcessingResult>(results);

  // Collect counts safely after all promises complete
  let newCount = 0;
  let updatedCount = 0;
  for (const result of successfulResults) {
    newCount += result.issueCounts.newCount;
    updatedCount += result.issueCounts.updatedCount;
  }

  return {
    results: successfulResults,
    newCount,
    updatedCount,
  };
}

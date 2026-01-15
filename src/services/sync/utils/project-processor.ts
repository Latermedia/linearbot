import type { LinearAPIClient } from "../../../linear/client.js";
import type {
  LinearIssueData,
  ProjectUpdate,
  ProjectFullData,
} from "../../../linear/client.js";
import type { PartialSyncState } from "../../../db/queries.js";
import { RateLimitError } from "../../../linear/client.js";
import pLimit from "p-limit";
import { PROJECT_SYNC_CONCURRENCY } from "../helpers.js";
import { writeIssuesToDatabase } from "../utils.js";
import {
  computeAndStoreProjects,
  type EmptyProjectData,
} from "../compute-projects.js";
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
  /** Full project data if project has zero issues (for empty project handling) */
  emptyProjectData?: ProjectFullData;
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
  /** Optional tracker for issues already fetched in Phase 1+2 to skip redundant fetches */
  projectIssueTracker?: {
    issueIdsByProject: Map<string, Set<string>>;
    issueCountByProject: Map<string, number>;
  };
  /** Team keys to ignore (issues from these teams will not be written to database) */
  ignoredTeamKeys?: string[];
  /** Team keys to include (whitelist) - if set, only these teams are synced */
  whitelistTeamKeys?: string[];
  /** Assignee names to ignore (issues from these assignees will not be written to database) */
  ignoredAssigneeNames?: string[];
}

/** Batch size for project metadata fetches */
const METADATA_BATCH_SIZE = 10;

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
    projectIssueTracker,
    ignoredTeamKeys = [],
    whitelistTeamKeys = [],
    ignoredAssigneeNames = [],
  } = options;

  const limit = pLimit(PROJECT_SYNC_CONCURRENCY);
  const cancelled: CancellationFlag = { value: false };
  const completedCountLock = config.useAtomicProgress
    ? { value: 0 }
    : undefined;

  // Batch pre-fetch project metadata for projects not in cache
  // This reduces API calls from N to N/METADATA_BATCH_SIZE
  const projectsNeedingMetadata = projectsToSync.filter(
    (id) => !projectDataCache.has(id)
  );

  if (projectsNeedingMetadata.length > 0) {
    console.log(
      `[SYNC] Batch pre-fetching metadata for ${projectsNeedingMetadata.length} projects...`
    );
    setSyncStatusMessage(
      `Pre-fetching metadata for ${projectsNeedingMetadata.length} projects...`
    );

    // Fetch in batches
    for (
      let i = 0;
      i < projectsNeedingMetadata.length;
      i += METADATA_BATCH_SIZE
    ) {
      if (cancelled.value) break;

      const batch = projectsNeedingMetadata.slice(i, i + METADATA_BATCH_SIZE);
      try {
        const batchData =
          await linearClient.fetchMultipleProjectsFullData(batch);

        // Cache the results
        for (const [projectId, fullData] of batchData) {
          projectDataCache.set(projectId, {
            labels: fullData.labels,
            content: fullData.content,
            description: fullData.description,
            updates: fullData.updates,
            fullData: fullData,
          });
          // Also populate the maps
          projectDescriptionsMap.set(projectId, fullData.description);
          projectUpdatesMap.set(projectId, fullData.updates);
        }
      } catch (error) {
        if (error instanceof RateLimitError) {
          cancelled.value = true;
          throw error;
        }
        // Log but continue - individual project processing will handle missing data
        console.error(
          `[SYNC] Batch metadata fetch failed for batch ${i / METADATA_BATCH_SIZE + 1}:`,
          error instanceof Error ? error.message : error
        );
      }
    }

    console.log(
      `[SYNC] Batch metadata pre-fetch complete. Cache now has ${projectDataCache.size()} projects.`
    );
  }

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
    let singleProjectIssues: LinearIssueData[] = [];
    let skippedIssueFetch = false;

    // Check if we already have issues for this project from Phase 1+2
    // If so, we can skip the redundant API call - issues are already in the database
    const existingIssueCount =
      projectIssueTracker?.issueCountByProject.get(projectId) ?? 0;

    if (existingIssueCount > 0) {
      // We have issues from Phase 1+2, skip the fetch
      skippedIssueFetch = true;
      console.log(
        `[SYNC] Skipping issue fetch for project ${projectName || projectId} - already have ${existingIssueCount} issues from Phase 1+2`
      );
      // No need to fetch or write issues - they're already in the database
    } else {
      // No issues from Phase 1+2, need to fetch all issues for this project
      try {
        // Fetch issues only - don't pass description/updates maps
        // We'll fetch all project metadata in a single consolidated call below
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
            : undefined
          // Note: Not passing projectDescriptionsMap and projectUpdatesMap
          // to avoid separate API calls - we consolidate below
        );
      } catch (error) {
        handleRateLimitError(error, cancelled);
        throw error;
      }
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

    if (skippedIssueFetch) {
      // Issues were already written to database in Phase 1+2, just track the count
      projectIssueCount = existingIssueCount;
    } else if (singleProjectIssues.length > 0) {
      // Filter by team whitelist/blacklist and ignored assignees
      const filteredIssues = singleProjectIssues.filter((issue) => {
        // Check team whitelist/blacklist
        if (whitelistTeamKeys.length > 0) {
          // Whitelist mode: only include teams on the whitelist
          if (!whitelistTeamKeys.includes(issue.teamKey)) {
            return false;
          }
        } else {
          // Blacklist mode: exclude ignored teams
          if (ignoredTeamKeys.includes(issue.teamKey)) {
            return false;
          }
        }
        // Check ignored assignees
        return !ignoredAssigneeNames.includes(issue.assigneeName || "");
      });

      if (filteredIssues.length !== singleProjectIssues.length) {
        console.log(
          `[SYNC] Filtered out ${singleProjectIssues.length - filteredIssues.length} issues from ignored teams/assignees for project ${projectName || projectId}`
        );
      }

      if (filteredIssues.length > 0) {
        console.log(
          `[SYNC] Writing ${filteredIssues.length} issues for project ${projectName || projectId}...`
        );
        issueCounts = writeIssuesToDatabase(filteredIssues);
      }
      projectIssueCount = filteredIssues.length;
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

    // Fetch all project metadata in a single consolidated API call
    // This replaces 3 separate calls: fetchProjectDescription, fetchProjectUpdates, fetchProjectData
    const projectLabelsMap = new Map<string, string[]>();
    const projectContentMap = new Map<string, string | null>();

    let fullProjectData: ProjectFullData | undefined;

    if (!projectDataCache.has(projectId)) {
      try {
        const fullData = await linearClient.fetchProjectFullData(projectId);
        fullProjectData = fullData;
        // Cache all project metadata including full data for empty projects
        projectDataCache.set(projectId, {
          labels: fullData.labels,
          content: fullData.content,
          description: fullData.description,
          updates: fullData.updates,
          fullData: fullData, // Store full data for empty project handling
        });
        // Populate the description and updates maps
        projectDescriptionsMap.set(projectId, fullData.description);
        projectUpdatesMap.set(projectId, fullData.updates);
        if (fullData.updates.length > 0) {
          console.log(
            `[SYNC] Fetched ${fullData.updates.length} project update(s) for project: ${projectName || projectId}`
          );
        }
      } catch (error: unknown) {
        if (error instanceof RateLimitError) {
          cancelled.value = true;
          throw error;
        }
        console.error(
          `[SYNC] Failed to fetch project data for ${projectId}:`,
          error instanceof Error ? error.message : String(error)
        );
        // Continue without metadata - it's optional
        projectDescriptionsMap.set(projectId, null);
        projectUpdatesMap.set(projectId, []);
      }
    } else {
      // Data is cached - use cached description/updates
      const cachedData = projectDataCache.get(projectId)!;
      fullProjectData = cachedData.fullData;
      if (!projectDescriptionsMap.has(projectId)) {
        projectDescriptionsMap.set(projectId, cachedData.description ?? null);
      }
      if (!projectUpdatesMap.has(projectId)) {
        projectUpdatesMap.set(projectId, cachedData.updates ?? []);
      }
    }

    // Use cached data for labels/content
    const cachedData = projectDataCache.get(projectId);
    if (cachedData) {
      projectLabelsMap.set(projectId, cachedData.labels);
      projectContentMap.set(projectId, cachedData.content);
    }

    // Build empty project data for projects with zero issues
    const emptyProjectsList: EmptyProjectData[] = [];
    if (projectIssueCount === 0 && fullProjectData) {
      emptyProjectsList.push({
        projectId,
        fullData: fullProjectData,
      });
      console.log(
        `[SYNC] Project "${projectName || projectId}" has zero issues - will be stored as empty project`
      );
    }

    await computeAndStoreProjects(
      projectLabelsMap,
      projectDescriptionsMap,
      projectUpdatesMap,
      new Set([projectId]),
      true,
      projectContentMap,
      emptyProjectsList // Pass empty projects
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
      emptyProjectData: projectIssueCount === 0 ? fullProjectData : undefined,
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

import type { PhaseContext } from "../types.js";
import pLimit from "p-limit";
import { PROJECT_SYNC_CONCURRENCY, getProjectSyncLimit } from "../helpers.js";
import { writeIssuesToDatabase } from "../utils.js";
import { computeAndStoreProjects } from "../compute-projects.js";
import {
  getAllProjects,
  getAllInitiatives,
  setSyncProgress,
  setSyncStatus,
  setSyncStatusMessage,
  updateSyncMetadata,
} from "../../../db/queries.js";
import { RateLimitError } from "../../../linear/client.js";
import {
  checkForRateLimitError,
  handleRateLimitError,
  type CancellationFlag,
} from "../utils/error-handling.js";

export interface InitiativeProjectsResult {
  newCount: number;
  updatedCount: number;
}

export async function syncInitiativeProjects(
  context: PhaseContext
): Promise<InitiativeProjectsResult> {
  const {
    linearClient,
    callbacks,
    projectDescriptionsMap,
    projectUpdatesMap,
    projectDataCache,
    apiQueryCount,
    updatePhase,
    shouldRunPhase,
    projectIssueTracker,
  } = context;

  let newCount = 0;
  let updatedCount = 0;

  if (!shouldRunPhase("initiative_projects")) {
    console.log("[SYNC] Skipping initiative projects phase (not selected)");
    return { newCount, updatedCount };
  }

  updatePhase("initiative_projects");
  callbacks?.onProgressPercent?.(80);
  setSyncProgress(80);
  setSyncStatusMessage("Syncing initiative projects...");

  try {
    // Use initiatives from database (which were synced in the previous phase)
    // This ensures we're finding projects for initiatives we've actually loaded
    const dbInitiatives = getAllInitiatives();

    const projectIdsFromInitiatives = new Set<string>();

    if (dbInitiatives.length === 0) {
      // Fallback: if no initiatives in DB, fetch from API
      // This handles the case where initiative_projects is run without initiatives phase
      console.log(
        "[SYNC] No initiatives in database, fetching from API as fallback..."
      );
      const apiInitiatives = await linearClient.fetchInitiatives();
      for (const initiative of apiInitiatives) {
        for (const projectId of initiative.projectIds || []) {
          projectIdsFromInitiatives.add(projectId);
        }
      }
      console.log(
        `[SYNC] Found ${projectIdsFromInitiatives.size} unique project(s) across ${apiInitiatives.length} initiative(s) from API`
      );
    } else {
      console.log(
        `[SYNC] Reading ${dbInitiatives.length} initiative(s) from database to identify missing projects...`
      );
      // Collect all project IDs from database initiatives
      for (const initiative of dbInitiatives) {
        if (initiative.project_ids) {
          try {
            const projectIds = JSON.parse(initiative.project_ids) as string[];
            for (const projectId of projectIds) {
              projectIdsFromInitiatives.add(projectId);
            }
          } catch (e) {
            console.warn(
              `[SYNC] Failed to parse project_ids for initiative ${initiative.id}:`,
              e
            );
          }
        }
      }
      console.log(
        `[SYNC] Found ${projectIdsFromInitiatives.size} unique project(s) across ${dbInitiatives.length} initiative(s) in database`
      );
    }

    // Get existing project IDs from database
    const existingProjects = getAllProjects();
    const existingProjectIds = new Set(
      existingProjects.map((p) => p.project_id)
    );

    // Find projects that are in initiatives but not in database
    const missingProjectIds = Array.from(projectIdsFromInitiatives).filter(
      (id) => !existingProjectIds.has(id)
    );

    console.log(
      `[SYNC] Found ${missingProjectIds.length} project(s) associated with initiatives that aren't in database`
    );

    if (missingProjectIds.length > 0) {
      const projectLimit = getProjectSyncLimit();
      let projectsToSync = missingProjectIds;
      if (projectLimit !== null && projectsToSync.length > projectLimit) {
        projectsToSync = projectsToSync.slice(0, projectLimit);
        console.log(
          `[SYNC] Limiting initiative projects to ${projectLimit} (found ${missingProjectIds.length} total). Set LIMIT_SYNC=false to sync all.`
        );
      }

      const limit = pLimit(PROJECT_SYNC_CONCURRENCY);
      // Shared cancellation flag - when rate limit is hit, set this to stop all concurrent operations
      const cancelled: CancellationFlag = { value: false };
      const initiativeProjectIssues: import("../../../linear/client.js").LinearIssueData[] =
        [];

      const processInitiativeProject = async (projectId: string) => {
        // Check cancellation flag before starting
        if (cancelled.value) {
          return [];
        }

        // Check if we already have issues for this project from Phase 1+2
        const existingIssueCount =
          projectIssueTracker?.issueCountByProject.get(projectId) ?? 0;

        if (existingIssueCount > 0) {
          // We have issues from Phase 1+2, skip the fetch
          console.log(
            `[SYNC] Skipping issue fetch for initiative project ${projectId} - already have ${existingIssueCount} issues from Phase 1+2`
          );
          return [];
        }

        try {
          // Fetch issues only - not passing description/updates maps
          // All project metadata will be fetched in one consolidated call below
          const projectIssues = await linearClient.fetchIssuesByProjects(
            [projectId],
            () => {}
          );
          return projectIssues;
        } catch (error) {
          handleRateLimitError(error, cancelled);
          throw error;
        }
      };

      const allInitiativeProjectIssuesResults = await Promise.allSettled(
        projectsToSync.map((projectId) =>
          limit(() => processInitiativeProject(projectId))
        )
      );

      // Check if any promise was rejected due to rate limit
      const rateLimitError = checkForRateLimitError(
        allInitiativeProjectIssuesResults
      );
      if (rateLimitError) {
        throw rateLimitError;
      }

      // Collect successful results
      const allInitiativeProjectIssues = allInitiativeProjectIssuesResults
        .filter((r) => r.status === "fulfilled")
        .map((r) => (r.status === "fulfilled" ? r.value : []))
        .flat();

      initiativeProjectIssues.push(...allInitiativeProjectIssues);

      if (initiativeProjectIssues.length > 0) {
        // Filter out ignored teams before writing to database
        const filteredIssues =
          context.ignoredTeamKeys.length > 0
            ? initiativeProjectIssues.filter(
                (issue) => !context.ignoredTeamKeys.includes(issue.teamKey)
              )
            : initiativeProjectIssues;

        if (filteredIssues.length !== initiativeProjectIssues.length) {
          console.log(
            `[SYNC] Filtered out ${initiativeProjectIssues.length - filteredIssues.length} issues from ignored teams in initiative projects`
          );
        }

        if (filteredIssues.length > 0) {
          console.log(
            `[SYNC] Writing ${filteredIssues.length} issues from ${projectsToSync.length} initiative project(s)...`
          );
          const counts = writeIssuesToDatabase(filteredIssues);
          newCount = counts.newCount;
          updatedCount = counts.updatedCount;
        }
      }

      // Fetch all project metadata in consolidated API calls (using cache and batching)
      const initiativeProjectLabelsMap = new Map<string, string[]>();
      const initiativeProjectContentMap = new Map<string, string | null>();

      // Check cancellation before fetching project data
      if (cancelled.value) {
        throw new RateLimitError("Rate limit exceeded");
      }

      // Find projects not in cache for batch fetching
      const projectsNeedingMetadata = projectsToSync.filter(
        (id) => !projectDataCache.has(id)
      );

      // Batch fetch metadata for uncached projects (10 per batch)
      const METADATA_BATCH_SIZE = 10;
      if (projectsNeedingMetadata.length > 0) {
        console.log(
          `[SYNC] Batch fetching metadata for ${projectsNeedingMetadata.length} initiative projects...`
        );
        setSyncStatusMessage(
          `Fetching metadata for ${projectsNeedingMetadata.length} initiative projects...`
        );

        for (
          let i = 0;
          i < projectsNeedingMetadata.length;
          i += METADATA_BATCH_SIZE
        ) {
          if (cancelled.value) break;

          const batch = projectsNeedingMetadata.slice(
            i,
            i + METADATA_BATCH_SIZE
          );
          try {
            const batchData =
              await linearClient.fetchMultipleProjectsFullData(batch);

            // Cache and populate maps
            for (const [projectId, fullData] of batchData) {
              projectDataCache.set(projectId, {
                labels: fullData.labels,
                content: fullData.content,
                description: fullData.description,
                updates: fullData.updates,
                fullData: fullData,
              });
              initiativeProjectLabelsMap.set(projectId, fullData.labels);
              initiativeProjectContentMap.set(projectId, fullData.content);
              projectDescriptionsMap.set(projectId, fullData.description);
              projectUpdatesMap.set(projectId, fullData.updates);
              if (fullData.updates.length > 0) {
                console.log(
                  `[SYNC] Fetched ${fullData.updates.length} project update(s) for initiative project: ${projectId}`
                );
              }
            }
          } catch (error: unknown) {
            if (error instanceof RateLimitError) {
              cancelled.value = true;
              throw error;
            }
            console.error(
              `[SYNC] Batch metadata fetch failed for initiative projects:`,
              error instanceof Error ? error.message : String(error)
            );
            // Continue - individual projects may still work
          }
        }
      }

      // Populate maps from cache for projects that were already cached
      for (const projectId of projectsToSync) {
        if (projectDataCache.has(projectId)) {
          const cachedData = projectDataCache.get(projectId)!;
          if (!initiativeProjectLabelsMap.has(projectId)) {
            initiativeProjectLabelsMap.set(projectId, cachedData.labels);
          }
          if (!initiativeProjectContentMap.has(projectId)) {
            initiativeProjectContentMap.set(projectId, cachedData.content);
          }
          if (!projectDescriptionsMap.has(projectId)) {
            projectDescriptionsMap.set(
              projectId,
              cachedData.description ?? null
            );
          }
          if (!projectUpdatesMap.has(projectId)) {
            projectUpdatesMap.set(projectId, cachedData.updates ?? []);
          }
        } else {
          // Project wasn't in cache and batch fetch failed - set defaults
          if (!projectDescriptionsMap.has(projectId)) {
            projectDescriptionsMap.set(projectId, null);
          }
          if (!projectUpdatesMap.has(projectId)) {
            projectUpdatesMap.set(projectId, []);
          }
        }
      }

      await computeAndStoreProjects(
        initiativeProjectLabelsMap,
        projectDescriptionsMap,
        projectUpdatesMap,
        new Set(projectsToSync),
        true,
        initiativeProjectContentMap
      );
      console.log(
        `[SYNC] Computed metrics for ${projectsToSync.length} initiative project(s)`
      );
    }

    // Phase complete - set to 95%
    callbacks?.onProgressPercent?.(95);
    setSyncProgress(95);
  } catch (error) {
    if (error instanceof RateLimitError) {
      const errorMsg = "Rate limit exceeded during initiative projects sync";
      console.error(`[SYNC] ${errorMsg}`);
      setSyncStatus("error");
      updateSyncMetadata({
        sync_error: errorMsg,
        sync_progress_percent: null,
        api_query_count: apiQueryCount,
      });
      throw error;
    }
    console.error(
      `[SYNC] Error syncing initiative projects (continuing anyway):`,
      error instanceof Error ? error.message : String(error)
    );
  }

  return { newCount, updatedCount };
}

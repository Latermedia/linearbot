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
    apiQueryCount,
    updatePhase,
    shouldRunPhase,
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
      const cancelled = { value: false };
      const initiativeProjectIssues: import("../../../linear/client.js").LinearIssueData[] =
        [];

      const processInitiativeProject = async (projectId: string) => {
        // Check cancellation flag before starting
        if (cancelled.value) {
          return [];
        }

        try {
          const projectIssues = await linearClient.fetchIssuesByProjects(
            [projectId],
            () => {},
            projectDescriptionsMap,
            projectUpdatesMap
          );
          return projectIssues;
        } catch (error) {
          // If rate limit error, cancel all other operations and rethrow
          if (error instanceof RateLimitError) {
            cancelled.value = true;
            throw error;
          }
          throw error;
        }
      };

      const allInitiativeProjectIssuesResults = await Promise.allSettled(
        projectsToSync.map((projectId) =>
          limit(() => processInitiativeProject(projectId))
        )
      );

      // Check if any promise was rejected due to rate limit
      const rateLimitError = allInitiativeProjectIssuesResults.find(
        (r) =>
          r.status === "rejected" &&
          (r.reason instanceof RateLimitError ||
            (r.reason instanceof Error &&
              r.reason.message.includes("rate limit")))
      );

      if (rateLimitError) {
        // Extract the actual error
        const error =
          rateLimitError.status === "rejected" ? rateLimitError.reason : null;
        if (error instanceof RateLimitError) {
          throw error;
        }
        throw new RateLimitError(
          error instanceof Error ? error.message : "Rate limit exceeded"
        );
      }

      // Collect successful results
      const allInitiativeProjectIssues = allInitiativeProjectIssuesResults
        .filter((r) => r.status === "fulfilled")
        .map((r) => (r.status === "fulfilled" ? r.value : []))
        .flat();

      initiativeProjectIssues.push(...allInitiativeProjectIssues);

      if (initiativeProjectIssues.length > 0) {
        console.log(
          `[SYNC] Writing ${initiativeProjectIssues.length} issues from ${projectsToSync.length} initiative project(s)...`
        );
        const counts = writeIssuesToDatabase(initiativeProjectIssues);
        newCount = counts.newCount;
        updatedCount = counts.updatedCount;
      }

      // Fetch project labels and content directly from Linear API for each project
      const initiativeProjectLabelsMap = new Map<string, string[]>();
      const initiativeProjectContentMap = new Map<string, string | null>();

      // Check cancellation before fetching project data
      if (cancelled.value) {
        throw new RateLimitError("Rate limit exceeded");
      }

      // Fetch labels and content for each project in parallel
      const projectDataPromises = projectsToSync.map(async (projectId) => {
        // Check cancellation before each API call
        if (cancelled.value) {
          return;
        }

        try {
          const projectData = await linearClient.fetchProjectData(projectId);
          initiativeProjectLabelsMap.set(projectId, projectData.labels);
          initiativeProjectContentMap.set(projectId, projectData.content);
        } catch (error) {
          // If rate limit error, cancel all other operations and rethrow
          if (error instanceof RateLimitError) {
            cancelled.value = true;
            throw error;
          }
          console.error(
            `[SYNC] Failed to fetch project data for ${projectId}:`,
            error instanceof Error ? error.message : error
          );
          // Continue without labels/content - they're optional
        }
      });

      const projectDataResults = await Promise.allSettled(projectDataPromises);

      // Check if any promise was rejected due to rate limit
      const projectDataRateLimitError = projectDataResults.find(
        (r) =>
          r.status === "rejected" &&
          (r.reason instanceof RateLimitError ||
            (r.reason instanceof Error &&
              r.reason.message.includes("rate limit")))
      );

      if (projectDataRateLimitError) {
        // Extract the actual error
        const error =
          projectDataRateLimitError.status === "rejected"
            ? projectDataRateLimitError.reason
            : null;
        if (error instanceof RateLimitError) {
          throw error;
        }
        throw new RateLimitError(
          error instanceof Error ? error.message : "Rate limit exceeded"
        );
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
      error instanceof Error ? error.message : error
    );
  }

  return { newCount, updatedCount };
}

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
  updateSyncMetadata,
} from "../../../db/queries.js";
import { RateLimitError } from "../../../linear/client.js";
import { getTotalIssueCount } from "../../../db/queries.js";

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
    startedIssues,
    cumulativeNewCount,
    cumulativeUpdatedCount,
    apiQueryCount,
    updatePhase,
    shouldRunPhase,
    getProjectSyncLimit,
  } = context;

  let newCount = 0;
  let updatedCount = 0;

  if (!shouldRunPhase("initiative_projects")) {
    console.log("[SYNC] Skipping initiative projects phase (not selected)");
    return { newCount, updatedCount };
  }

  updatePhase("initiative_projects");
  callbacks?.onProgressPercent?.(96);
  setSyncProgress(96);

  try {
    // Use initiatives from database (which were synced in the previous phase)
    // This ensures we're finding projects for initiatives we've actually loaded
    const dbInitiatives = getAllInitiatives();
    
    let projectIdsFromInitiatives = new Set<string>();
    
    if (dbInitiatives.length === 0) {
      // Fallback: if no initiatives in DB, fetch from API
      // This handles the case where initiative_projects is run without initiatives phase
      console.log("[SYNC] No initiatives in database, fetching from API as fallback...");
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
      console.log(`[SYNC] Reading ${dbInitiatives.length} initiative(s) from database to identify missing projects...`);
      // Collect all project IDs from database initiatives
      for (const initiative of dbInitiatives) {
        if (initiative.project_ids) {
          try {
            const projectIds = JSON.parse(initiative.project_ids) as string[];
            for (const projectId of projectIds) {
              projectIdsFromInitiatives.add(projectId);
            }
          } catch (e) {
            console.warn(`[SYNC] Failed to parse project_ids for initiative ${initiative.id}:`, e);
          }
        }
      }
      console.log(
        `[SYNC] Found ${projectIdsFromInitiatives.size} unique project(s) across ${dbInitiatives.length} initiative(s) in database`
      );
    }

    // Get existing project IDs from database
    const existingProjects = getAllProjects();
    const existingProjectIds = new Set(existingProjects.map((p) => p.project_id));

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
      let initiativeProjectIssues: import("../../../linear/client.js").LinearIssueData[] = [];

      const processInitiativeProject = async (projectId: string) => {
        const projectIssues = await linearClient.fetchIssuesByProjects(
          [projectId],
          () => {},
          projectDescriptionsMap,
          projectUpdatesMap
        );
        return projectIssues;
      };

      const allInitiativeProjectIssues = await Promise.all(
        projectsToSync.map((projectId) =>
          limit(() => processInitiativeProject(projectId))
        )
      );

      for (const issues of allInitiativeProjectIssues) {
        initiativeProjectIssues.push(...issues);
      }

      if (initiativeProjectIssues.length > 0) {
        console.log(
          `[SYNC] Writing ${initiativeProjectIssues.length} issues from ${projectsToSync.length} initiative project(s)...`
        );
        const counts = writeIssuesToDatabase(initiativeProjectIssues);
        newCount = counts.newCount;
        updatedCount = counts.updatedCount;
      }

      const initiativeProjectLabelsMap = new Map<string, string[]>();
      for (const issue of initiativeProjectIssues) {
        if (
          issue.projectId &&
          issue.projectLabels &&
          issue.projectLabels.length > 0
        ) {
          if (!initiativeProjectLabelsMap.has(issue.projectId)) {
            initiativeProjectLabelsMap.set(issue.projectId, issue.projectLabels);
          }
        }
      }

      await computeAndStoreProjects(
        initiativeProjectLabelsMap,
        projectDescriptionsMap,
        projectUpdatesMap,
        new Set(projectsToSync),
        true
      );
      console.log(
        `[SYNC] Computed metrics for ${projectsToSync.length} initiative project(s)`
      );
    }
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


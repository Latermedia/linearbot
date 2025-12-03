import type { PhaseContext } from "../types.js";
import { getProjectSyncLimit } from "../helpers.js";
import {
  savePartialSyncState,
  setSyncStatus,
  setSyncStatusMessage,
  updateSyncMetadata,
} from "../../../db/queries.js";
import type { PartialSyncState } from "../../../db/queries.js";
import { RateLimitError } from "../../../linear/client.js";
import {
  processProjectsInParallel,
  type ProjectProcessingConfig,
} from "../utils/project-processor.js";

export interface PlannedProjectsResult {
  newCount: number;
  updatedCount: number;
}

export async function syncPlannedProjects(
  context: PhaseContext
): Promise<PlannedProjectsResult> {
  const {
    linearClient,
    callbacks,
    existingPartialSync,
    isResuming,
    activeProjectIds,
    projectDescriptionsMap,
    projectUpdatesMap,
    projectDataCache,
    apiQueryCount,
    updatePhase,
    shouldRunPhase,
  } = context;

  let newCount = 0;
  let updatedCount = 0;

  if (!shouldRunPhase("planned_projects")) {
    console.log("[SYNC] Skipping planned projects phase (not selected)");
    return { newCount, updatedCount };
  }

  updatePhase("planned_projects");

  const shouldSyncPlanned =
    !isResuming ||
    !existingPartialSync ||
    existingPartialSync.plannedProjectsSync !== "complete";

  if (!shouldSyncPlanned) {
    console.log("[SYNC] Planned projects already synced, skipping");
    return { newCount, updatedCount };
  }

  try {
    setSyncStatusMessage("Fetching planned projects...");
    console.log("[SYNC] Fetching planned projects...");

    // Use cached project discovery if available, otherwise fetch all projects at once
    // This single query returns both planned and completed projects
    let plannedProjects: { id: string; name: string }[];
    if (context.projectDiscoveryCache) {
      console.log("[SYNC] Using cached project discovery results");
      plannedProjects = context.projectDiscoveryCache.planned;
    } else {
      console.log(
        "[SYNC] Fetching all projects (will cache for completed projects phase)..."
      );
      const discoveryResult = await linearClient.fetchAllProjectsByState();
      // Cache the results for the completed projects phase
      context.projectDiscoveryCache = discoveryResult;
      plannedProjects = discoveryResult.planned;
    }

    const plannedProjectIds = plannedProjects.map((p) => p.id);
    console.log(`[SYNC] Found ${plannedProjectIds.length} planned project(s)`);

    // Build a map of project IDs to project names
    const projectNameMap = new Map<string, string>();
    for (const project of plannedProjects) {
      projectNameMap.set(project.id, project.name);
    }

    let plannedProjectsToSync: string[] = plannedProjectIds;
    let plannedProjectSyncStatuses: Array<{
      projectId: string;
      status: "complete" | "incomplete";
    }> = [];

    if (
      isResuming &&
      existingPartialSync &&
      existingPartialSync.plannedProjectSyncs
    ) {
      const completedPlannedIds = new Set(
        existingPartialSync.plannedProjectSyncs
          .filter((p) => p.status === "complete")
          .map((p) => p.projectId)
      );
      plannedProjectsToSync = plannedProjectIds.filter(
        (id) => !completedPlannedIds.has(id)
      );
      plannedProjectSyncStatuses =
        existingPartialSync.plannedProjectSyncs.filter((p) =>
          plannedProjectIds.includes(p.projectId)
        );
    } else {
      plannedProjectSyncStatuses = plannedProjectIds.map((id) => ({
        projectId: id,
        status: "incomplete" as const,
      }));
    }

    const plannedProjectLimit = getProjectSyncLimit();
    if (
      plannedProjectLimit !== null &&
      plannedProjectsToSync.length > plannedProjectLimit
    ) {
      plannedProjectsToSync = plannedProjectsToSync.slice(
        0,
        plannedProjectLimit
      );
    }

    if (plannedProjectsToSync.length > 0) {
      const config: ProjectProcessingConfig = {
        phaseName: "planned_projects",
        statusMessagePrefix: "Syncing planned project",
        projectNameMap,
        updatePartialSyncState: (
          projectId,
          projectSyncStatuses,
          existingPartialSync
        ) => {
          return {
            currentPhase: "planned_projects",
            initialIssuesSync:
              existingPartialSync?.initialIssuesSync || "complete",
            projectSyncs: existingPartialSync?.projectSyncs || [],
            plannedProjectsSync: "incomplete",
            plannedProjectSyncs: [...projectSyncStatuses],
            completedProjectsSync: existingPartialSync?.completedProjectsSync,
            completedProjectSyncs: existingPartialSync?.completedProjectSyncs,
          };
        },
        addToActiveProjectIds: true,
        useAtomicProgress: false, // Use sequential progress updates
      };

      const result = await processProjectsInParallel({
        linearClient,
        projectsToSync: plannedProjectsToSync,
        projectSyncStatuses: plannedProjectSyncStatuses,
        projectDescriptionsMap,
        projectUpdatesMap,
        projectDataCache,
        activeProjectIds,
        callbacks,
        existingPartialSync,
        config,
      });

      newCount = result.newCount;
      updatedCount = result.updatedCount;

      // Progress is handled by query-based tracking (incrementApiQuery)
      // which provides smooth, consistent progress based on average queries per phase

      const partialState: PartialSyncState = {
        currentPhase: "planned_projects",
        initialIssuesSync: existingPartialSync?.initialIssuesSync || "complete",
        projectSyncs: existingPartialSync?.projectSyncs || [],
        plannedProjectsSync: "complete",
        plannedProjectSyncs: plannedProjectSyncStatuses,
        completedProjectsSync: existingPartialSync?.completedProjectsSync,
        completedProjectSyncs: existingPartialSync?.completedProjectSyncs,
      };
      savePartialSyncState(partialState);
    }
    // Progress is handled by query-based tracking
  } catch (error) {
    if (error instanceof RateLimitError) {
      const partialState: PartialSyncState = {
        currentPhase: "planned_projects",
        initialIssuesSync: existingPartialSync?.initialIssuesSync || "complete",
        projectSyncs: existingPartialSync?.projectSyncs || [],
        plannedProjectsSync: "incomplete",
        plannedProjectSyncs: [],
        completedProjectsSync: existingPartialSync?.completedProjectsSync,
        completedProjectSyncs: existingPartialSync?.completedProjectSyncs,
      };
      savePartialSyncState(partialState);
      const errorMsg = "Rate limit exceeded during planned projects sync";
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
      `[SYNC] Error fetching planned projects (continuing anyway):`,
      error instanceof Error ? error.message : error
    );
  }

  return { newCount, updatedCount };
}

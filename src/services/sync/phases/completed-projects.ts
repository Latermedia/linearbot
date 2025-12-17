import type { PhaseContext } from "../types.js";
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

export interface CompletedProjectsResult {
  newCount: number;
  updatedCount: number;
}

export async function syncCompletedProjects(
  context: PhaseContext
): Promise<CompletedProjectsResult> {
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
    getProjectSyncLimit,
    projectIssueTracker,
  } = context;

  let newCount = 0;
  let updatedCount = 0;

  if (!shouldRunPhase("completed_projects")) {
    console.log("[SYNC] Skipping completed projects phase (not selected)");
    return { newCount, updatedCount };
  }

  updatePhase("completed_projects");

  const shouldSyncCompleted =
    !isResuming ||
    !existingPartialSync ||
    existingPartialSync.completedProjectsSync !== "complete";

  if (!shouldSyncCompleted) {
    console.log("[SYNC] Completed projects already synced, skipping");
    return { newCount, updatedCount };
  }

  try {
    setSyncStatusMessage("Fetching completed projects...");
    console.log("[SYNC] Fetching completed projects (last 6 months)...");

    // Use cached project discovery if available, otherwise fetch all projects at once
    // This single query returns both planned and completed projects
    let completedProjects: { id: string; name: string }[];
    if (context.projectDiscoveryCache) {
      console.log("[SYNC] Using cached project discovery results");
      completedProjects = context.projectDiscoveryCache.completed;
    } else {
      console.log(
        "[SYNC] Fetching all projects (planned projects phase was skipped)..."
      );
      const discoveryResult = await linearClient.fetchAllProjectsByState();
      // Cache the results in case any other phase needs them
      context.projectDiscoveryCache = discoveryResult;
      completedProjects = discoveryResult.completed;
    }

    const completedProjectIds = completedProjects.map((p) => p.id);
    console.log(
      `[SYNC] Found ${completedProjectIds.length} completed project(s) from last 6 months`
    );

    // Build a map of project IDs to project names
    const projectNameMap = new Map<string, string>();
    for (const project of completedProjects) {
      projectNameMap.set(project.id, project.name);
    }

    let completedProjectsToSync: string[] = completedProjectIds;
    let completedProjectSyncStatuses: Array<{
      projectId: string;
      status: "complete" | "incomplete";
    }> = [];

    if (
      isResuming &&
      existingPartialSync &&
      existingPartialSync.completedProjectSyncs
    ) {
      const completedIds = new Set(
        existingPartialSync.completedProjectSyncs
          .filter((p) => p.status === "complete")
          .map((p) => p.projectId)
      );
      completedProjectsToSync = completedProjectIds.filter(
        (id) => !completedIds.has(id)
      );
      completedProjectSyncStatuses =
        existingPartialSync.completedProjectSyncs.filter((p) =>
          completedProjectIds.includes(p.projectId)
        );
    } else {
      completedProjectSyncStatuses = completedProjectIds.map((id) => ({
        projectId: id,
        status: "incomplete" as const,
      }));
    }

    const completedProjectLimit = getProjectSyncLimit();
    if (
      completedProjectLimit !== null &&
      completedProjectsToSync.length > completedProjectLimit
    ) {
      completedProjectsToSync = completedProjectsToSync.slice(
        0,
        completedProjectLimit
      );
    }

    if (completedProjectsToSync.length > 0) {
      const config: ProjectProcessingConfig = {
        phaseName: "completed_projects",
        statusMessagePrefix: "Syncing completed project",
        projectNameMap,
        updatePartialSyncState: (
          projectId,
          projectSyncStatuses,
          existingPartialSync
        ) => {
          return {
            currentPhase: "completed_projects",
            initialIssuesSync:
              existingPartialSync?.initialIssuesSync || "complete",
            projectSyncs: existingPartialSync?.projectSyncs || [],
            plannedProjectsSync:
              existingPartialSync?.plannedProjectsSync || "complete",
            plannedProjectSyncs: existingPartialSync?.plannedProjectSyncs || [],
            completedProjectsSync: "incomplete",
            completedProjectSyncs: [...projectSyncStatuses],
          };
        },
        addToActiveProjectIds: true,
        useAtomicProgress: false, // Use sequential progress updates
      };

      const result = await processProjectsInParallel({
        linearClient,
        projectsToSync: completedProjectsToSync,
        projectSyncStatuses: completedProjectSyncStatuses,
        projectDescriptionsMap,
        projectUpdatesMap,
        projectDataCache,
        activeProjectIds,
        callbacks,
        existingPartialSync,
        config,
        projectIssueTracker,
      });

      newCount = result.newCount;
      updatedCount = result.updatedCount;

      // Progress is handled by query-based tracking (incrementApiQuery)
      // which provides smooth, consistent progress based on average queries per phase

      const partialState: PartialSyncState = {
        currentPhase: "completed_projects",
        initialIssuesSync: existingPartialSync?.initialIssuesSync || "complete",
        projectSyncs: existingPartialSync?.projectSyncs || [],
        plannedProjectsSync:
          existingPartialSync?.plannedProjectsSync || "complete",
        plannedProjectSyncs: existingPartialSync?.plannedProjectSyncs || [],
        completedProjectsSync: "complete",
        completedProjectSyncs: completedProjectSyncStatuses,
      };
      savePartialSyncState(partialState);
    }
    // Progress is handled by query-based tracking
  } catch (error) {
    if (error instanceof RateLimitError) {
      const partialState: PartialSyncState = {
        currentPhase: "completed_projects",
        initialIssuesSync: existingPartialSync?.initialIssuesSync || "complete",
        projectSyncs: existingPartialSync?.projectSyncs || [],
        plannedProjectsSync:
          existingPartialSync?.plannedProjectsSync || "complete",
        plannedProjectSyncs: existingPartialSync?.plannedProjectSyncs || [],
        completedProjectsSync: "incomplete",
        completedProjectSyncs: [],
      };
      savePartialSyncState(partialState);
      const errorMsg = "Rate limit exceeded during completed projects sync";
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
      `[SYNC] Error fetching completed projects (continuing anyway):`,
      error instanceof Error ? error.message : error
    );
  }

  return { newCount, updatedCount };
}

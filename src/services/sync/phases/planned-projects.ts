import type { PhaseContext } from "../types.js";
import pLimit from "p-limit";
import { PROJECT_SYNC_CONCURRENCY, getProjectSyncLimit } from "../helpers.js";
import { writeIssuesToDatabase } from "../utils.js";
import { computeAndStoreProjects } from "../compute-projects.js";
import {
  savePartialSyncState,
  setSyncProgress,
  setSyncStatus,
  updateSyncMetadata,
} from "../../../db/queries.js";
import type { PartialSyncState } from "../../../db/queries.js";
import { RateLimitError } from "../../../linear/client.js";
import { getTotalIssueCount } from "../../../db/queries.js";

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
    cumulativeNewCount,
    cumulativeUpdatedCount,
    apiQueryCount,
    updatePhase,
    shouldRunPhase,
    getProjectSyncLimit,
  } = context;

  let newCount = 0;
  let updatedCount = 0;

  if (!shouldRunPhase("planned_projects")) {
    console.log("[SYNC] Skipping planned projects phase (not selected)");
    return { newCount, updatedCount };
  }

  updatePhase("planned_projects");
  const plannedProjectsProgressStart = 70;
  const plannedProjectsProgressRange = 15;

  const shouldSyncPlanned =
    !isResuming ||
    !existingPartialSync ||
    existingPartialSync.plannedProjectsSync !== "complete";

  if (!shouldSyncPlanned) {
    console.log("[SYNC] Planned projects already synced, skipping");
    return { newCount, updatedCount };
  }

  try {
    console.log("[SYNC] Fetching planned projects...");
    let plannedProjectIds = await linearClient.fetchPlannedProjects();
    console.log(
      `[SYNC] Found ${plannedProjectIds.length} planned project(s)`
    );

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
      const limit = pLimit(PROJECT_SYNC_CONCURRENCY);
      let completedCount = 0;

      const processPlannedProject = async (
        projectId: string,
        projectIndex: number
      ) => {
        const singleProjectIssues =
          await linearClient.fetchIssuesByProjects(
            [projectId],
            undefined,
            projectDescriptionsMap,
            projectUpdatesMap
          );

        let issueCounts = { newCount: 0, updatedCount: 0 };
        if (singleProjectIssues.length > 0) {
          issueCounts = writeIssuesToDatabase(singleProjectIssues);
        }

        const projectLabelsMap = new Map<string, string[]>();
        for (const issue of singleProjectIssues) {
          if (
            issue.projectId &&
            issue.projectLabels &&
            issue.projectLabels.length > 0
          ) {
            if (!projectLabelsMap.has(issue.projectId)) {
              projectLabelsMap.set(issue.projectId, issue.projectLabels);
            }
          }
        }

        await computeAndStoreProjects(
          projectLabelsMap,
          projectDescriptionsMap,
          projectUpdatesMap,
          new Set([projectId]),
          true
        );

        const statusIndex = plannedProjectSyncStatuses.findIndex(
          (p) => p.projectId === projectId
        );
        if (statusIndex >= 0) {
          plannedProjectSyncStatuses[statusIndex].status = "complete";
        }

        activeProjectIds.add(projectId);

        completedCount++;
        const plannedProjectProgressAfter =
          plannedProjectsProgressStart +
          Math.round(
            (completedCount / plannedProjectsToSync.length) *
              plannedProjectsProgressRange
          );
        callbacks?.onProgressPercent?.(plannedProjectProgressAfter);
        setSyncProgress(plannedProjectProgressAfter);

        const partialState: PartialSyncState = {
          currentPhase: "planned_projects",
          initialIssuesSync:
            existingPartialSync?.initialIssuesSync || "complete",
          projectSyncs: existingPartialSync?.projectSyncs || [],
          plannedProjectsSync: "incomplete",
          plannedProjectSyncs: [...plannedProjectSyncStatuses],
          completedProjectsSync: existingPartialSync?.completedProjectsSync,
          completedProjectSyncs: existingPartialSync?.completedProjectSyncs,
        };
        savePartialSyncState(partialState);

        return issueCounts;
      };

      const results = await Promise.all(
        plannedProjectsToSync.map((projectId, index) =>
          limit(() => processPlannedProject(projectId, index + 1))
        )
      );

      for (const result of results) {
        newCount += result.newCount;
        updatedCount += result.updatedCount;
      }

      callbacks?.onProgressPercent?.(85);
      setSyncProgress(85);

      const partialState: PartialSyncState = {
        currentPhase: "planned_projects",
        initialIssuesSync:
          existingPartialSync?.initialIssuesSync || "complete",
        projectSyncs: existingPartialSync?.projectSyncs || [],
        plannedProjectsSync: "complete",
        plannedProjectSyncs: plannedProjectSyncStatuses,
        completedProjectsSync: existingPartialSync?.completedProjectsSync,
        completedProjectSyncs: existingPartialSync?.completedProjectSyncs,
      };
      savePartialSyncState(partialState);
    } else {
      callbacks?.onProgressPercent?.(85);
      setSyncProgress(85);
    }
  } catch (error) {
    if (error instanceof RateLimitError) {
      const partialState: PartialSyncState = {
        currentPhase: "planned_projects",
        initialIssuesSync:
          existingPartialSync?.initialIssuesSync || "complete",
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


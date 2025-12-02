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
    apiQueryCount,
    updatePhase,
    shouldRunPhase,
    getProjectSyncLimit,
  } = context;

  let newCount = 0;
  let updatedCount = 0;

  if (!shouldRunPhase("completed_projects")) {
    console.log("[SYNC] Skipping completed projects phase (not selected)");
    return { newCount, updatedCount };
  }

  updatePhase("completed_projects");
  const completedProjectsProgressStart = 85;
  const completedProjectsProgressRange = 10;

  const shouldSyncCompleted =
    !isResuming ||
    !existingPartialSync ||
    existingPartialSync.completedProjectsSync !== "complete";

  if (!shouldSyncCompleted) {
    console.log("[SYNC] Completed projects already synced, skipping");
    return { newCount, updatedCount };
  }

  try {
    console.log("[SYNC] Fetching completed projects (last 6 months)...");
    let completedProjectIds = await linearClient.fetchCompletedProjects();
    console.log(
      `[SYNC] Found ${completedProjectIds.length} completed project(s) from last 6 months`
    );

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
      const limit = pLimit(PROJECT_SYNC_CONCURRENCY);
      let completedCount = 0;

      const processCompletedProject = async (
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

        const statusIndex = completedProjectSyncStatuses.findIndex(
          (p) => p.projectId === projectId
        );
        if (statusIndex >= 0) {
          completedProjectSyncStatuses[statusIndex].status = "complete";
        }

        activeProjectIds.add(projectId);

        completedCount++;
        const completedProjectProgressAfter =
          completedProjectsProgressStart +
          Math.round(
            (completedCount / completedProjectsToSync.length) *
              completedProjectsProgressRange
          );
        callbacks?.onProgressPercent?.(completedProjectProgressAfter);
        setSyncProgress(completedProjectProgressAfter);

        const partialState: PartialSyncState = {
          currentPhase: "completed_projects",
          initialIssuesSync:
            existingPartialSync?.initialIssuesSync || "complete",
          projectSyncs: existingPartialSync?.projectSyncs || [],
          plannedProjectsSync:
            existingPartialSync?.plannedProjectsSync || "complete",
          plannedProjectSyncs: existingPartialSync?.plannedProjectSyncs || [],
          completedProjectsSync: "incomplete",
          completedProjectSyncs: [...completedProjectSyncStatuses],
        };
        savePartialSyncState(partialState);

        return issueCounts;
      };

      const results = await Promise.all(
        completedProjectsToSync.map((projectId, index) =>
          limit(() => processCompletedProject(projectId, index + 1))
        )
      );

      for (const result of results) {
        newCount += result.newCount;
        updatedCount += result.updatedCount;
      }

      callbacks?.onProgressPercent?.(95);
      setSyncProgress(95);

      const partialState: PartialSyncState = {
        currentPhase: "completed_projects",
        initialIssuesSync:
          existingPartialSync?.initialIssuesSync || "complete",
        projectSyncs: existingPartialSync?.projectSyncs || [],
        plannedProjectsSync:
          existingPartialSync?.plannedProjectsSync || "complete",
        plannedProjectSyncs: existingPartialSync?.plannedProjectSyncs || [],
        completedProjectsSync: "complete",
        completedProjectSyncs: completedProjectSyncStatuses,
      };
      savePartialSyncState(partialState);
    } else {
      callbacks?.onProgressPercent?.(95);
      setSyncProgress(95);
    }
  } catch (error) {
    if (error instanceof RateLimitError) {
      const partialState: PartialSyncState = {
        currentPhase: "completed_projects",
        initialIssuesSync:
          existingPartialSync?.initialIssuesSync || "complete",
        projectSyncs: existingPartialSync?.projectSyncs || [],
        plannedProjectsSync:
          existingPartialSync?.plannedProjectsSync || "complete",
        plannedProjectSyncs: existingPartialSync?.plannedProjectSyncs || [],
        completedProjectsSync: "incomplete",
        completedProjectSyncs: [],
      };
      savePartialSyncState(partialState);
      const errorMsg =
        "Rate limit exceeded during completed projects sync";
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


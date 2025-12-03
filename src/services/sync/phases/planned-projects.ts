import type { PhaseContext } from "../types.js";
import pLimit from "p-limit";
import { PROJECT_SYNC_CONCURRENCY, getProjectSyncLimit } from "../helpers.js";
import { writeIssuesToDatabase } from "../utils.js";
import { computeAndStoreProjects } from "../compute-projects.js";
import {
  savePartialSyncState,
  setSyncProgress,
  setSyncStatus,
  setSyncStatusMessage,
  updateSyncMetadata,
} from "../../../db/queries.js";
import type { PartialSyncState } from "../../../db/queries.js";
import { RateLimitError } from "../../../linear/client.js";

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
  const plannedProjectsProgressStart = 35;
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
    setSyncStatusMessage("Fetching planned projects...");
    console.log("[SYNC] Fetching planned projects...");
    const plannedProjectIds = await linearClient.fetchPlannedProjects();
    console.log(`[SYNC] Found ${plannedProjectIds.length} planned project(s)`);

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
      // Shared cancellation flag - when rate limit is hit, set this to stop all concurrent operations
      const cancelled = { value: false };

      const processPlannedProject = async (
        projectId: string,
        projectIndex: number
      ) => {
        // Check cancellation flag before starting
        if (cancelled.value) {
          return {
            issueCounts: { newCount: 0, updatedCount: 0 },
            projectIndex,
          };
        }

        setSyncStatusMessage(
          `Syncing planned project ${projectIndex} of ${plannedProjectsToSync.length}`
        );

        let singleProjectIssues;
        try {
          singleProjectIssues = await linearClient.fetchIssuesByProjects(
            [projectId],
            undefined,
            projectDescriptionsMap,
            projectUpdatesMap
          );
        } catch (error) {
          // If rate limit error, cancel all other operations and rethrow
          if (error instanceof RateLimitError) {
            cancelled.value = true;
            throw error;
          }
          throw error;
        }

        // Check cancellation after API call
        if (cancelled.value) {
          return {
            issueCounts: { newCount: 0, updatedCount: 0 },
            projectIndex,
          };
        }

        let issueCounts = { newCount: 0, updatedCount: 0 };
        if (singleProjectIssues.length > 0) {
          issueCounts = writeIssuesToDatabase(singleProjectIssues);
        }

        // Check cancellation before additional API calls
        if (cancelled.value) {
          return {
            issueCounts: { newCount: 0, updatedCount: 0 },
            projectIndex,
          };
        }

        // Fetch project labels and content directly from Linear API
        const projectLabelsMap = new Map<string, string[]>();
        const projectContentMap = new Map<string, string | null>();
        try {
          const projectData = await linearClient.fetchProjectData(projectId);
          projectLabelsMap.set(projectId, projectData.labels);
          projectContentMap.set(projectId, projectData.content);
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

        await computeAndStoreProjects(
          projectLabelsMap,
          projectDescriptionsMap,
          projectUpdatesMap,
          new Set([projectId]),
          true,
          projectContentMap
        );

        const statusIndex = plannedProjectSyncStatuses.findIndex(
          (p) => p.projectId === projectId
        );
        if (statusIndex >= 0) {
          plannedProjectSyncStatuses[statusIndex].status = "complete";
        }

        activeProjectIds.add(projectId);

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

        return { issueCounts, projectIndex };
      };

      const results = await Promise.allSettled(
        plannedProjectsToSync.map((projectId, index) =>
          limit(() => processPlannedProject(projectId, index + 1))
        )
      );

      // Check if any promise was rejected due to rate limit
      const rateLimitError = results.find(
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

      // Filter out rejected promises (non-rate-limit errors are logged but don't stop sync)
      const successfulResults = results
        .filter((r) => r.status === "fulfilled")
        .map((r) => (r.status === "fulfilled" ? r.value : null))
        .filter((v) => v !== null);

      // Collect counts safely after all promises complete
      for (const result of successfulResults) {
        if (result) {
          newCount += result.issueCounts.newCount;
          updatedCount += result.issueCounts.updatedCount;
        }
      }

      // Update progress sequentially based on sorted results to avoid race conditions
      const sortedResults = [...successfulResults].sort(
        (a, b) => (a?.projectIndex || 0) - (b?.projectIndex || 0)
      );
      for (let i = 0; i < sortedResults.length; i++) {
        const completedCount = i + 1;
        const plannedProjectProgressAfter =
          plannedProjectsProgressStart +
          Math.round(
            (completedCount / plannedProjectsToSync.length) *
              plannedProjectsProgressRange
          );
        callbacks?.onProgressPercent?.(plannedProjectProgressAfter);
        setSyncProgress(plannedProjectProgressAfter);
      }

      callbacks?.onProgressPercent?.(50);
      setSyncProgress(50);

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
    } else {
      callbacks?.onProgressPercent?.(50);
      setSyncProgress(50);
    }
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

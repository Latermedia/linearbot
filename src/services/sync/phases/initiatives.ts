import type { PhaseContext } from "../types.js";
import {
  upsertInitiative,
  savePartialSyncState,
  setSyncProgress,
  setSyncStatus,
  updateSyncMetadata,
} from "../../../db/queries.js";
import type { Initiative, PartialSyncState } from "../../../db/queries.js";
import { RateLimitError } from "../../../linear/client.js";

export async function syncInitiatives(context: PhaseContext): Promise<void> {
  const {
    linearClient,
    callbacks,
    existingPartialSync,
    isResuming,
    apiQueryCount,
    updatePhase,
    shouldRunPhase,
    getProjectSyncLimit,
  } = context;

  if (!shouldRunPhase("initiatives")) {
    console.log("[SYNC] Skipping initiatives phase (not selected)");
    return;
  }

  updatePhase("initiatives");

  const shouldSyncInitiatives =
    !isResuming ||
    !existingPartialSync ||
    existingPartialSync.initiativesSync !== "complete";

  if (!shouldSyncInitiatives) {
    console.log("[SYNC] Initiatives already synced, skipping");
    return;
  }

  try {
    console.log("[SYNC] Fetching initiatives...");
    callbacks?.onProgressPercent?.(97);
    setSyncProgress(97);
    const allInitiatives = await linearClient.fetchInitiatives();

    const initiativeLimit = getProjectSyncLimit();
    let initiatives = allInitiatives;
    if (initiativeLimit !== null && allInitiatives.length > initiativeLimit) {
      initiatives = allInitiatives.slice(0, initiativeLimit);
      console.log(
        `[SYNC] Limiting initiatives to ${initiativeLimit} (found ${allInitiatives.length} total). Set LIMIT_SYNC=false to sync all initiatives.`
      );
    }

    if (initiatives.length > 0) {
      console.log(
        `[SYNC] Writing ${initiatives.length} initiative(s) to database...`
      );
      const activeInitiativeIds = new Set<string>();

      for (const initiativeData of initiatives) {
        activeInitiativeIds.add(initiativeData.id);

        // Fetch health updates for this initiative
        let healthUpdates: any[] = [];
        try {
          const updates = await linearClient.fetchInitiativeUpdates(
            initiativeData.id
          );
          healthUpdates = updates;
          if (updates.length > 0) {
            console.log(
              `[SYNC] Fetched ${updates.length} health update(s) for initiative: ${initiativeData.name || initiativeData.id}`
            );
          }
        } catch (error) {
          console.warn(
            `[SYNC] Failed to fetch health updates for initiative ${initiativeData.id}:`,
            error instanceof Error ? error.message : error
          );
          // Continue without updates - they're optional
        }

        const initiative: Initiative = {
          id: initiativeData.id,
          name: initiativeData.name,
          description: initiativeData.description,
          status: initiativeData.status,
          target_date: initiativeData.targetDate,
          completed_at: initiativeData.completedAt,
          started_at: initiativeData.startedAt,
          archived_at: initiativeData.archivedAt,
          health: initiativeData.health,
          health_updated_at: initiativeData.healthUpdatedAt,
          health_updates:
            healthUpdates.length > 0 ? JSON.stringify(healthUpdates) : null,
          owner_id: initiativeData.ownerId,
          owner_name: initiativeData.ownerName,
          creator_id: initiativeData.creatorId,
          creator_name: initiativeData.creatorName,
          project_ids:
            initiativeData.projectIds.length > 0
              ? JSON.stringify(initiativeData.projectIds)
              : null,
          created_at: initiativeData.createdAt,
          updated_at: initiativeData.updatedAt,
        };
        upsertInitiative(initiative);
      }

      // Note: We no longer delete initiatives - all data is preserved for historical tracking
    }

    const partialState: PartialSyncState = {
      currentPhase: "initiatives",
      initialIssuesSync: existingPartialSync?.initialIssuesSync || "complete",
      projectSyncs: existingPartialSync?.projectSyncs || [],
      plannedProjectsSync:
        existingPartialSync?.plannedProjectsSync || "complete",
      plannedProjectSyncs: existingPartialSync?.plannedProjectSyncs || [],
      completedProjectsSync:
        existingPartialSync?.completedProjectsSync || "complete",
      completedProjectSyncs: existingPartialSync?.completedProjectSyncs || [],
      initiativesSync: "complete",
    };
    savePartialSyncState(partialState);
    console.log(`[SYNC] Synced ${initiatives.length} initiative(s)`);
  } catch (error) {
    if (error instanceof RateLimitError) {
      const partialState: PartialSyncState = {
        currentPhase: "initiatives",
        initialIssuesSync: existingPartialSync?.initialIssuesSync || "complete",
        projectSyncs: existingPartialSync?.projectSyncs || [],
        plannedProjectsSync:
          existingPartialSync?.plannedProjectsSync || "complete",
        plannedProjectSyncs: existingPartialSync?.plannedProjectSyncs || [],
        completedProjectsSync:
          existingPartialSync?.completedProjectsSync || "complete",
        completedProjectSyncs: existingPartialSync?.completedProjectSyncs || [],
        initiativesSync: "incomplete",
      };
      savePartialSyncState(partialState);
      const errorMsg = "Rate limit exceeded during initiatives sync";
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
      `[SYNC] Error fetching initiatives (continuing anyway):`,
      error instanceof Error ? error.message : error
    );
  }
}

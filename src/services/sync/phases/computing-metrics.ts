import type { LinearIssueData } from "../../../linear/client.js";
import type { PhaseContext } from "../types.js";
import { setSyncProgress } from "../../../db/queries.js";
import { computeAndStoreProjects } from "../compute-projects.js";
import { computeAndStoreEngineers } from "../compute-engineers.js";

export interface ComputingMetricsResult {
  projectCount: number;
  engineerCount: number;
}

export async function syncComputingMetrics(
  context: PhaseContext,
  startedIssues: LinearIssueData[],
  recentlyUpdatedIssues: LinearIssueData[],
  activeProjectIds: Set<string>
): Promise<ComputingMetricsResult> {
  const { callbacks, projectDescriptionsMap, projectUpdatesMap, updatePhase } =
    context;

  updatePhase("computing_metrics");
  callbacks?.onProgressPercent?.(95);
  setSyncProgress(95);
  console.log(`[SYNC] Computing metrics from database...`);

  // Collect project IDs that were synced incrementally (if any)
  // These are used to preserve last_synced_at timestamps
  const incrementallySyncedProjectIds = new Set<string>();
  for (const projectId of projectUpdatesMap.keys()) {
    incrementallySyncedProjectIds.add(projectId);
  }
  for (const projectId of activeProjectIds) {
    incrementallySyncedProjectIds.add(projectId);
  }

  // computeAndStoreProjects reads all issues from database via getAllIssues()
  // Labels and content are now fetched directly in earlier sync phases
  // If not provided, computeAndStoreProjects will preserve existing labels/content from DB
  // The maps are optional - they're only used if provided (for labels, descriptions, updates, content)
  const computedProjectCount = await computeAndStoreProjects(
    undefined, // Labels should already be synced in earlier phases
    projectDescriptionsMap.size > 0 ? projectDescriptionsMap : undefined,
    projectUpdatesMap.size > 0 ? projectUpdatesMap : undefined,
    incrementallySyncedProjectIds.size > 0
      ? incrementallySyncedProjectIds
      : undefined,
    false, // Don't skip deletion - this is the final cleanup
    undefined // Content should already be synced in earlier phases
  );
  console.log(`[SYNC] Computed metrics for ${computedProjectCount} project(s)`);

  // computeAndStoreEngineers reads started issues from database via getStartedIssues()
  console.log(`[SYNC] Computing engineer WIP metrics...`);
  callbacks?.onProgressPercent?.(95);
  setSyncProgress(95);
  const computedEngineerCount = computeAndStoreEngineers();
  console.log(
    `[SYNC] Computed metrics for ${computedEngineerCount} engineer(s)`
  );

  return {
    projectCount: computedProjectCount,
    engineerCount: computedEngineerCount,
  };
}

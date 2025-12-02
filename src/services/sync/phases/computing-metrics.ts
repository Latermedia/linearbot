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
  const {
    callbacks,
    projectDescriptionsMap,
    projectUpdatesMap,
    updatePhase,
    shouldRunPhase,
  } = context;

  if (!shouldRunPhase("computing_metrics")) {
    console.log("[SYNC] Skipping computing metrics phase (not selected)");
    return {
      projectCount: activeProjectIds.size,
      engineerCount: 0,
    };
  }

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

  // Collect project labels from started/recently updated issues for projects not synced incrementally
  // Note: If running compute metrics standalone, these will be empty, but that's okay
  // because computeAndStoreProjects reads all issues from the database anyway
  const projectLabelsMapForCleanup = new Map<string, string[]>();
  for (const issue of [...startedIssues, ...recentlyUpdatedIssues]) {
    if (
      issue.projectId &&
      issue.projectLabels &&
      issue.projectLabels.length > 0 &&
      !incrementallySyncedProjectIds.has(issue.projectId)
    ) {
      if (!projectLabelsMapForCleanup.has(issue.projectId)) {
        projectLabelsMapForCleanup.set(issue.projectId, issue.projectLabels);
      }
    }
  }

  // computeAndStoreProjects reads all issues from database via getAllIssues()
  // The maps are optional - they're only used if provided (for labels, descriptions, updates)
  const computedProjectCount = await computeAndStoreProjects(
    projectLabelsMapForCleanup.size > 0 ? projectLabelsMapForCleanup : undefined,
    projectDescriptionsMap.size > 0 ? projectDescriptionsMap : undefined,
    projectUpdatesMap.size > 0 ? projectUpdatesMap : undefined,
    incrementallySyncedProjectIds.size > 0 ? incrementallySyncedProjectIds : undefined,
    false // Don't skip deletion - this is the final cleanup
  );
  console.log(
    `[SYNC] Computed metrics for ${computedProjectCount} project(s)`
  );

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


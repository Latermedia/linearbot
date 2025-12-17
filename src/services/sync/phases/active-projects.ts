import type { LinearIssueData } from "../../../linear/client.js";
import type { PhaseContext } from "../types.js";
import { setSyncStatus, updateSyncMetadata } from "../../../db/queries.js";
import { RateLimitError } from "../../../linear/client.js";
import {
  processProjectsInParallel,
  type ProjectProcessingConfig,
} from "../utils/project-processor.js";

export interface ActiveProjectsResult {
  newCount: number;
  updatedCount: number;
}

export async function syncActiveProjects(
  context: PhaseContext,
  startedIssues: LinearIssueData[],
  recentlyUpdatedIssues: LinearIssueData[]
): Promise<ActiveProjectsResult> {
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

  if (!shouldRunPhase("active_projects")) {
    console.log("[SYNC] Skipping active projects phase (not selected)");
    return { newCount, updatedCount };
  }

  updatePhase("active_projects");

  // Collect project IDs from both started issues and recently updated issues
  const projectIdsFromStartedIssues = new Set(
    startedIssues
      .filter((issue) => issue.projectId)
      .map((issue) => issue.projectId as string)
  );

  const projectIdsFromRecentlyUpdated = new Set(
    recentlyUpdatedIssues
      .filter((issue) => issue.projectId)
      .map((issue) => issue.projectId as string)
  );

  // Merge project IDs from both sources
  const projectIdsFromIssues = new Set<string>();
  for (const id of projectIdsFromStartedIssues) {
    projectIdsFromIssues.add(id);
  }
  for (const id of projectIdsFromRecentlyUpdated) {
    projectIdsFromIssues.add(id);
  }

  // Build a map of project IDs to project names
  const projectNameMap = new Map<string, string>();
  for (const issue of [...startedIssues, ...recentlyUpdatedIssues]) {
    if (issue.projectId && issue.projectName) {
      projectNameMap.set(issue.projectId, issue.projectName);
    }
  }

  // Add to activeProjectIds set
  for (const id of projectIdsFromIssues) {
    activeProjectIds.add(id);
  }

  const projectCount = projectIdsFromIssues.size;
  callbacks?.onProjectCountUpdate?.(projectCount);
  console.log(
    `[SYNC] Found ${projectCount} active project(s): ${projectIdsFromStartedIssues.size} from started issues, ${projectIdsFromRecentlyUpdated.size} from recently updated issues`
  );

  if (projectIdsFromIssues.size > 0) {
    // Determine which projects to sync based on partial sync state
    let projectsToSync: string[] = Array.from(projectIdsFromIssues);
    let projectSyncStatuses: Array<{
      projectId: string;
      status: "complete" | "incomplete";
    }> = [];

    if (isResuming && existingPartialSync) {
      const completedProjectIds = new Set(
        existingPartialSync.projectSyncs
          .filter((p) => p.status === "complete")
          .map((p) => p.projectId)
      );
      projectsToSync = projectsToSync.filter(
        (id) => !completedProjectIds.has(id)
      );
      projectSyncStatuses = existingPartialSync.projectSyncs.filter((p) =>
        projectIdsFromIssues.has(p.projectId)
      );
      console.log(
        `[SYNC] Resuming: ${projectsToSync.length} projects remaining (${completedProjectIds.size} already completed)`
      );
    } else {
      projectSyncStatuses = Array.from(projectIdsFromIssues).map((id) => ({
        projectId: id,
        status: "incomplete" as const,
      }));
    }

    // Apply project limit for local development
    const projectLimit = getProjectSyncLimit();
    const originalProjectCount = projectsToSync.length;
    if (projectLimit !== null && projectsToSync.length > projectLimit) {
      projectsToSync = projectsToSync.slice(0, projectLimit);
      console.log(
        `[SYNC] Limiting to ${projectLimit} projects (found ${originalProjectCount} total). Set LIMIT_SYNC=false to sync all projects.`
      );
    } else if (projectLimit === null) {
      console.log(
        `[SYNC] Syncing all ${projectsToSync.length} projects (full sync enabled by default)`
      );
    }

    try {
      const config: ProjectProcessingConfig = {
        phaseName: "active_projects",
        statusMessagePrefix: "Syncing project",
        projectNameMap,
        onProgress: (count) => {
          callbacks?.onProjectIssueCountUpdate?.(count);
        },
        updatePartialSyncState: (
          _projectId,
          projectSyncStatuses,
          _existingPartialSync
        ) => {
          return {
            currentPhase: "active_projects",
            initialIssuesSync: "complete",
            projectSyncs: [...projectSyncStatuses],
          };
        },
        addToActiveProjectIds: false, // Already added above
        useAtomicProgress: true,
      };

      const result = await processProjectsInParallel({
        linearClient,
        projectsToSync,
        projectSyncStatuses,
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

      const totalProjectIssues = result.results.reduce(
        (sum, r) => sum + r.projectIssueCount,
        0
      );
      console.log(
        `[SYNC] Fetched ${totalProjectIssues} issues from ${projectsToSync.length} project(s)`
      );
    } catch (error) {
      if (error instanceof RateLimitError) {
        const errorMsg = "Rate limit exceeded during project issues sync";
        console.error(`[SYNC] ${errorMsg}`);
        setSyncStatus("error");
        updateSyncMetadata({
          sync_error: errorMsg,
          sync_progress_percent: null,
          api_query_count: apiQueryCount,
        });
        throw error;
      }
      throw error;
    }
  }
  // Progress is handled by query-based tracking

  return { newCount, updatedCount };
}

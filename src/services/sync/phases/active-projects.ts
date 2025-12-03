import type { LinearIssueData } from "../../../linear/client.js";
import type { PhaseContext } from "../types.js";
import pLimit from "p-limit";
import { PROJECT_SYNC_CONCURRENCY } from "../helpers.js";
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
    apiQueryCount,
    updatePhase,
    shouldRunPhase,
    getProjectSyncLimit,
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

    const activeProjectsProgressStart = 20;
    const activeProjectsProgressRange = 15;

    try {
      const limit = pLimit(PROJECT_SYNC_CONCURRENCY);
      // Use atomic counter to prevent race conditions when updating progress
      const completedCountLock = { value: 0 };

      const processProject = async (
        projectId: string,
        projectIndex: number
      ) => {
        const projectName = projectNameMap.get(projectId) || null;
        const displayName = projectName || projectId.slice(0, 8);

        setSyncStatusMessage(
          `Syncing project ${projectIndex} of ${projectsToSync.length}: ${displayName}`
        );

        console.log(
          `[SYNC] Processing project ${projectIndex}/${projectsToSync.length}: ${projectName || projectId}`
        );

        // Calculate base progress for this project (before fetching)
        const projectBaseProgress =
          activeProjectsProgressStart +
          Math.round(
            ((projectIndex - 1) / projectsToSync.length) *
              activeProjectsProgressRange
          );
        const projectProgressRange =
          activeProjectsProgressRange / projectsToSync.length;

        let maxIssueCount = 0;
        const singleProjectIssues = await linearClient.fetchIssuesByProjects(
          [projectId],
          (count) => {
            callbacks?.onProjectIssueCountUpdate?.(count);
            // Update progress during fetch: base + incremental based on issues fetched
            maxIssueCount = Math.max(maxIssueCount, count);
            // Estimate: assume up to 100 issues per project, scale progress accordingly
            const fetchProgress =
              projectBaseProgress +
              Math.min(
                Math.round((count / 100) * projectProgressRange),
                Math.round(projectProgressRange * 0.8)
              );
            callbacks?.onProgressPercent?.(fetchProgress);
            setSyncProgress(fetchProgress);
          },
          projectDescriptionsMap,
          projectUpdatesMap
        );

        let issueCounts = { newCount: 0, updatedCount: 0 };
        let projectIssueCount = 0;
        if (singleProjectIssues.length > 0) {
          console.log(
            `[SYNC] Writing ${singleProjectIssues.length} issues for project ${projectName || projectId}...`
          );
          issueCounts = writeIssuesToDatabase(singleProjectIssues);
          projectIssueCount = singleProjectIssues.length;
        }

        // Fetch project labels and content directly from Linear API
        const projectLabelsMap = new Map<string, string[]>();
        const projectContentMap = new Map<string, string | null>();
        try {
          const projectData = await linearClient.fetchProjectData(projectId);
          projectLabelsMap.set(projectId, projectData.labels);
          projectContentMap.set(projectId, projectData.content);
        } catch (error) {
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

        const statusIndex = projectSyncStatuses.findIndex(
          (p) => p.projectId === projectId
        );
        if (statusIndex >= 0) {
          projectSyncStatuses[statusIndex].status = "complete";
        } else {
          projectSyncStatuses.push({ projectId, status: "complete" });
        }

        // Update progress incrementally after each project completes
        // Use atomic counter to prevent race conditions
        completedCountLock.value++;
        const currentCompleted = completedCountLock.value;
        const projectProgressAfter =
          activeProjectsProgressStart +
          Math.round(
            (currentCompleted / projectsToSync.length) *
              activeProjectsProgressRange
          );
        callbacks?.onProjectProgress?.(
          currentCompleted,
          projectsToSync.length,
          projectName
        );
        callbacks?.onProgressPercent?.(projectProgressAfter);
        setSyncProgress(projectProgressAfter);

        const partialState: PartialSyncState = {
          currentPhase: "active_projects",
          initialIssuesSync: "complete",
          projectSyncs: [...projectSyncStatuses],
        };
        savePartialSyncState(partialState);

        return {
          projectId,
          issueCounts,
          projectIndex,
          projectIssueCount,
          projectName,
        };
      };

      const results = await Promise.all(
        projectsToSync.map((projectId, index) =>
          limit(() => processProject(projectId, index + 1))
        )
      );

      // Collect counts safely after all promises complete
      let totalProjectIssues = 0;
      for (const result of results) {
        newCount += result.issueCounts.newCount;
        updatedCount += result.issueCounts.updatedCount;
        totalProjectIssues += result.projectIssueCount;
      }

      // Progress is already updated incrementally inside processProject
      // Just ensure we're at 35% after all projects complete
      callbacks?.onProgressPercent?.(35);
      setSyncProgress(35);
      console.log(
        `[SYNC] Fetched ${totalProjectIssues} issues from ${projectsToSync.length} project(s)`
      );
    } catch (error) {
      if (error instanceof RateLimitError) {
        const partialState: PartialSyncState = {
          currentPhase: "active_projects",
          initialIssuesSync: "complete",
          projectSyncs: projectSyncStatuses,
        };
        savePartialSyncState(partialState);
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
  } else {
    callbacks?.onProgressPercent?.(35);
    setSyncProgress(35);
  }

  return { newCount, updatedCount };
}

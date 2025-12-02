import {
  createLinearClient,
  type ProjectUpdate,
  RateLimitError,
  type LinearIssueData,
} from "../../linear/client.js";
import { isMockMode, generateMockData } from "../mock-data.js";
import {
  deleteIssuesByTeams,
  getTotalIssueCount,
  updateSyncMetadata,
  setSyncStatus,
  setSyncProgress,
  getPartialSyncState,
  savePartialSyncState,
  clearPartialSyncState,
  getSyncMetadata,
  getStartedIssues,
} from "../../db/queries.js";
import type { SyncPhase } from "../../db/queries.js";
import type {
  SyncResult,
  SyncCallbacks,
  SyncOptions,
} from "./types.js";
import { convertDbIssueToLinearFormat } from "./utils.js";
import { writeIssuesToDatabase } from "./utils.js";
import {
  getProjectSyncLimit,
  PROJECT_SYNC_CONCURRENCY,
  createShouldRunPhase,
  createUpdatePhase,
} from "./helpers.js";
import { computeAndStoreProjects } from "./compute-projects.js";
import { computeAndStoreEngineers } from "./compute-engineers.js";
import { syncInitialIssues } from "./phases/initial-issues.js";
import { syncRecentlyUpdatedIssues } from "./phases/recently-updated-issues.js";
import { syncActiveProjects } from "./phases/active-projects.js";
import { syncPlannedProjects } from "./phases/planned-projects.js";
import { syncCompletedProjects } from "./phases/completed-projects.js";
import { syncInitiativeProjects } from "./phases/initiative-projects.js";
import { syncInitiatives } from "./phases/initiatives.js";
import { syncComputingMetrics } from "./phases/computing-metrics.js";
import type { PhaseContext } from "./types.js";

/**
 * Performs sync of Linear issues to local database
 * @param includeProjectSync - Whether to also fetch all issues from active projects (deprecated, use syncOptions instead)
 * @param callbacks - Optional callbacks for progress updates
 * @param syncOptions - Optional sync options specifying which phases to run
 */
export async function performSync(
  includeProjectSync: boolean = true,
  callbacks?: SyncCallbacks,
  syncOptions?: SyncOptions
): Promise<SyncResult> {
  // Declare variables at function scope so they're accessible in catch blocks
  let allIssues: LinearIssueData[] = [];
  let startedIssues: LinearIssueData[] = [];
  let recentlyUpdatedIssues: LinearIssueData[] = [];
  let cumulativeNewCount = 0;
  let cumulativeUpdatedCount = 0;
  let apiQueryCount = 0;
  let currentPhase: SyncPhase = "initial_issues";

  // Helper function to increment API query count and update database
  const incrementApiQuery = () => {
    apiQueryCount++;
    updateSyncMetadata({ api_query_count: apiQueryCount });
  };

  // Create helper functions
  const { updatePhase, currentPhaseRef } = createUpdatePhase();
  const shouldRunPhase = createShouldRunPhase(syncOptions);

  // Determine includeProjectSync from syncOptions if provided
  const effectiveIncludeProjectSync =
    syncOptions?.phases.includes("active_projects") ?? includeProjectSync;

  // Wrap entire function in try-catch to ensure we never crash the app
  try {
    // Reset API query count at start of sync
    updateSyncMetadata({ api_query_count: 0 });

    // Check for existing partial sync state
    const existingPartialSync = getPartialSyncState();
    const isResuming = existingPartialSync !== null;

    if (isResuming) {
      console.log("[SYNC] Resuming partial sync from previous attempt");
      if (existingPartialSync?.currentPhase) {
        currentPhase = existingPartialSync.currentPhase;
        currentPhaseRef.current = currentPhase;
      }
      const metadata = getSyncMetadata();
      const lastError = metadata?.sync_error || "";
      if (
        !lastError.includes("rate limit") &&
        !lastError.includes("Rate limit")
      ) {
        console.log(
          "[SYNC] Previous error was not rate limit related, clearing partial sync state"
        );
        clearPartialSyncState();
        setSyncStatus("idle");
      }
    }

    // Update sync status to 'syncing'
    setSyncStatus("syncing");
    updateSyncMetadata({ sync_error: null, sync_progress_percent: 0 });

    // Check for mock mode
    if (isMockMode()) {
      console.log("[SYNC] Running in mock mode - using generated data");
      callbacks?.onProgressPercent?.(10);
      setSyncProgress(10);

      const { issues, projectDescriptions, projectUpdates } =
        generateMockData();

      const startedMockIssues = issues.filter((i) => i.stateType === "started");
      callbacks?.onIssueCountUpdate?.(startedMockIssues.length);
      callbacks?.onProgressPercent?.(30);
      setSyncProgress(30);

      const projectIds = new Set(
        issues.filter((i) => i.projectId).map((i) => i.projectId as string)
      );
      callbacks?.onProjectCountUpdate?.(projectIds.size);
      callbacks?.onProgressPercent?.(50);
      setSyncProgress(50);

      console.log(`[SYNC] Writing ${issues.length} mock issues to database...`);
      const counts = writeIssuesToDatabase(issues);
      callbacks?.onProjectIssueCountUpdate?.(issues.length);
      callbacks?.onProgressPercent?.(70);
      setSyncProgress(70);

      const projectLabelsMap = new Map<string, string[]>();
      for (const issue of issues) {
        if (issue.projectId && issue.projectLabels?.length > 0) {
          if (!projectLabelsMap.has(issue.projectId)) {
            projectLabelsMap.set(issue.projectId, issue.projectLabels);
          }
        }
      }

      console.log("[SYNC] Computing project metrics...");
      const computedProjectCount = await computeAndStoreProjects(
        projectLabelsMap,
        projectDescriptions,
        projectUpdates,
        projectIds
      );

      console.log("[SYNC] Computing engineer WIP metrics...");
      const computedEngineerCount = computeAndStoreEngineers();
      console.log(
        `[SYNC] Computed metrics for ${computedEngineerCount} engineer(s)`
      );

      callbacks?.onProgressPercent?.(100);
      setSyncProgress(100);

      const syncTime = new Date().toISOString();
      setSyncStatus("idle");
      updateSyncMetadata({
        last_sync_time: syncTime,
        sync_error: null,
        sync_progress_percent: null,
      });

      const total = getTotalIssueCount();
      console.log(
        `[SYNC] Mock sync complete - New: ${counts.newCount}, Updated: ${counts.updatedCount}, Total: ${total}, Projects: ${computedProjectCount}, Engineers: ${computedEngineerCount}`
      );

      return {
        success: true,
        newCount: counts.newCount,
        updatedCount: counts.updatedCount,
        totalCount: total,
        issueCount: startedMockIssues.length,
        projectCount: computedProjectCount,
        projectIssueCount: issues.length,
      };
    }

    // Get ignored team keys
    const ignoredTeamKeys = process.env.IGNORED_TEAM_KEYS
      ? process.env.IGNORED_TEAM_KEYS.split(",").map((key) => key.trim())
      : [];

    // Connect to Linear with query counter
    const linearClient = createLinearClient(undefined, incrementApiQuery);
    callbacks?.onProgressPercent?.(0);
    setSyncProgress(0);
    console.log("[SYNC] Testing Linear API connection...");
    const connected = await linearClient.testConnection();

    if (!connected) {
      const errorMsg = "Failed to connect to Linear. Check your API key.";
      console.error("[SYNC] Failed to connect to Linear API");
      setSyncStatus("error");
      updateSyncMetadata({ sync_error: errorMsg, sync_progress_percent: null });
      clearPartialSyncState();
      return {
        success: false,
        newCount: 0,
        updatedCount: 0,
        totalCount: 0,
        issueCount: 0,
        projectCount: 0,
        projectIssueCount: 0,
        error: errorMsg,
      };
    }
    console.log("[SYNC] Linear API connection successful");

    // Build phase context
    const activeProjectIds = new Set<string>();
    const projectDescriptionsMap = new Map<string, string | null>();
    const projectUpdatesMap = new Map<string, ProjectUpdate[]>();

    const phaseContext: PhaseContext = {
      linearClient,
      callbacks,
      syncOptions,
      existingPartialSync,
      isResuming,
      ignoredTeamKeys,
      startedIssues: [],
      recentlyUpdatedIssues: [],
      activeProjectIds,
      projectDescriptionsMap,
      projectUpdatesMap,
      cumulativeNewCount,
      cumulativeUpdatedCount,
      apiQueryCount,
      updatePhase,
      shouldRunPhase,
      getProjectSyncLimit,
    };

    // Phase 1: Initial Issues
    const initialIssuesResult = await syncInitialIssues(phaseContext);
    allIssues = initialIssuesResult.allIssues;
    startedIssues = allIssues;
    cumulativeNewCount += initialIssuesResult.newCount;
    cumulativeUpdatedCount += initialIssuesResult.updatedCount;
    phaseContext.startedIssues = startedIssues;
    phaseContext.cumulativeNewCount = cumulativeNewCount;
    phaseContext.cumulativeUpdatedCount = cumulativeUpdatedCount;

    // Phase 2: Recently Updated Issues
    const recentlyUpdatedResult = await syncRecentlyUpdatedIssues(
      phaseContext,
      startedIssues
    );
    recentlyUpdatedIssues = recentlyUpdatedResult.recentlyUpdatedIssues;
    cumulativeNewCount += recentlyUpdatedResult.newCount;
    cumulativeUpdatedCount += recentlyUpdatedResult.updatedCount;
    phaseContext.recentlyUpdatedIssues = recentlyUpdatedIssues;
    phaseContext.cumulativeNewCount = cumulativeNewCount;
    phaseContext.cumulativeUpdatedCount = cumulativeUpdatedCount;

    // Phase 3: Active Projects
    if (shouldRunPhase("active_projects") && effectiveIncludeProjectSync) {
      const activeProjectsResult = await syncActiveProjects(
        phaseContext,
        startedIssues,
        recentlyUpdatedIssues
      );
      cumulativeNewCount += activeProjectsResult.newCount;
      cumulativeUpdatedCount += activeProjectsResult.updatedCount;
      phaseContext.cumulativeNewCount = cumulativeNewCount;
      phaseContext.cumulativeUpdatedCount = cumulativeUpdatedCount;
    } else {
      console.log("[SYNC] Skipping active projects phase (not selected)");
    }

    // Phase 4: Planned Projects
    if (shouldRunPhase("planned_projects")) {
      const plannedProjectsResult = await syncPlannedProjects(phaseContext);
      cumulativeNewCount += plannedProjectsResult.newCount;
      cumulativeUpdatedCount += plannedProjectsResult.updatedCount;
      phaseContext.cumulativeNewCount = cumulativeNewCount;
      phaseContext.cumulativeUpdatedCount = cumulativeUpdatedCount;
    } else {
      console.log("[SYNC] Skipping planned projects phase (not selected)");
    }

    // Phase 5: Completed Projects
    if (shouldRunPhase("completed_projects")) {
      const completedProjectsResult = await syncCompletedProjects(phaseContext);
      cumulativeNewCount += completedProjectsResult.newCount;
      cumulativeUpdatedCount += completedProjectsResult.updatedCount;
      phaseContext.cumulativeNewCount = cumulativeNewCount;
      phaseContext.cumulativeUpdatedCount = cumulativeUpdatedCount;
    } else {
      console.log("[SYNC] Skipping completed projects phase (not selected)");
    }

    // Remove ignored teams from database
    if (ignoredTeamKeys.length > 0) {
      deleteIssuesByTeams(ignoredTeamKeys);
      console.log(
        `[SYNC] Removed issues from ${ignoredTeamKeys.length} ignored team(s)`
      );
    }

    const total = getTotalIssueCount();
    console.log(`[SYNC] Database now contains ${total} total issue(s)`);

    const startedCount = startedIssues.filter(
      (i) => i.stateType === "started"
    ).length;

    // Phase 7: Initiatives (must come before initiative_projects)
    if (shouldRunPhase("initiatives")) {
      await syncInitiatives(phaseContext);
    } else {
      console.log("[SYNC] Skipping initiatives phase (not selected)");
    }

    // Phase 8: Initiative Projects (runs after initiatives are synced to DB)
    // This ensures we have all projects for the initiatives we've loaded
    if (shouldRunPhase("initiative_projects")) {
      const initiativeProjectsResult = await syncInitiativeProjects(phaseContext);
      cumulativeNewCount += initiativeProjectsResult.newCount;
      cumulativeUpdatedCount += initiativeProjectsResult.updatedCount;
      phaseContext.cumulativeNewCount = cumulativeNewCount;
      phaseContext.cumulativeUpdatedCount = cumulativeUpdatedCount;
    } else {
      console.log("[SYNC] Skipping initiative projects phase (not selected)");
    }

    let computedProjectCount = activeProjectIds.size;
    let computedEngineerCount = 0;

    // Phase 9: Computing Metrics (final phase - runs after all data is synced)
    if (shouldRunPhase("computing_metrics")) {
      const computingMetricsResult = await syncComputingMetrics(
        phaseContext,
        startedIssues,
        recentlyUpdatedIssues,
        activeProjectIds
      );
      computedProjectCount = computingMetricsResult.projectCount;
      computedEngineerCount = computingMetricsResult.engineerCount;
    } else {
      console.log("[SYNC] Skipping computing metrics phase (not selected)");
    }

    // Final phase complete
    updatePhase("complete");
    callbacks?.onProgressPercent?.(100);
    setSyncProgress(100);

    console.log(
      `[SYNC] Summary - New: ${cumulativeNewCount}, Updated: ${cumulativeUpdatedCount}, Started: ${startedCount}, Projects: ${computedProjectCount}, Engineers: ${computedEngineerCount}`
    );

    const syncTime = new Date().toISOString();
    clearPartialSyncState();
    setSyncStatus("idle");
    updateSyncMetadata({
      last_sync_time: syncTime,
      sync_error: null,
      sync_progress_percent: null,
      api_query_count: apiQueryCount,
    });

    return {
      success: true,
      newCount: cumulativeNewCount,
      updatedCount: cumulativeUpdatedCount,
      totalCount: total,
      issueCount: startedCount,
      projectCount: computedProjectCount,
      projectIssueCount: 0,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "An unknown error occurred";
    console.error(`[SYNC] Sync error: ${errorMessage}`, error);

    const isRateLimit =
      error instanceof RateLimitError ||
      errorMessage.includes("Rate limit") ||
      errorMessage.includes("rate limit") ||
      errorMessage.includes("RATELIMITED");

    if (isRateLimit) {
      const existingPartialSync = getPartialSyncState();
      if (!existingPartialSync) {
        const partialState = {
          currentPhase: currentPhaseRef.current,
          initialIssuesSync: "complete" as const,
          projectSyncs: [],
        };
        savePartialSyncState(partialState);
        console.log(
          `[SYNC] Saved partial sync state (fallback): ${JSON.stringify(
            partialState
          )}`
        );
      }
      const errorMsg = "Rate limit exceeded during sync";
      setSyncStatus("error");
      updateSyncMetadata({
        sync_error: errorMsg,
        sync_progress_percent: null,
        api_query_count: apiQueryCount,
      });
      const total = getTotalIssueCount();
      const startedCount =
        startedIssues.length > 0
          ? startedIssues.filter((i) => i.stateType === "started").length
          : 0;
      return {
        success: false,
        newCount: cumulativeNewCount,
        updatedCount: cumulativeUpdatedCount,
        totalCount: total,
        issueCount: startedCount,
        projectCount: 0,
        projectIssueCount: 0,
        error: errorMsg,
      };
    }

    const isSchemaError =
      (errorMessage.includes("values for") &&
        errorMessage.includes("columns")) ||
      errorMessage.includes("no such column") ||
      errorMessage.includes("table_info");

    const finalError = isSchemaError
      ? `${errorMessage}\n\n💡 Tip: This looks like a schema mismatch. Try resetting the database:\n   bun run reset-db`
      : errorMessage;

    clearPartialSyncState();
    setSyncStatus("error");
    updateSyncMetadata({
      sync_error: finalError,
      sync_progress_percent: null,
    });

    return {
      success: false,
      newCount: 0,
      updatedCount: 0,
      totalCount: 0,
      issueCount: 0,
      projectCount: 0,
      projectIssueCount: 0,
      error: finalError,
    };
  }
}

// Re-export syncProject function
export { syncProject } from "./sync-project.js";


import {
  createLinearClient,
  type ProjectUpdate,
  RateLimitError,
  type LinearIssueData,
  type LinearInitiativeData,
} from "../linear/client.js";
import { isMockMode, generateMockData } from "./mock-data.js";
import pLimit from "p-limit";
import {
  getExistingIssueIds,
  upsertIssue,
  deleteIssuesByTeams,
  getTotalIssueCount,
  getAllIssues,
  getAllProjects,
  getProjectById,
  upsertProject,
  deleteProjectsByProjectIds,
  updateSyncMetadata,
  setSyncStatus,
  setSyncProgress,
  getPartialSyncState,
  savePartialSyncState,
  clearPartialSyncState,
  getSyncMetadata,
  getStartedIssues,
  upsertEngineer,
  getExistingEngineerIds,
  deleteEngineersByIds,
  getAllInitiatives,
  upsertInitiative,
  deleteInitiativesByIds,
  type PartialSyncState,
  type SyncPhase,
} from "../db/queries.js";
import type { Issue, Project, Engineer, Initiative } from "../db/schema.js";
import { WIP_THRESHOLDS, PROJECT_THRESHOLDS } from "../constants/thresholds.js";
import {
  hasStatusMismatch,
  isStaleUpdate,
  isMissingLead,
} from "../utils/status-helpers.js";
import {
  hasViolations,
  hasMissingEstimate,
  hasMissingPriority,
  hasNoRecentComment,
  hasWIPAgeViolation,
  hasMissingDescription,
  hasMissingProjectScopedLabels,
} from "../utils/issue-validators.js";
import {
  calculateTotalPoints,
  calculateAverageCycleTime,
  calculateAverageLeadTime,
  calculateLinearProgress,
  calculateVelocity,
  calculateVelocityByTeam,
  calculateEstimateAccuracy,
} from "../lib/utils/project-helpers.js";

export interface SyncResult {
  success: boolean;
  newCount: number;
  updatedCount: number;
  totalCount: number;
  issueCount: number;
  projectCount: number;
  projectIssueCount: number;
  error?: string;
}

export interface SyncCallbacks {
  onIssueCountUpdate?: (count: number) => void;
  onProjectCountUpdate?: (count: number) => void;
  onProjectIssueCountUpdate?: (count: number) => void;
  onProgressPercent?: (percent: number) => void;
  onProjectProgress?: (
    currentIndex: number,
    total: number,
    projectName: string | null
  ) => void;
}

export interface SyncOptions {
  phases: SyncPhase[];
  isFullSync: boolean;
}

/**
 * Get the maximum number of projects/initiatives to sync per type
 * Defaults to no limit (full sync). Set LIMIT_SYNC=true to limit to 10 for local development
 */
function getProjectSyncLimit(): number | null {
  const limitSync = process.env.LIMIT_SYNC === "true";
  if (limitSync) {
    return 10; // Limit to 10 when LIMIT_SYNC is enabled
  }
  return null; // null means no limit (default: full sync)
}

/**
 * Concurrency limit for parallel project processing
 */
const PROJECT_SYNC_CONCURRENCY = 3;

/**
 * Convert database Issue format to LinearIssueData format
 */
function convertDbIssueToLinearFormat(dbIssue: Issue): LinearIssueData {
  return {
    id: dbIssue.id,
    identifier: dbIssue.identifier,
    title: dbIssue.title,
    description: dbIssue.description,
    teamId: dbIssue.team_id,
    teamName: dbIssue.team_name,
    teamKey: dbIssue.team_key,
    stateId: dbIssue.state_id,
    stateName: dbIssue.state_name,
    stateType: dbIssue.state_type,
    assigneeId: dbIssue.assignee_id,
    assigneeName: dbIssue.assignee_name,
    assigneeAvatarUrl: dbIssue.assignee_avatar_url,
    creatorId: dbIssue.creator_id,
    creatorName: dbIssue.creator_name,
    priority: dbIssue.priority,
    estimate: dbIssue.estimate,
    lastCommentAt: dbIssue.last_comment_at
      ? new Date(dbIssue.last_comment_at)
      : null,
    commentCount: dbIssue.comment_count ?? null,
    createdAt: new Date(dbIssue.created_at),
    updatedAt: new Date(dbIssue.updated_at),
    startedAt: dbIssue.started_at ? new Date(dbIssue.started_at) : null,
    completedAt: dbIssue.completed_at ? new Date(dbIssue.completed_at) : null,
    canceledAt: dbIssue.canceled_at ? new Date(dbIssue.canceled_at) : null,
    url: dbIssue.url,
    projectId: dbIssue.project_id,
    projectName: dbIssue.project_name,
    projectStateCategory: dbIssue.project_state_category,
    projectStatus: dbIssue.project_status,
    projectHealth: dbIssue.project_health,
    projectUpdatedAt: dbIssue.project_updated_at
      ? new Date(dbIssue.project_updated_at)
      : null,
    projectLeadId: dbIssue.project_lead_id,
    projectLeadName: dbIssue.project_lead_name,
    projectLabels: [], // Database doesn't store project labels, but that's okay for determining project IDs
    projectTargetDate: dbIssue.project_target_date,
    projectStartDate: dbIssue.project_start_date,
    projectCompletedAt: dbIssue.project_completed_at,
    parentId: dbIssue.parent_id,
    labels: dbIssue.labels ? JSON.parse(dbIssue.labels) : null,
  };
}

/**
 * Write issues to database and return counts
 */
function writeIssuesToDatabase(
  issues: Array<{
    id: string;
    identifier: string;
    title: string;
    description: string | null;
    teamId: string;
    teamName: string;
    teamKey: string;
    stateId: string;
    stateName: string;
    stateType: string;
    assigneeId: string | null;
    assigneeName: string | null;
    assigneeAvatarUrl: string | null;
    creatorId: string | null;
    creatorName: string | null;
    priority: number | null;
    estimate: number | null;
    lastCommentAt: Date | null;
    commentCount: number | null;
    createdAt: Date;
    updatedAt: Date;
    startedAt: Date | null;
    completedAt: Date | null;
    canceledAt: Date | null;
    url: string;
    projectId: string | null;
    projectName: string | null;
    projectStateCategory: string | null;
    projectStatus: string | null;
    projectHealth: string | null;
    projectUpdatedAt: Date | null;
    projectLeadId: string | null;
    projectLeadName: string | null;
    projectTargetDate: string | null;
    projectStartDate: string | null;
    projectCompletedAt: string | null;
    parentId: string | null;
    labels: Array<{
      id: string;
      name: string;
      color: string;
      description: string | null;
      team: { id: string; name: string } | null;
      parent: { id: string; name: string } | null;
    }> | null;
  }>
): { newCount: number; updatedCount: number } {
  const existingIds = getExistingIssueIds();
  let newCount = 0;
  let updatedCount = 0;

  for (const issue of issues) {
    if (existingIds.has(issue.id)) {
      updatedCount++;
    } else {
      newCount++;
    }

    upsertIssue({
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description,
      team_id: issue.teamId,
      team_name: issue.teamName,
      team_key: issue.teamKey,
      state_id: issue.stateId,
      state_name: issue.stateName,
      state_type: issue.stateType,
      assignee_id: issue.assigneeId,
      assignee_name: issue.assigneeName,
      assignee_avatar_url: issue.assigneeAvatarUrl,
      creator_id: issue.creatorId,
      creator_name: issue.creatorName,
      priority: issue.priority,
      estimate: issue.estimate,
      last_comment_at: issue.lastCommentAt
        ? issue.lastCommentAt.toISOString()
        : null,
      comment_count: issue.commentCount ?? null,
      created_at: issue.createdAt.toISOString(),
      updated_at: issue.updatedAt.toISOString(),
      started_at: issue.startedAt ? issue.startedAt.toISOString() : null,
      completed_at: issue.completedAt ? issue.completedAt.toISOString() : null,
      canceled_at: issue.canceledAt ? issue.canceledAt.toISOString() : null,
      url: issue.url,
      project_id: issue.projectId,
      project_name: issue.projectName,
      project_state_category: issue.projectStateCategory,
      project_status: issue.projectStatus,
      project_health: issue.projectHealth,
      project_updated_at: issue.projectUpdatedAt
        ? issue.projectUpdatedAt.toISOString()
        : null,
      project_lead_id: issue.projectLeadId,
      project_lead_name: issue.projectLeadName,
      project_target_date: issue.projectTargetDate,
      project_start_date: issue.projectStartDate,
      project_completed_at: issue.projectCompletedAt,
      parent_id: issue.parentId,
      labels: issue.labels ? JSON.stringify(issue.labels) : null,
    });
  }

  return { newCount, updatedCount };
}

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
  let projectIssues: LinearIssueData[] = [];
  let cumulativeNewCount = 0;
  let cumulativeUpdatedCount = 0;
  let apiQueryCount = 0; // Track API queries for monitoring
  let currentPhase: SyncPhase = "initial_issues";

  // Helper function to increment API query count and update database
  const incrementApiQuery = () => {
    apiQueryCount++;
    // Update database incrementally so we have a value during partial sync
    updateSyncMetadata({ api_query_count: apiQueryCount });
  };

  // Helper function to update phase and save partial sync state
  const updatePhase = (phase: SyncPhase) => {
    currentPhase = phase;
    // Always try to update partial sync state if it exists
    const existingPartialSync = getPartialSyncState();
    if (existingPartialSync) {
      existingPartialSync.currentPhase = phase;
      savePartialSyncState(existingPartialSync);
    }
  };

  // Helper function to check if a phase should run
  const shouldRunPhase = (phase: SyncPhase): boolean => {
    if (!syncOptions) {
      // Default behavior: run all phases if no options provided
      return true;
    }
    return syncOptions.phases.includes(phase);
  };

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
      // Restore phase from partial sync state
      if (existingPartialSync?.currentPhase) {
        currentPhase = existingPartialSync.currentPhase;
      }
      // Only resume if the error was rate limit related
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

    // Check for mock mode (no Linear API key or set to "mock")
    if (isMockMode()) {
      console.log("[SYNC] Running in mock mode - using generated data");
      callbacks?.onProgressPercent?.(10);
      setSyncProgress(10);

      const { issues, projectDescriptions, projectUpdates } =
        generateMockData();

      // Filter to only started issues for the main count
      const startedMockIssues = issues.filter((i) => i.stateType === "started");
      callbacks?.onIssueCountUpdate?.(startedMockIssues.length);
      callbacks?.onProgressPercent?.(30);
      setSyncProgress(30);

      // Get unique project IDs
      const projectIds = new Set(
        issues.filter((i) => i.projectId).map((i) => i.projectId as string)
      );
      callbacks?.onProjectCountUpdate?.(projectIds.size);
      callbacks?.onProgressPercent?.(50);
      setSyncProgress(50);

      // Write mock issues to database
      console.log(`[SYNC] Writing ${issues.length} mock issues to database...`);
      const counts = writeIssuesToDatabase(issues);
      callbacks?.onProjectIssueCountUpdate?.(issues.length);
      callbacks?.onProgressPercent?.(70);
      setSyncProgress(70);

      // Collect project labels for metrics computation
      const projectLabelsMap = new Map<string, string[]>();
      for (const issue of issues) {
        if (issue.projectId && issue.projectLabels?.length > 0) {
          if (!projectLabelsMap.has(issue.projectId)) {
            projectLabelsMap.set(issue.projectId, issue.projectLabels);
          }
        }
      }

      // Compute and store project metrics
      console.log("[SYNC] Computing project metrics...");
      const computedProjectCount = await computeAndStoreProjects(
        projectLabelsMap,
        projectDescriptions,
        projectUpdates,
        projectIds // All projects were synced in mock data path
      );

      // Compute and store engineer WIP metrics
      console.log("[SYNC] Computing engineer WIP metrics...");
      const computedEngineerCount = computeAndStoreEngineers();
      console.log(
        `[SYNC] Computed metrics for ${computedEngineerCount} engineer(s)`
      );

      callbacks?.onProgressPercent?.(100);
      setSyncProgress(100);

      // Update sync metadata on success
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
      // Clear partial sync state for non-rate-limit errors
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

    // Phase 1: Fetch started issues (5% of total)
    if (shouldRunPhase("initial_issues")) {
      updatePhase("initial_issues");
      callbacks?.onProgressPercent?.(5);
      setSyncProgress(5);
      if (
        !isResuming ||
        !existingPartialSync ||
        existingPartialSync.initialIssuesSync === "incomplete"
      ) {
      // Fetch started issues from Linear API
      try {
        allIssues = await linearClient.fetchStartedIssues((count) => {
          callbacks?.onIssueCountUpdate?.(count);
        });
        console.log(
          `[SYNC] Fetched ${allIssues.length} started issues from Linear`
        );
      } catch (error) {
        if (error instanceof RateLimitError) {
          // Write any partial data we might have before exiting
          // (In this case, we have none since fetch failed, but structure is ready)
          const partialState: PartialSyncState = {
            currentPhase: "initial_issues",
            initialIssuesSync: "incomplete",
            projectSyncs: [],
          };
          savePartialSyncState(partialState);
          const errorMsg = "Rate limit exceeded during initial issues sync";
          console.error(`[SYNC] ${errorMsg}`);
          setSyncStatus("error");
          updateSyncMetadata({
            sync_error: errorMsg,
            sync_progress_percent: null,
            api_query_count: apiQueryCount,
          });
          const total = getTotalIssueCount();
          return {
            success: false,
            newCount: cumulativeNewCount,
            updatedCount: cumulativeUpdatedCount,
            totalCount: total,
            issueCount: 0,
            projectCount: 0,
            projectIssueCount: 0,
            error: errorMsg,
          };
        }
        throw error;
      }
    } else {
      // Resuming with initial sync complete - load started issues from database
      // to determine which projects to sync
      console.log(
        "[SYNC] Loading started issues from database for project sync determination"
      );
      const dbStartedIssues = getStartedIssues();
      allIssues = dbStartedIssues.map(convertDbIssueToLinearFormat);
      console.log(
        `[SYNC] Loaded ${allIssues.length} started issues from database`
      );
      }
    } else {
      // Phase skipped - load started issues from database if they exist
      console.log("[SYNC] Skipping initial issues phase (not selected)");
      const dbStartedIssues = getStartedIssues();
      allIssues = dbStartedIssues.map(convertDbIssueToLinearFormat);
      console.log(
        `[SYNC] Loaded ${allIssues.length} started issues from database`
      );
    }

    // Filter ignored teams
    startedIssues = allIssues.filter(
      (issue) => !ignoredTeamKeys.includes(issue.teamKey)
    );
    if (ignoredTeamKeys.length > 0 && allIssues.length > 0) {
      const filteredCount = allIssues.length - startedIssues.length;
      console.log(
        `[SYNC] Filtered out ${filteredCount} issues from ${ignoredTeamKeys.length} ignored team(s)`
      );
    }

    // Write started issues to database immediately after fetching
    // Skip writing if resuming with initial sync complete (they're already in the database)
    if (
      startedIssues.length > 0 &&
      (!isResuming ||
        !existingPartialSync ||
        existingPartialSync.initialIssuesSync === "incomplete")
    ) {
      console.log(
        `[SYNC] Writing ${startedIssues.length} started issues to database...`
      );
      const counts = writeIssuesToDatabase(startedIssues);
      cumulativeNewCount += counts.newCount;
      cumulativeUpdatedCount += counts.updatedCount;
      console.log(
        `[SYNC] Wrote started issues - New: ${counts.newCount}, Updated: ${counts.updatedCount}`
      );
    } else if (
      isResuming &&
      existingPartialSync &&
      existingPartialSync.initialIssuesSync === "complete"
    ) {
      console.log(
        `[SYNC] Skipping write of started issues (already in database from previous sync)`
      );
    }

    // Phase 2: Fetch recently updated issues (5% of total, cumulative 10%)
    let recentlyUpdatedIssues: LinearIssueData[] = [];
    if (shouldRunPhase("recently_updated_issues")) {
      updatePhase("recently_updated_issues");
      callbacks?.onProgressPercent?.(10);
      setSyncProgress(10);
      const skipRecentlyUpdated = process.env.SKIP_RECENTLY_UPDATED_ISSUES === "true";
      if (skipRecentlyUpdated) {
        console.log("[SYNC] Skipping recently updated issues fetch (SKIP_RECENTLY_UPDATED_ISSUES=true)");
      } else if (
      !isResuming ||
      !existingPartialSync ||
      existingPartialSync.initialIssuesSync === "incomplete"
    ) {
      try {
        recentlyUpdatedIssues = await linearClient.fetchRecentlyUpdatedIssues(
          PROJECT_THRESHOLDS.RECENT_ACTIVITY_DAYS,
          (_count) => {
            // Progress callback for recently updated issues
            // Note: This is separate from started issues count
          }
        );
        console.log(
          `[SYNC] Fetched ${recentlyUpdatedIssues.length} recently updated issues from Linear`
        );

        // Filter ignored teams from recently updated issues
        recentlyUpdatedIssues = recentlyUpdatedIssues.filter(
          (issue) => !ignoredTeamKeys.includes(issue.teamKey)
        );

        // Deduplicate: remove issues that are already in startedIssues
        const startedIssueIds = new Set(startedIssues.map((i) => i.id));
        recentlyUpdatedIssues = recentlyUpdatedIssues.filter(
          (issue) => !startedIssueIds.has(issue.id)
        );

        // Write recently updated issues to database (deduplicated)
        if (recentlyUpdatedIssues.length > 0) {
          console.log(
            `[SYNC] Writing ${recentlyUpdatedIssues.length} recently updated issues to database...`
          );
          const counts = writeIssuesToDatabase(recentlyUpdatedIssues);
          cumulativeNewCount += counts.newCount;
          cumulativeUpdatedCount += counts.updatedCount;
          console.log(
            `[SYNC] Wrote recently updated issues - New: ${counts.newCount}, Updated: ${counts.updatedCount}`
          );
        }
      } catch (error) {
        if (error instanceof RateLimitError) {
          // Save partial sync state before exiting
          const partialState: PartialSyncState = {
            currentPhase: "recently_updated_issues",
            initialIssuesSync: "complete",
            projectSyncs: [],
          };
          savePartialSyncState(partialState);
          const errorMsg =
            "Rate limit exceeded during recently updated issues sync";
          console.error(`[SYNC] ${errorMsg}`);
          setSyncStatus("error");
          updateSyncMetadata({
            sync_error: errorMsg,
            sync_progress_percent: null,
            api_query_count: apiQueryCount,
          });
          const total = getTotalIssueCount();
          return {
            success: false,
            newCount: cumulativeNewCount,
            updatedCount: cumulativeUpdatedCount,
            totalCount: total,
            issueCount: startedIssues.length,
            projectCount: 0,
            projectIssueCount: 0,
            error: errorMsg,
          };
        }
        // For non-rate-limit errors, log but continue (recently updated issues are supplementary)
        console.error(
          `[SYNC] Error fetching recently updated issues (continuing anyway):`,
          error instanceof Error ? error.message : error
        );
      }
    } else {
      console.log("[SYNC] Skipping recently updated issues phase (not selected)");
    }


    // Phase 3: Fetch all issues for projects with active work (optional)
    if (shouldRunPhase("active_projects") && effectiveIncludeProjectSync) {
      updatePhase("active_projects");
    let projectCount = 0;
    const activeProjectIds = new Set<string>();
    const projectDescriptionsMap = new Map<string, string | null>();
    const projectUpdatesMap = new Map<string, ProjectUpdate[]>();

    if (includeProjectSync) {
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

      // Build a map of project IDs to project names from both sources
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

      projectCount = projectIdsFromIssues.size;
      callbacks?.onProjectCountUpdate?.(projectCount);
      const startedCount = projectIdsFromStartedIssues.size;
      const recentlyUpdatedCount = projectIdsFromRecentlyUpdated.size;
      console.log(
        `[SYNC] Found ${projectCount} active project(s): ${startedCount} from started issues, ${recentlyUpdatedCount} from recently updated issues`
      );

      if (projectIdsFromIssues.size > 0) {
        // Determine which projects to sync based on partial sync state
        let projectsToSync: string[] = Array.from(projectIdsFromIssues);
        let projectSyncStatuses: Array<{
          projectId: string;
          status: "complete" | "incomplete";
        }> = [];

        if (isResuming && existingPartialSync) {
          // Filter to only incomplete projects
          const completedProjectIds = new Set(
            existingPartialSync.projectSyncs
              .filter((p) => p.status === "complete")
              .map((p) => p.projectId)
          );
          projectsToSync = projectsToSync.filter(
            (id) => !completedProjectIds.has(id)
          );
          // Initialize statuses from existing state
          projectSyncStatuses = existingPartialSync.projectSyncs.filter((p) =>
            projectIdsFromIssues.has(p.projectId)
          );
          console.log(
            `[SYNC] Resuming: ${projectsToSync.length} projects remaining (${completedProjectIds.size} already completed)`
          );
        } else {
          // Initialize all projects as incomplete
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

        // Phase 3: Active Projects (60% of total, distributed across projects)
        // Progress: 10% (from previous phases) + 60% for active projects = 70% max
        // Each project gets 60% / projectsToSync.length
        const activeProjectsProgressStart = 10; // After initial + recently updated
        const activeProjectsProgressRange = 60; // 60% allocated to active projects

        // Process projects in parallel with concurrency limit
        try {
          const limit = pLimit(PROJECT_SYNC_CONCURRENCY);
          let completedCount = 0;
          let totalProjectIssues = 0;

          const processProject = async (projectId: string, projectIndex: number) => {
            const projectName = projectNameMap.get(projectId) || null;

            console.log(
              `[SYNC] Processing project ${projectIndex + 1}/${projectsToSync.length}: ${projectName || projectId}`
            );

            // Fetch issues for this single project
            const singleProjectIssues =
              await linearClient.fetchIssuesByProjects(
                [projectId],
                (count) => {
                  callbacks?.onProjectIssueCountUpdate?.(count);
                },
                projectDescriptionsMap,
                projectUpdatesMap
              );

            // Write issues to database immediately
            let issueCounts = { newCount: 0, updatedCount: 0 };
            if (singleProjectIssues.length > 0) {
              console.log(
                `[SYNC] Writing ${singleProjectIssues.length} issues for project ${projectName || projectId}...`
              );
              issueCounts = writeIssuesToDatabase(singleProjectIssues);
              cumulativeNewCount += issueCounts.newCount;
              cumulativeUpdatedCount += issueCounts.updatedCount;
              totalProjectIssues += singleProjectIssues.length;
              console.log(
                `[SYNC] Wrote project issues - New: ${issueCounts.newCount}, Updated: ${issueCounts.updatedCount}`
              );
            }

            // Collect project labels from issues
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

            // Compute and store project metrics for this project immediately
            await computeAndStoreProjects(
              projectLabelsMap,
              projectDescriptionsMap,
              projectUpdatesMap,
              new Set([projectId]), // Only this project was synced
              true // Skip deletion during incremental sync
            );
            console.log(
              `[SYNC] Computed metrics for project ${projectName || projectId}`
            );

            // Mark this project as complete and update progress
            const statusIndex = projectSyncStatuses.findIndex(
              (p) => p.projectId === projectId
            );
            if (statusIndex >= 0) {
              projectSyncStatuses[statusIndex].status = "complete";
            } else {
              projectSyncStatuses.push({ projectId, status: "complete" });
            }

            // Update completed count and progress
            completedCount++;
            const projectProgressAfter =
              activeProjectsProgressStart +
              Math.round(
                (completedCount / projectsToSync.length) *
                  activeProjectsProgressRange
              );
            callbacks?.onProjectProgress?.(
              completedCount,
              projectsToSync.length,
              projectName
            );
            callbacks?.onProgressPercent?.(projectProgressAfter);
            setSyncProgress(projectProgressAfter);

            // Save partial sync state after each project (in case of interruption)
            const partialState: PartialSyncState = {
              currentPhase: "active_projects",
              initialIssuesSync: "complete",
              projectSyncs: [...projectSyncStatuses], // Copy array for thread safety
            };
            savePartialSyncState(partialState);

            return { projectId, issueCount: singleProjectIssues.length };
          };

          // Process all projects in parallel with concurrency limit
          await Promise.all(
            projectsToSync.map((projectId, index) =>
              limit(() => processProject(projectId, index + 1))
            )
          );

          // Accumulate all project issues for reporting
          projectIssues = []; // Will be empty since we wrote incrementally, but that's fine

          // All active projects complete - set to 70% (10% initial + 60% active)
          callbacks?.onProgressPercent?.(70);
          setSyncProgress(70);
          console.log(
            `[SYNC] Fetched ${totalProjectIssues} issues from ${projectsToSync.length} project(s)`
          );
          console.log(
            `[SYNC] Fetched descriptions for ${projectDescriptionsMap.size} project(s)`
          );
          console.log(
            `[SYNC] Fetched updates for ${projectUpdatesMap.size} project(s)`
          );
        } catch (error) {
          if (error instanceof RateLimitError) {
            // Save partial sync state before exiting
            const partialState: PartialSyncState = {
              currentPhase: "active_projects",
              initialIssuesSync: "complete",
              projectSyncs: projectSyncStatuses,
            };
            savePartialSyncState(partialState);
            const errorMsg = "Rate limit exceeded during project issues sync";
            console.error(`[SYNC] ${errorMsg}`);
            console.log(
              `[SYNC] Saved partial sync state: ${JSON.stringify(partialState)}`
            );
            setSyncStatus("error");
            updateSyncMetadata({
              sync_error: errorMsg,
              sync_progress_percent: null,
              api_query_count: apiQueryCount,
            });
            const total = getTotalIssueCount();
            const startedCount = startedIssues.filter(
              (i) => i.stateType === "started"
            ).length;
            return {
              success: false,
              newCount: cumulativeNewCount,
              updatedCount: cumulativeUpdatedCount,
              totalCount: total,
              issueCount: startedCount,
              projectCount: projectSyncStatuses.filter(
                (p) => p.status === "complete"
              ).length,
              projectIssueCount: 0, // We don't track this incrementally
              error: errorMsg,
            };
          }
          throw error;
        }
      } else {
        // No active projects, move to next phase
        callbacks?.onProgressPercent?.(70);
        setSyncProgress(70);
      }
    } else {
      // No project sync, move to next phase
      callbacks?.onProgressPercent?.(70);
      setSyncProgress(70);
    }

    // Phase 4: Fetch planned projects and their issues (15% of total, cumulative 85%)
    updatePhase("planned_projects");
    const plannedProjectsProgressStart = 70; // After active projects
    const plannedProjectsProgressRange = 15; // 15% allocated to planned projects
    let plannedProjectIds: string[] = [];
    let plannedProjectIssues: LinearIssueData[] = [];
    let plannedProjectSyncStatuses: Array<{
      projectId: string;
      status: "complete" | "incomplete";
    }> = [];

    if (includeProjectSync) {
      // Check if we need to sync planned projects
      const shouldSyncPlanned =
        !isResuming ||
        !existingPartialSync ||
        existingPartialSync.plannedProjectsSync !== "complete";

      if (shouldSyncPlanned) {
        try {
          console.log("[SYNC] Fetching planned projects...");
          plannedProjectIds = await linearClient.fetchPlannedProjects();
          console.log(
            `[SYNC] Found ${plannedProjectIds.length} planned project(s)`
          );

          // Determine which planned projects to sync based on partial sync state
          let plannedProjectsToSync: string[] = plannedProjectIds;
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
            console.log(
              `[SYNC] Resuming planned projects: ${plannedProjectsToSync.length} remaining (${completedPlannedIds.size} already completed)`
            );
          } else {
            plannedProjectSyncStatuses = plannedProjectIds.map((id) => ({
              projectId: id,
              status: "incomplete" as const,
            }));
          }

          // Apply project limit for local development
          const plannedProjectLimit = getProjectSyncLimit();
          const originalPlannedCount = plannedProjectsToSync.length;
          if (
            plannedProjectLimit !== null &&
            plannedProjectsToSync.length > plannedProjectLimit
          ) {
            plannedProjectsToSync = plannedProjectsToSync.slice(
              0,
              plannedProjectLimit
            );
            console.log(
              `[SYNC] Limiting planned projects to ${plannedProjectLimit} (found ${originalPlannedCount} total). Set LIMIT_SYNC=false to sync all projects.`
            );
          } else if (plannedProjectLimit === null) {
            console.log(
              `[SYNC] Syncing all ${plannedProjectsToSync.length} planned projects (full sync enabled by default)`
            );
          }

          // Process planned projects in parallel with concurrency limit
          if (plannedProjectsToSync.length > 0) {
            const limit = pLimit(PROJECT_SYNC_CONCURRENCY);
            let completedCount = 0;
            let totalPlannedProjectIssues = 0;

            const processPlannedProject = async (
              projectId: string,
              projectIndex: number
            ) => {
              console.log(
                `[SYNC] Processing planned project ${projectIndex + 1}/${plannedProjectsToSync.length}: ${projectId}`
              );

              // Fetch issues for this single planned project
              const singleProjectIssues =
                await linearClient.fetchIssuesByProjects(
                  [projectId],
                  undefined,
                  projectDescriptionsMap,
                  projectUpdatesMap
                );

              // Write issues to database immediately
              let issueCounts = { newCount: 0, updatedCount: 0 };
              if (singleProjectIssues.length > 0) {
                console.log(
                  `[SYNC] Writing ${singleProjectIssues.length} issues for planned project ${projectId}...`
                );
                issueCounts = writeIssuesToDatabase(singleProjectIssues);
                cumulativeNewCount += issueCounts.newCount;
                cumulativeUpdatedCount += issueCounts.updatedCount;
                totalPlannedProjectIssues += singleProjectIssues.length;
                console.log(
                  `[SYNC] Wrote planned project issues - New: ${issueCounts.newCount}, Updated: ${issueCounts.updatedCount}`
                );
              }

              // Collect project labels from issues
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

              // Compute and store project metrics for this planned project immediately
              await computeAndStoreProjects(
                projectLabelsMap,
                projectDescriptionsMap,
                projectUpdatesMap,
                new Set([projectId]), // Only this project was synced
                true // Skip deletion during incremental sync
              );
              console.log(
                `[SYNC] Computed metrics for planned project ${projectId}`
              );

              // Mark this planned project as complete
              const statusIndex = plannedProjectSyncStatuses.findIndex(
                (p) => p.projectId === projectId
              );
              if (statusIndex >= 0) {
                plannedProjectSyncStatuses[statusIndex].status = "complete";
              } else {
                plannedProjectSyncStatuses.push({
                  projectId,
                  status: "complete",
                });
              }

              // Add to activeProjectIds
              activeProjectIds.add(projectId);

              // Update completed count and progress
              completedCount++;
              const plannedProjectProgressAfter =
                plannedProjectsProgressStart +
                Math.round(
                  (completedCount / plannedProjectsToSync.length) *
                    plannedProjectsProgressRange
                );
              callbacks?.onProgressPercent?.(plannedProjectProgressAfter);
              setSyncProgress(plannedProjectProgressAfter);

              // Save partial sync state after each project
              const partialState: PartialSyncState = {
                currentPhase: "planned_projects",
                initialIssuesSync:
                  existingPartialSync?.initialIssuesSync || "complete",
                projectSyncs: existingPartialSync?.projectSyncs || [],
                plannedProjectsSync: "incomplete", // Still processing
                plannedProjectSyncs: [...plannedProjectSyncStatuses], // Copy for thread safety
                completedProjectsSync:
                  existingPartialSync?.completedProjectsSync,
                completedProjectSyncs:
                  existingPartialSync?.completedProjectSyncs,
              };
              savePartialSyncState(partialState);

              return { projectId, issueCount: singleProjectIssues.length };
            };

            // Process all planned projects in parallel with concurrency limit
            await Promise.all(
              plannedProjectsToSync.map((projectId, index) =>
                limit(() => processPlannedProject(projectId, index + 1))
              )
            );

            // Accumulate all planned project issues for reporting
            plannedProjectIssues = []; // Will be empty since we wrote incrementally
            // All planned projects complete - set to 85%
            callbacks?.onProgressPercent?.(85);
            setSyncProgress(85);
            console.log(
              `[SYNC] Fetched ${totalPlannedProjectIssues} issues from ${plannedProjectsToSync.length} planned project(s)`
            );
          } else {
            // No planned projects, move to next phase
            callbacks?.onProgressPercent?.(85);
            setSyncProgress(85);
          }

          // Save partial sync state for planned projects (mark as complete)
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
        } catch (error) {
          if (error instanceof RateLimitError) {
            const partialState: PartialSyncState = {
              currentPhase: "planned_projects",
              initialIssuesSync:
                existingPartialSync?.initialIssuesSync || "complete",
              projectSyncs: existingPartialSync?.projectSyncs || [],
              plannedProjectsSync: "incomplete",
              plannedProjectSyncs: plannedProjectSyncStatuses,
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
            const total = getTotalIssueCount();
            return {
              success: false,
              newCount: cumulativeNewCount,
              updatedCount: cumulativeUpdatedCount,
              totalCount: total,
              issueCount: startedIssues.filter((i) => i.stateType === "started")
                .length,
              projectCount: 0,
              projectIssueCount:
                projectIssues.length + plannedProjectIssues.length,
              error: errorMsg,
            };
          }
          // For non-rate-limit errors, log but continue
          console.error(
            `[SYNC] Error fetching planned projects (continuing anyway):`,
            error instanceof Error ? error.message : error
          );
        }
      }
    }

    // Phase 5: Fetch completed projects (last 6 months) and their issues (10% of total, cumulative 95%)
    updatePhase("completed_projects");
    const completedProjectsProgressStart = 85; // After planned projects
    const completedProjectsProgressRange = 10; // 10% allocated to completed projects
    let completedProjectIds: string[] = [];
    let completedProjectIssues: LinearIssueData[] = [];
    let completedProjectSyncStatuses: Array<{
      projectId: string;
      status: "complete" | "incomplete";
    }> = [];

    if (includeProjectSync) {
      // Check if we need to sync completed projects
      const shouldSyncCompleted =
        !isResuming ||
        !existingPartialSync ||
        existingPartialSync.completedProjectsSync !== "complete";

      if (shouldSyncCompleted) {
        try {
          console.log("[SYNC] Fetching completed projects (last 6 months)...");
          completedProjectIds = await linearClient.fetchCompletedProjects();
          console.log(
            `[SYNC] Found ${completedProjectIds.length} completed project(s) from last 6 months`
          );

          // Determine which completed projects to sync based on partial sync state
          let completedProjectsToSync: string[] = completedProjectIds;
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
            console.log(
              `[SYNC] Resuming completed projects: ${completedProjectsToSync.length} remaining (${completedIds.size} already completed)`
            );
          } else {
            completedProjectSyncStatuses = completedProjectIds.map((id) => ({
              projectId: id,
              status: "incomplete" as const,
            }));
          }

          // Apply project limit for local development
          const completedProjectLimit = getProjectSyncLimit();
          const originalCompletedCount = completedProjectsToSync.length;
          if (
            completedProjectLimit !== null &&
            completedProjectsToSync.length > completedProjectLimit
          ) {
            completedProjectsToSync = completedProjectsToSync.slice(
              0,
              completedProjectLimit
            );
            console.log(
              `[SYNC] Limiting completed projects to ${completedProjectLimit} (found ${originalCompletedCount} total). Set LIMIT_SYNC=false to sync all projects.`
            );
          } else if (completedProjectLimit === null) {
            console.log(
              `[SYNC] Syncing all ${completedProjectsToSync.length} completed projects (full sync enabled by default)`
            );
          }

          // Process completed projects in parallel with concurrency limit
          if (completedProjectsToSync.length > 0) {
            const limit = pLimit(PROJECT_SYNC_CONCURRENCY);
            let completedCount = 0;
            let totalCompletedProjectIssues = 0;

            const processCompletedProject = async (
              projectId: string,
              projectIndex: number
            ) => {
              console.log(
                `[SYNC] Processing completed project ${projectIndex + 1}/${completedProjectsToSync.length}: ${projectId}`
              );

              // Fetch issues for this single completed project
              const singleProjectIssues =
                await linearClient.fetchIssuesByProjects(
                  [projectId],
                  undefined,
                  projectDescriptionsMap,
                  projectUpdatesMap
                );

              // Write issues to database immediately
              let issueCounts = { newCount: 0, updatedCount: 0 };
              if (singleProjectIssues.length > 0) {
                console.log(
                  `[SYNC] Writing ${singleProjectIssues.length} issues for completed project ${projectId}...`
                );
                issueCounts = writeIssuesToDatabase(singleProjectIssues);
                cumulativeNewCount += issueCounts.newCount;
                cumulativeUpdatedCount += issueCounts.updatedCount;
                totalCompletedProjectIssues += singleProjectIssues.length;
                console.log(
                  `[SYNC] Wrote completed project issues - New: ${issueCounts.newCount}, Updated: ${issueCounts.updatedCount}`
                );
              }

              // Collect project labels from issues
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

              // Compute and store project metrics for this completed project immediately
              await computeAndStoreProjects(
                projectLabelsMap,
                projectDescriptionsMap,
                projectUpdatesMap,
                new Set([projectId]), // Only this project was synced
                true // Skip deletion during incremental sync
              );
              console.log(
                `[SYNC] Computed metrics for completed project ${projectId}`
              );

              // Mark this completed project as complete
              const statusIndex = completedProjectSyncStatuses.findIndex(
                (p) => p.projectId === projectId
              );
              if (statusIndex >= 0) {
                completedProjectSyncStatuses[statusIndex].status = "complete";
              } else {
                completedProjectSyncStatuses.push({
                  projectId,
                  status: "complete",
                });
              }

              // Add to activeProjectIds
              activeProjectIds.add(projectId);

              // Update completed count and progress
              completedCount++;
              const completedProjectProgressAfter =
                completedProjectsProgressStart +
                Math.round(
                  (completedCount / completedProjectsToSync.length) *
                    completedProjectsProgressRange
                );
              callbacks?.onProgressPercent?.(completedProjectProgressAfter);
              setSyncProgress(completedProjectProgressAfter);

              // Save partial sync state after each project
              const partialState: PartialSyncState = {
                currentPhase: "completed_projects",
                initialIssuesSync:
                  existingPartialSync?.initialIssuesSync || "complete",
                projectSyncs: existingPartialSync?.projectSyncs || [],
                plannedProjectsSync:
                  existingPartialSync?.plannedProjectsSync || "complete",
                plannedProjectSyncs:
                  existingPartialSync?.plannedProjectSyncs || [],
                completedProjectsSync: "incomplete", // Still processing
                completedProjectSyncs: [...completedProjectSyncStatuses], // Copy for thread safety
              };
              savePartialSyncState(partialState);

              return { projectId, issueCount: singleProjectIssues.length };
            };

            // Process all completed projects in parallel with concurrency limit
            await Promise.all(
              completedProjectsToSync.map((projectId, index) =>
                limit(() => processCompletedProject(projectId, index + 1))
              )
            );

            // Accumulate all completed project issues for reporting
            completedProjectIssues = []; // Will be empty since we wrote incrementally
            // All completed projects complete - set to 95%
            callbacks?.onProgressPercent?.(95);
            setSyncProgress(95);
            console.log(
              `[SYNC] Fetched ${totalCompletedProjectIssues} issues from ${completedProjectsToSync.length} completed project(s)`
            );
          } else {
            // No completed projects, move to next phase
            callbacks?.onProgressPercent?.(95);
            setSyncProgress(95);
          }

          // Save partial sync state for completed projects
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
        } catch (error) {
          if (error instanceof RateLimitError) {
            const partialState: PartialSyncState = {
              currentPhase: "completed_projects",
              initialIssuesSync:
                existingPartialSync?.initialIssuesSync || "complete",
              projectSyncs: existingPartialSync?.projectSyncs || [],
              plannedProjectsSync:
                existingPartialSync?.plannedProjectsSync || "complete",
              plannedProjectSyncs:
                existingPartialSync?.plannedProjectSyncs || [],
              completedProjectsSync: "incomplete",
              completedProjectSyncs: completedProjectSyncStatuses,
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
            const total = getTotalIssueCount();
            return {
              success: false,
              newCount: cumulativeNewCount,
              updatedCount: cumulativeUpdatedCount,
              totalCount: total,
              issueCount: startedIssues.filter((i) => i.stateType === "started")
                .length,
              projectCount: 0,
              projectIssueCount:
                projectIssues.length +
                plannedProjectIssues.length +
                completedProjectIssues.length,
              error: errorMsg,
            };
          }
          // For non-rate-limit errors, log but continue
          console.error(
            `[SYNC] Error fetching completed projects (continuing anyway):`,
            error instanceof Error ? error.message : error
          );
        }
      }
    }

    // Remove ignored teams from database (do this once at the end)
    if (ignoredTeamKeys.length > 0) {
      deleteIssuesByTeams(ignoredTeamKeys);
      console.log(
        `[SYNC] Removed issues from ${ignoredTeamKeys.length} ignored team(s)`
      );
    }

    // Get total count from database (issues already written incrementally)
    const total = getTotalIssueCount();
    console.log(`[SYNC] Database now contains ${total} total issue(s)`);

    // Count started issues for reporting
    const startedCount = startedIssues.filter(
      (i) => i.stateType === "started"
    ).length;

    // Declare variables for computed counts (used in final summary)
    let computedProjectCount = projectCount;
    let computedEngineerCount = 0;

    // Phase 6: Final cleanup - recompute projects that weren't synced and delete inactive ones (5% of total, cumulative 100%)
    // Note: Projects synced incrementally above are already computed, but we need to
    // recompute projects that only have started/recently updated issues (not full project sync)
    if (shouldRunPhase("computing_metrics")) {
      updatePhase("computing_metrics");
      callbacks?.onProgressPercent?.(95);
      setSyncProgress(95);
      console.log(`[SYNC] Performing final project cleanup and recomputation...`);

      // Collect project IDs that were synced incrementally (these don't need recomputation)
      const incrementallySyncedProjectIds = new Set<string>();
      for (const projectId of projectUpdatesMap.keys()) {
        incrementallySyncedProjectIds.add(projectId);
      }
      // Also add from activeProjectIds set which was populated during sync
      for (const projectId of activeProjectIds) {
        incrementallySyncedProjectIds.add(projectId);
      }

      // Collect project labels from started/recently updated issues for projects not synced incrementally
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

      // Do final pass: recompute projects that weren't synced incrementally and delete inactive ones
      // Pass the set of incrementally synced projects so their last_synced_at isn't overwritten
      computedProjectCount = await computeAndStoreProjects(
        projectLabelsMapForCleanup,
        projectDescriptionsMap, // May have descriptions for projects not synced incrementally
        projectUpdatesMap, // May have updates for projects not synced incrementally
        incrementallySyncedProjectIds, // Projects synced incrementally (preserve their last_synced_at)
        false // Don't skip deletion - this is the final cleanup
      );
      console.log(
        `[SYNC] Final cleanup complete. Active projects: ${computedProjectCount}`
      );

      // Compute and store engineer WIP metrics
      console.log(`[SYNC] Computing engineer WIP metrics...`);
      callbacks?.onProgressPercent?.(95);
      setSyncProgress(95);
      computedEngineerCount = computeAndStoreEngineers();
      console.log(
        `[SYNC] Computed metrics for ${computedEngineerCount} engineer(s)`
      );
    } else {
      console.log("[SYNC] Skipping computing metrics phase (not selected)");
    }

    // Phase 6.5: Sync projects associated with initiatives that aren't already synced
    if (shouldRunPhase("initiative_projects")) {
      updatePhase("initiative_projects");
      callbacks?.onProgressPercent?.(96);
      setSyncProgress(96);
      try {
        console.log("[SYNC] Fetching initiatives to identify missing projects...");
        const allInitiatives = await linearClient.fetchInitiatives();
        
        // Collect all project IDs from initiatives
        const projectIdsFromInitiatives = new Set<string>();
        for (const initiative of allInitiatives) {
          for (const projectId of initiative.projectIds || []) {
            projectIdsFromInitiatives.add(projectId);
          }
        }

        // Get existing project IDs from database
        const existingProjects = getAllProjects();
        const existingProjectIds = new Set(existingProjects.map((p) => p.project_id));

        // Find projects that are in initiatives but not in database
        const missingProjectIds = Array.from(projectIdsFromInitiatives).filter(
          (id) => !existingProjectIds.has(id)
        );

        console.log(
          `[SYNC] Found ${missingProjectIds.length} project(s) associated with initiatives that aren't in database`
        );

        if (missingProjectIds.length > 0) {
          // Apply project limit for local development
          const projectLimit = getProjectSyncLimit();
          let projectsToSync = missingProjectIds;
          if (projectLimit !== null && projectsToSync.length > projectLimit) {
            projectsToSync = projectsToSync.slice(0, projectLimit);
            console.log(
              `[SYNC] Limiting initiative projects to ${projectLimit} (found ${missingProjectIds.length} total). Set LIMIT_SYNC=false to sync all.`
            );
          }

          // Fetch issues for these projects
          const limit = pLimit(PROJECT_SYNC_CONCURRENCY);
          let initiativeProjectIssues: LinearIssueData[] = [];

          const processInitiativeProject = async (projectId: string) => {
            const projectIssues = await linearClient.fetchIssuesByProjects(
              [projectId],
              () => {},
              projectDescriptionsMap,
              projectUpdatesMap
            );
            return projectIssues;
          };

          const allInitiativeProjectIssues = await Promise.all(
            projectsToSync.map((projectId) =>
              limit(() => processInitiativeProject(projectId))
            )
          );

          // Flatten and write issues
          for (const issues of allInitiativeProjectIssues) {
            initiativeProjectIssues.push(...issues);
          }

          if (initiativeProjectIssues.length > 0) {
            console.log(
              `[SYNC] Writing ${initiativeProjectIssues.length} issues from ${projectsToSync.length} initiative project(s)...`
            );
            const counts = writeIssuesToDatabase(initiativeProjectIssues);
            cumulativeNewCount += counts.newCount;
            cumulativeUpdatedCount += counts.updatedCount;
            console.log(
              `[SYNC] Wrote initiative project issues - New: ${counts.newCount}, Updated: ${counts.updatedCount}`
            );
          }

          // Compute and store project metrics for these projects
          const initiativeProjectLabelsMap = new Map<string, string[]>();
          for (const issue of initiativeProjectIssues) {
            if (
              issue.projectId &&
              issue.projectLabels &&
              issue.projectLabels.length > 0
            ) {
              if (!initiativeProjectLabelsMap.has(issue.projectId)) {
                initiativeProjectLabelsMap.set(issue.projectId, issue.projectLabels);
              }
            }
          }

          await computeAndStoreProjects(
            initiativeProjectLabelsMap,
            projectDescriptionsMap,
            projectUpdatesMap,
            new Set(projectsToSync),
            true // Skip deletion during incremental sync
          );
          console.log(
            `[SYNC] Computed metrics for ${projectsToSync.length} initiative project(s)`
          );
        }
      } catch (error) {
        if (error instanceof RateLimitError) {
          const errorMsg = "Rate limit exceeded during initiative projects sync";
          console.error(`[SYNC] ${errorMsg}`);
          setSyncStatus("error");
          updateSyncMetadata({
            sync_error: errorMsg,
            sync_progress_percent: null,
            api_query_count: apiQueryCount,
          });
          const total = getTotalIssueCount();
          return {
            success: false,
            newCount: cumulativeNewCount,
            updatedCount: cumulativeUpdatedCount,
            totalCount: total,
            issueCount: startedIssues.filter((i) => i.stateType === "started").length,
            projectCount: 0,
            projectIssueCount: 0,
            error: errorMsg,
          };
        }
        // For non-rate-limit errors, log but continue
        console.error(
          `[SYNC] Error syncing initiative projects (continuing anyway):`,
          error instanceof Error ? error.message : error
        );
      }
    } else {
      console.log("[SYNC] Skipping initiative projects phase (not selected)");
    }

    // Phase 7: Sync initiatives
    if (shouldRunPhase("initiatives")) {
      updatePhase("initiatives");
      let initiativesSynced = false;
      const shouldSyncInitiatives =
        !isResuming ||
        !existingPartialSync ||
        existingPartialSync.initiativesSync !== "complete";

      if (shouldSyncInitiatives) {
      try {
        console.log("[SYNC] Fetching initiatives...");
        callbacks?.onProgressPercent?.(97);
        setSyncProgress(97);
        const allInitiatives = await linearClient.fetchInitiatives((count) => {
          // Progress callback for initiatives
        });
        console.log(
          `[SYNC] Fetched ${allInitiatives.length} initiative(s) from Linear`
        );

        // Apply initiative limit for local development (same as projects)
        const initiativeLimit = getProjectSyncLimit();
        let initiatives = allInitiatives;
        const originalInitiativeCount = allInitiatives.length;
        if (
          initiativeLimit !== null &&
          allInitiatives.length > initiativeLimit
        ) {
          initiatives = allInitiatives.slice(0, initiativeLimit);
          console.log(
            `[SYNC] Limiting initiatives to ${initiativeLimit} (found ${originalInitiativeCount} total). Set LIMIT_SYNC=false to sync all initiatives.`
          );
        } else if (initiativeLimit === null) {
          console.log(
            `[SYNC] Syncing all ${allInitiatives.length} initiatives (full sync enabled by default)`
          );
        }

        // Write initiatives to database
        if (initiatives.length > 0) {
          console.log(
            `[SYNC] Writing ${initiatives.length} initiative(s) to database...`
          );
          const existingInitiativeIds = new Set(
            getAllInitiatives().map((i) => i.id)
          );
          const activeInitiativeIds = new Set<string>();

          for (const initiativeData of initiatives) {
            activeInitiativeIds.add(initiativeData.id);
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
              owner_id: initiativeData.ownerId,
              owner_name: initiativeData.ownerName,
              creator_id: initiativeData.creatorId,
              creator_name: initiativeData.creatorName,
              project_ids: initiativeData.projectIds.length > 0
                ? JSON.stringify(initiativeData.projectIds)
                : null,
              created_at: initiativeData.createdAt,
              updated_at: initiativeData.updatedAt,
            };
            upsertInitiative(initiative);
          }

          // Delete initiatives that no longer exist
          const initiativesToDelete = Array.from(existingInitiativeIds).filter(
            (id) => !activeInitiativeIds.has(id)
          );
          if (initiativesToDelete.length > 0) {
            deleteInitiativesByIds(initiativesToDelete);
            console.log(
              `[SYNC] Deleted ${initiativesToDelete.length} inactive initiative(s)`
            );
          }
        }

        // Save partial sync state for initiatives
        const partialState: PartialSyncState = {
          currentPhase: "initiatives",
          initialIssuesSync:
            existingPartialSync?.initialIssuesSync || "complete",
          projectSyncs: existingPartialSync?.projectSyncs || [],
          plannedProjectsSync:
            existingPartialSync?.plannedProjectsSync || "complete",
          plannedProjectSyncs: existingPartialSync?.plannedProjectSyncs || [],
          completedProjectsSync:
            existingPartialSync?.completedProjectsSync || "complete",
          completedProjectSyncs:
            existingPartialSync?.completedProjectSyncs || [],
          initiativesSync: "complete",
        };
        savePartialSyncState(partialState);
        initiativesSynced = true;
        console.log(`[SYNC] Synced ${initiatives.length} initiative(s)`);
      } catch (error) {
        if (error instanceof RateLimitError) {
          const partialState: PartialSyncState = {
            currentPhase: "initiatives",
            initialIssuesSync:
              existingPartialSync?.initialIssuesSync || "complete",
            projectSyncs: existingPartialSync?.projectSyncs || [],
            plannedProjectsSync:
              existingPartialSync?.plannedProjectsSync || "complete",
            plannedProjectSyncs: existingPartialSync?.plannedProjectSyncs || [],
            completedProjectsSync:
              existingPartialSync?.completedProjectsSync || "complete",
            completedProjectSyncs:
              existingPartialSync?.completedProjectSyncs || [],
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
          const total = getTotalIssueCount();
          return {
            success: false,
            newCount: cumulativeNewCount,
            updatedCount: cumulativeUpdatedCount,
            totalCount: total,
            issueCount: startedCount,
            projectCount: computedProjectCount,
            projectIssueCount: 0,
            error: errorMsg,
          };
        }
        // For non-rate-limit errors, log but continue
        console.error(
          `[SYNC] Error fetching initiatives (continuing anyway):`,
          error instanceof Error ? error.message : error
        );
      }
      }
    } else {
      console.log("[SYNC] Skipping initiatives phase (not selected)");
    }

    // Final phase complete - set to 100%
    updatePhase("complete");
    callbacks?.onProgressPercent?.(100);
    setSyncProgress(100);

    console.log(
      `[SYNC] Summary - New: ${cumulativeNewCount}, Updated: ${cumulativeUpdatedCount}, Started: ${startedCount}, Projects: ${projectCount}, Computed Projects: ${computedProjectCount}, Engineers: ${computedEngineerCount}`
    );

    // Update sync metadata on success
    const syncTime = new Date().toISOString();
    updatePhase("complete");

    // Clear partial sync state on successful completion BEFORE setting status to idle
    // This ensures the state is cleared even if something goes wrong after
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
      projectIssueCount: 0, // Not tracked incrementally
    };
  } catch (error) {
    // Always ensure we update sync state, even on unexpected errors
    const errorMessage =
      error instanceof Error ? error.message : "An unknown error occurred";
    console.error(`[SYNC] Sync error: ${errorMessage}`, error);

    // Check if it's a rate limit error
    const isRateLimit =
      error instanceof RateLimitError ||
      errorMessage.includes("Rate limit") ||
      errorMessage.includes("rate limit") ||
      errorMessage.includes("RATELIMITED");

    if (isRateLimit) {
      // Save partial sync state for rate limit errors
      const existingPartialSync = getPartialSyncState();
      if (!existingPartialSync) {
        // Try to determine what phase we were in
        // If we got here, we likely completed initial issues sync but failed on projects
        const partialState: PartialSyncState = {
          currentPhase: currentPhase,
          initialIssuesSync: "complete", // Assume complete since we got past initial sync
          projectSyncs: [],
        };
        savePartialSyncState(partialState);
        console.log(
          `[SYNC] Saved partial sync state (fallback): ${JSON.stringify(
            partialState
          )}`
        );
      } else {
        // Update existing partial sync state with current phase
        existingPartialSync.currentPhase = currentPhase;
        savePartialSyncState(existingPartialSync);
        console.log(
          `[SYNC] Partial sync state already exists, updated phase: ${JSON.stringify(
            existingPartialSync
          )}`
        );
      }
      const errorMsg = "Rate limit exceeded during sync";
      console.log(
        `[SYNC] Detected rate limit error, saving state and exiting gracefully`
      );
      setSyncStatus("error");
      updateSyncMetadata({
        sync_error: errorMsg,
        sync_progress_percent: null,
        api_query_count: apiQueryCount,
      });
      // Return actual counts of what was written (data is written incrementally)
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
        projectIssueCount: projectIssues.length,
        error: errorMsg,
      };
    }

    // Check if it's a schema mismatch error
    const isSchemaError =
      (errorMessage.includes("values for") &&
        errorMessage.includes("columns")) ||
      errorMessage.includes("no such column") ||
      errorMessage.includes("table_info");

    const finalError = isSchemaError
      ? `${errorMessage}\n\n💡 Tip: This looks like a schema mismatch. Try resetting the database:\n   bun run reset-db`
      : errorMessage;

    // Update sync metadata on error
    // For non-rate-limit errors, clear partial sync state
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

/**
 * Sync a single project by project ID
 * @param projectId - The Linear project ID to sync
 * @param callbacks - Optional callbacks for progress updates
 */
export async function syncProject(
  projectId: string,
  callbacks?: SyncCallbacks
): Promise<SyncResult> {
  let cumulativeNewCount = 0;
  let cumulativeUpdatedCount = 0;

  try {
    // Update sync status to 'syncing'
    setSyncStatus("syncing");
    updateSyncMetadata({ sync_error: null, sync_progress_percent: 0 });

    // Check for mock mode
    if (isMockMode()) {
      console.log("[SYNC] Mock mode: skipping project sync");
      const mockData = generateMockData();
      const projectMockIssues = mockData.issues.filter(
        (i: LinearIssueData) => i.projectId === projectId
      );
      const counts = writeIssuesToDatabase(projectMockIssues);
      cumulativeNewCount += counts.newCount;
      cumulativeUpdatedCount += counts.updatedCount;

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
      return {
        success: true,
        newCount: counts.newCount,
        updatedCount: counts.updatedCount,
        totalCount: total,
        issueCount: projectMockIssues.length,
        projectCount: 1,
        projectIssueCount: projectMockIssues.length,
      };
    }

    // Connect to Linear
    const linearClient = createLinearClient();
    callbacks?.onProgressPercent?.(10);
    setSyncProgress(10);

    console.log(`[SYNC] Testing Linear API connection...`);
    const connected = await linearClient.testConnection();

    if (!connected) {
      const errorMsg = "Failed to connect to Linear. Check your API key.";
      console.error("[SYNC] Failed to connect to Linear API");
      setSyncStatus("error");
      updateSyncMetadata({ sync_error: errorMsg, sync_progress_percent: null });
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

    // Fetch project issues
    callbacks?.onProgressPercent?.(30);
    setSyncProgress(30);

    console.log(`[SYNC] Fetching issues for project: ${projectId}`);
    let projectIssues: LinearIssueData[] = [];
    let projectName: string | null = null;

    try {
      projectIssues = await linearClient.fetchIssuesByProjects(
        [projectId],
        (count, pageSize, projectIndex, totalProjects) => {
          callbacks?.onProjectIssueCountUpdate?.(count);
          if (projectIndex !== undefined && totalProjects !== undefined) {
            const percent = Math.min(30 + Math.round((count / 100) * 50), 80);
            callbacks?.onProgressPercent?.(percent);
            setSyncProgress(percent);
          }
        }
      );

      // Get project name from first issue
      if (projectIssues.length > 0 && projectIssues[0].projectName) {
        projectName = projectIssues[0].projectName;
        callbacks?.onProjectProgress?.(1, 1, projectName);
      }

      // Write project issues to database
      if (projectIssues.length > 0) {
        console.log(
          `[SYNC] Writing ${projectIssues.length} project issues to database...`
        );
        const counts = writeIssuesToDatabase(projectIssues);
        cumulativeNewCount += counts.newCount;
        cumulativeUpdatedCount += counts.updatedCount;
        console.log(
          `[SYNC] Wrote project issues - New: ${counts.newCount}, Updated: ${counts.updatedCount}`
        );
      }

      callbacks?.onProgressPercent?.(80);
      setSyncProgress(80);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error(`[SYNC] Error fetching project issues:`, errorMessage);

      if (error instanceof RateLimitError) {
        const errorMsg = "Rate limit exceeded during project sync";
        console.error(`[SYNC] ${errorMsg}`);
        setSyncStatus("error");
        updateSyncMetadata({
          sync_error: errorMsg,
          sync_progress_percent: null,
        });
        const total = getTotalIssueCount();
        return {
          success: false,
          newCount: cumulativeNewCount,
          updatedCount: cumulativeUpdatedCount,
          totalCount: total,
          issueCount: 0,
          projectCount: 0,
          projectIssueCount: projectIssues.length,
          error: errorMsg,
        };
      }
      throw error;
    }

    // Collect project labels from fetched issues
    const projectLabelsMap = new Map<string, string[]>();
    for (const issue of projectIssues) {
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

    // Fetch project updates for this project
    const projectUpdatesMap = new Map<string, ProjectUpdate[]>();
    try {
      const updates = await linearClient.fetchProjectUpdates(projectId);
      projectUpdatesMap.set(projectId, updates);
      if (updates.length > 0) {
        console.log(
          `[SYNC] Fetched ${updates.length} project update(s) for project: ${projectName || projectId}`
        );
      }
    } catch (error) {
      // Log but don't fail - project updates are optional
      // Set empty array on error to match full sync behavior
      console.error(
        `[SYNC] Failed to fetch project updates for ${projectId}:`,
        error instanceof Error ? error.message : error
      );
      projectUpdatesMap.set(projectId, []);
    }

    // Compute and store project metrics for this project
    console.log(`[SYNC] Computing project metrics...`);
    callbacks?.onProgressPercent?.(90);
    setSyncProgress(90);

    const computedProjectCount = await computeAndStoreProjects(
      projectLabelsMap,
      undefined,
      projectUpdatesMap,
      new Set([projectId]) // Only this project was synced
    );
    console.log(
      `[SYNC] Computed metrics for ${computedProjectCount} project(s)`
    );

    // Compute and store engineer WIP metrics
    console.log(`[SYNC] Computing engineer WIP metrics...`);
    const computedEngineerCount = computeAndStoreEngineers();
    console.log(
      `[SYNC] Computed metrics for ${computedEngineerCount} engineer(s)`
    );

    callbacks?.onProgressPercent?.(100);
    setSyncProgress(100);

    // Update sync metadata on success
    const syncTime = new Date().toISOString();
    setSyncStatus("idle");
    updateSyncMetadata({
      last_sync_time: syncTime,
      sync_error: null,
      sync_progress_percent: null,
    });

    const total = getTotalIssueCount();
    console.log(
      `[SYNC] Project sync complete - New: ${cumulativeNewCount}, Updated: ${cumulativeUpdatedCount}, Total: ${total}, Project Issues: ${projectIssues.length}`
    );

    return {
      success: true,
      newCount: cumulativeNewCount,
      updatedCount: cumulativeUpdatedCount,
      totalCount: total,
      issueCount: projectIssues.length,
      projectCount: computedProjectCount,
      projectIssueCount: projectIssues.length,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`[SYNC] Project sync error:`, errorMessage);

    // Check if it's a schema mismatch error
    const isSchemaError =
      (errorMessage.includes("values for") &&
        errorMessage.includes("columns")) ||
      errorMessage.includes("no such column") ||
      errorMessage.includes("table_info");

    const finalError = isSchemaError
      ? `${errorMessage}\n\n💡 Tip: This looks like a schema mismatch. Try resetting the database:\n   bun run reset-db`
      : errorMessage;

    // Update sync metadata on error
    setSyncStatus("error");
    updateSyncMetadata({
      sync_error: finalError,
      sync_progress_percent: null,
    });

    return {
      success: false,
      newCount: cumulativeNewCount,
      updatedCount: cumulativeUpdatedCount,
      totalCount: 0,
      issueCount: 0,
      projectCount: 0,
      projectIssueCount: 0,
      error: finalError,
    };
  }
}

/**
 * Compute project metrics from issues and store in projects table
 * @param skipDeletion - If true, skip deletion of inactive projects (used during incremental sync)
 */
async function computeAndStoreProjects(
  projectLabelsMap?: Map<string, string[]>,
  projectDescriptionsMap?: Map<string, string | null>,
  projectUpdatesMap?: Map<string, ProjectUpdate[]>,
  syncedProjectIds?: Set<string>,
  skipDeletion: boolean = false
): Promise<number> {
  const syncTimestamp = syncedProjectIds ? new Date().toISOString() : null;
  const allIssues = getAllIssues();

  // Group issues by project
  const projectGroups = new Map<string, Issue[]>();
  for (const issue of allIssues) {
    if (!issue.project_id) continue;
    if (!projectGroups.has(issue.project_id)) {
      projectGroups.set(issue.project_id, []);
    }
    projectGroups.get(issue.project_id)!.push(issue);
  }

  const activeProjectIds = new Set<string>();

  // Compute metrics for each project
  for (const [projectId, projectIssues] of projectGroups) {
    // Include all projects: active, planned, and completed
    // Previously we only included active projects, but now we want all projects
    // for planning views and historical views
    activeProjectIds.add(projectId);

    const firstIssue = projectIssues[0];
    const issuesByState = new Map<string, number>();
    const engineers = new Set<string>();
    const teams = new Set<string>();

    let lastActivityDate = firstIssue.updated_at;
    let earliestCreatedAt = firstIssue.created_at;
    let earliestStartedAt: string | null = firstIssue.started_at; // Track when work actually began
    let linearTargetDate: string | null = firstIssue.project_target_date; // Linear's target date
    let linearStartDate: string | null = firstIssue.project_start_date; // Linear's start date
    let linearCompletedAt: string | null = null; // Linear's completedAt date
    let completedCount = 0;
    let inProgressCount = 0;

    for (const issue of projectIssues) {
      // Track issue states
      const stateName = issue.state_name;
      issuesByState.set(stateName, (issuesByState.get(stateName) || 0) + 1);

      // Count completed and in-progress
      if (
        stateName.toLowerCase().includes("done") ||
        stateName.toLowerCase().includes("completed")
      ) {
        completedCount++;
      }
      if (
        stateName.toLowerCase() === "in progress" ||
        issue.state_type === "started"
      ) {
        inProgressCount++;
      }

      // Track engineers
      if (issue.assignee_name) {
        engineers.add(issue.assignee_name);
      }

      // Track teams
      teams.add(issue.team_key);

      // Track latest activity
      if (new Date(issue.updated_at) > new Date(lastActivityDate)) {
        lastActivityDate = issue.updated_at;
      }

      // Track earliest creation
      if (new Date(issue.created_at) < new Date(earliestCreatedAt)) {
        earliestCreatedAt = issue.created_at;
      }

      // Track earliest started_at (when work actually began)
      if (issue.started_at) {
        if (
          !earliestStartedAt ||
          new Date(issue.started_at) < new Date(earliestStartedAt)
        ) {
          earliestStartedAt = issue.started_at;
        }
      }

      // Capture Linear's project target date (should be same for all issues in project)
      if (issue.project_target_date && !linearTargetDate) {
        linearTargetDate = issue.project_target_date;
      }
      if (issue.project_start_date && !linearStartDate) {
        linearStartDate = issue.project_start_date;
      }
      // Capture Linear's project completedAt date (should be same for all issues in project)
      if (issue.project_completed_at && !linearCompletedAt) {
        linearCompletedAt = issue.project_completed_at;
      }
    }

    // Calculate violation counts
    let missingEstimateCount = 0;
    let missingPriorityCount = 0;
    let noRecentCommentCount = 0;
    let wipAgeViolationCount = 0;
    let missingDescriptionCount = 0;

    for (const issue of projectIssues) {
      if (hasMissingEstimate(issue)) missingEstimateCount++;
      if (hasMissingPriority(issue)) missingPriorityCount++;
      if (hasNoRecentComment(issue)) noRecentCommentCount++;
      if (hasWIPAgeViolation(issue)) wipAgeViolationCount++;
      if (hasMissingDescription(issue)) missingDescriptionCount++;
    }

    // Count started issues (state_type === "started")
    const startedIssuesCount = projectIssues.filter(
      (i) => i.state_type === "started"
    ).length;

    // Check if project is in planning phase
    const projectStateCategory =
      firstIssue.project_state_category?.toLowerCase() || "";
    const isPlanningPhase = projectStateCategory.includes("planned");

    // Calculate flags
    const hasStatusMismatchFlag = hasStatusMismatch(
      firstIssue.project_state_category,
      projectIssues
    );
    const isStaleUpdateFlag = isStaleUpdate(lastActivityDate);
    const missingLeadFlag = isMissingLead(
      firstIssue.project_state_category,
      firstIssue.project_lead_name,
      projectIssues
    );
    const hasViolationsFlag = hasViolations(projectIssues);
    // Don't require health if project is in planning phase AND has zero started issues
    const missingHealthFlag =
      !firstIssue.project_health &&
      !(isPlanningPhase && startedIssuesCount === 0);
    
    // Check for missing RICE scoped labels (will be set below after we get existing project)
    let missingRICEScopedLabelsFlag = false;

    // Calculate metrics using helper functions
    const totalPoints = calculateTotalPoints(projectIssues);
    const averageCycleTime = calculateAverageCycleTime(projectIssues);
    const averageLeadTime = calculateAverageLeadTime(projectIssues);
    const linearProgress = calculateLinearProgress(projectIssues);
    const velocity = calculateVelocity(projectIssues, earliestCreatedAt);
    const velocityByTeam = calculateVelocityByTeam(
      projectIssues,
      earliestCreatedAt
    );
    const estimateAccuracy = calculateEstimateAccuracy(projectIssues);

    // Calculate days per story point for accuracy
    const completedIssues = projectIssues
      .filter((issue) => {
        const stateName = issue.state_name?.toLowerCase() || "";
        return stateName.includes("done") || stateName.includes("completed");
      })
      .filter(
        (issue) => issue.estimate !== null && issue.estimate !== undefined
      );

    let daysPerStoryPoint: number | null = null;
    if (completedIssues.length > 0) {
      let totalStoryPoints = 0;
      let totalDays = 0;
      let issuesWithData = 0;

      for (const issue of completedIssues) {
        if (!issue.estimate) continue;
        const startTime = issue.started_at
          ? new Date(issue.started_at).getTime()
          : new Date(issue.created_at).getTime();
        const completedTime = issue.completed_at
          ? new Date(issue.completed_at).getTime()
          : new Date(issue.updated_at).getTime();
        const actualDays = (completedTime - startTime) / (1000 * 60 * 60 * 24);

        if (actualDays > 0) {
          totalStoryPoints += issue.estimate;
          totalDays += actualDays;
          issuesWithData++;
        }
      }

      if (issuesWithData > 0 && totalStoryPoints > 0) {
        daysPerStoryPoint = totalDays / totalStoryPoints;
      }
    }

    // Store Linear's target date (if available) - this is the project's explicit due date
    const targetDate = linearTargetDate
      ? new Date(linearTargetDate).toISOString()
      : null;

    // Always calculate velocity-based estimated completion date
    let estimatedEndDate: string | null = null;
    if (earliestCreatedAt) {
      const remainingIssues = projectIssues.length - completedCount;
      const daysElapsed = Math.max(
        1,
        (Date.now() - new Date(earliestCreatedAt).getTime()) /
          (1000 * 60 * 60 * 24)
      );
      const velocityPerDay = completedCount / daysElapsed;

      if (velocityPerDay > 0) {
        const daysToComplete = remainingIssues / velocityPerDay;
        const estimated = new Date();
        estimated.setDate(estimated.getDate() + daysToComplete);
        // Round up to end of month
        estimated.setMonth(estimated.getMonth() + 1, 0);
        estimated.setHours(23, 59, 59, 999);
        estimatedEndDate = estimated.toISOString();
      } else {
        // No velocity data, assume 6 months from now
        const estimated = new Date();
        estimated.setMonth(estimated.getMonth() + 6);
        estimated.setMonth(estimated.getMonth() + 1, 0);
        estimated.setHours(23, 59, 59, 999);
        estimatedEndDate = estimated.toISOString();
      }
    }

    // Calculate date discrepancy flag (target vs predicted differ by >30 days)
    let hasDateDiscrepancyFlag = false;
    if (targetDate && estimatedEndDate) {
      const targetMs = new Date(targetDate).getTime();
      const predictedMs = new Date(estimatedEndDate).getTime();
      const diffDays = Math.abs(targetMs - predictedMs) / (1000 * 60 * 60 * 24);
      hasDateDiscrepancyFlag = diffDays > 30;
    }

    // Convert Maps/Sets to JSON
    const issuesByStateJson = JSON.stringify(Object.fromEntries(issuesByState));
    const engineersJson = JSON.stringify(Array.from(engineers));
    const teamsJson = JSON.stringify(Array.from(teams));
    const velocityByTeamJson = JSON.stringify(
      Object.fromEntries(velocityByTeam)
    );

    // Get project labels from map or default to empty array
    const projectLabels = projectLabelsMap?.get(projectId) || [];
    const labelsJson =
      projectLabels.length > 0 ? JSON.stringify(projectLabels) : null;

    // Get project description from map
    const projectDescription = projectDescriptionsMap?.get(projectId) || null;

    // Check for missing RICE scoped labels
    // Get existing project to check its labels (labelsJson above only has names, not full objects)
    const existingProject = getProjectById(projectId);
    if (existingProject) {
      missingRICEScopedLabelsFlag = hasMissingProjectScopedLabels(existingProject);
    }

    // Get project updates from map, sort by createdAt descending (newest first), and serialize to JSON
    // Only update project_updates if this project was synced in this run
    // Otherwise, preserve existing updates from the database
    let projectUpdatesJson: string | null = null;
    if (syncedProjectIds?.has(projectId)) {
      // Project was synced - use updates from map (or null if empty/not found)
      const projectUpdates = projectUpdatesMap?.get(projectId) || [];
      const sortedUpdates = projectUpdates.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      projectUpdatesJson =
        sortedUpdates.length > 0 ? JSON.stringify(sortedUpdates) : null;
    } else {
      // Project was not synced - preserve existing updates from database
      const existingProject = getProjectById(projectId);
      projectUpdatesJson = existingProject?.project_updates || null;
    }

    const project: Project = {
      project_id: projectId,
      project_name: firstIssue.project_name || "Unknown Project",
      project_state_category: firstIssue.project_state_category,
      project_status: firstIssue.project_status,
      project_health: firstIssue.project_health,
      project_updated_at: firstIssue.project_updated_at,
      project_lead_id: firstIssue.project_lead_id,
      project_lead_name: firstIssue.project_lead_name,
      project_description: projectDescription,
      total_issues: projectIssues.length,
      completed_issues: completedCount,
      in_progress_issues: inProgressCount,
      engineer_count: engineers.size,
      missing_estimate_count: missingEstimateCount,
      missing_priority_count: missingPriorityCount,
      no_recent_comment_count: noRecentCommentCount,
      wip_age_violation_count: wipAgeViolationCount,
      missing_description_count: missingDescriptionCount,
      total_points: totalPoints.total,
      missing_points: totalPoints.missing,
      average_cycle_time: averageCycleTime,
      average_lead_time: averageLeadTime,
      linear_progress: linearProgress,
      velocity: velocity,
      estimate_accuracy: estimateAccuracy,
      days_per_story_point: daysPerStoryPoint,
      has_status_mismatch: hasStatusMismatchFlag ? 1 : 0,
      is_stale_update: isStaleUpdateFlag ? 1 : 0,
      missing_lead: missingLeadFlag ? 1 : 0,
      has_violations: hasViolationsFlag || missingRICEScopedLabelsFlag ? 1 : 0,
      missing_health: missingHealthFlag ? 1 : 0,
      has_date_discrepancy: hasDateDiscrepancyFlag ? 1 : 0,
      start_date: linearStartDate || earliestStartedAt || earliestCreatedAt, // Prefer Linear's start date, then started_at, fallback to created_at
      last_activity_date: lastActivityDate,
      estimated_end_date: estimatedEndDate,
      target_date: targetDate, // Linear's explicit target date for the project
      completed_at: linearCompletedAt ? new Date(linearCompletedAt).toISOString() : null, // Linear's completedAt date for the project
      issues_by_state: issuesByStateJson,
      engineers: engineersJson,
      teams: teamsJson,
      velocity_by_team: velocityByTeamJson,
      labels: labelsJson,
      project_updates: projectUpdatesJson,
      last_synced_at: syncedProjectIds?.has(projectId) ? syncTimestamp : null,
    };

    upsertProject(project);
  }

  // Delete projects that no longer exist (skip during incremental sync)
  if (!skipDeletion) {
    const allProjects = getAllProjects();
    const projectsToDelete = allProjects
      .filter((p) => !activeProjectIds.has(p.project_id))
      .map((p) => p.project_id);

    if (projectsToDelete.length > 0) {
      deleteProjectsByProjectIds(projectsToDelete);
      console.log(
        `[SYNC] Deleted ${projectsToDelete.length} inactive project(s)`
      );
    }
  }

  return activeProjectIds.size;
}

/**
 * Issue summary for storing in engineer's active_issues JSON
 */
interface IssueSummary {
  id: string;
  identifier: string;
  title: string;
  estimate: number | null;
  priority: number;
  last_comment_at: string | null;
  comment_count: number | null;
  started_at: string | null;
  url: string;
  team_name: string;
  project_name: string | null;
  state_name?: string;
  state_type?: string;
}

/**
 * Compute engineer WIP metrics from started issues and store in engineers table
 */
function computeAndStoreEngineers(): number {
  const startedIssues = getStartedIssues();

  // Group by assignee_id (skip unassigned)
  const engineerGroups = new Map<
    string,
    { name: string; avatarUrl: string | null; issues: Issue[] }
  >();

  for (const issue of startedIssues) {
    if (!issue.assignee_id || !issue.assignee_name) continue;

    if (!engineerGroups.has(issue.assignee_id)) {
      engineerGroups.set(issue.assignee_id, {
        name: issue.assignee_name,
        avatarUrl: issue.assignee_avatar_url,
        issues: [],
      });
    }
    engineerGroups.get(issue.assignee_id)!.issues.push(issue);
  }

  const activeEngineerIds = new Set<string>();

  // Compute metrics for each engineer
  for (const [assigneeId, { name, avatarUrl, issues }] of engineerGroups) {
    activeEngineerIds.add(assigneeId);

    // Collect unique teams
    const teamIds = new Set<string>();
    const teamNames = new Set<string>();
    for (const issue of issues) {
      teamIds.add(issue.team_id);
      teamNames.add(issue.team_name);
    }

    // Calculate WIP metrics
    const wipIssueCount = issues.length;
    let wipTotalPoints = 0;
    for (const issue of issues) {
      if (issue.estimate !== null) {
        wipTotalPoints += issue.estimate;
      }
    }

    // Check WIP limit violation
    const wipLimitViolation = wipIssueCount >= WIP_THRESHOLDS.WARNING ? 1 : 0;

    // Calculate oldest WIP age (days since started)
    let oldestWipAgeDays: number | null = null;
    const now = Date.now();
    for (const issue of issues) {
      if (issue.started_at) {
        const startedAt = new Date(issue.started_at).getTime();
        const ageDays = (now - startedAt) / (1000 * 60 * 60 * 24);
        if (oldestWipAgeDays === null || ageDays > oldestWipAgeDays) {
          oldestWipAgeDays = ageDays;
        }
      }
    }

    // Find last activity
    let lastActivityAt: string | null = null;
    for (const issue of issues) {
      if (
        !lastActivityAt ||
        new Date(issue.updated_at) > new Date(lastActivityAt)
      ) {
        lastActivityAt = issue.updated_at;
      }
    }

    // Calculate violation counts
    let missingEstimateCount = 0;
    let missingPriorityCount = 0;
    let noRecentCommentCount = 0;
    let wipAgeViolationCount = 0;

    for (const issue of issues) {
      if (hasMissingEstimate(issue)) missingEstimateCount++;
      if (hasMissingPriority(issue)) missingPriorityCount++;
      if (hasNoRecentComment(issue)) noRecentCommentCount++;
      if (hasWIPAgeViolation(issue)) wipAgeViolationCount++;
    }

    // Build active issues summary
    const activeIssues: IssueSummary[] = issues.map((issue) => ({
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      estimate: issue.estimate,
      priority: issue.priority,
      last_comment_at: issue.last_comment_at,
      comment_count: issue.comment_count,
      started_at: issue.started_at,
      url: issue.url,
      team_name: issue.team_name,
      project_name: issue.project_name,
      state_name: issue.state_name,
      state_type: issue.state_type,
    }));

    const engineer: Engineer = {
      assignee_id: assigneeId,
      assignee_name: name,
      avatar_url: avatarUrl,
      team_ids: JSON.stringify(Array.from(teamIds)),
      team_names: JSON.stringify(Array.from(teamNames)),
      wip_issue_count: wipIssueCount,
      wip_total_points: wipTotalPoints,
      wip_limit_violation: wipLimitViolation,
      oldest_wip_age_days: oldestWipAgeDays,
      last_activity_at: lastActivityAt,
      missing_estimate_count: missingEstimateCount,
      missing_priority_count: missingPriorityCount,
      no_recent_comment_count: noRecentCommentCount,
      wip_age_violation_count: wipAgeViolationCount,
      active_issues: JSON.stringify(activeIssues),
    };

    upsertEngineer(engineer);
  }

  // Delete engineers that no longer have WIP
  const existingEngineerIds = getExistingEngineerIds();
  const engineersToDelete = Array.from(existingEngineerIds).filter(
    (id) => !activeEngineerIds.has(id)
  );

  if (engineersToDelete.length > 0) {
    deleteEngineersByIds(engineersToDelete);
    console.log(
      `[SYNC] Deleted ${engineersToDelete.length} engineer(s) with no WIP`
    );
  }

  return activeEngineerIds.size;
}

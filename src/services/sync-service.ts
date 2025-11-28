import {
  createLinearClient,
  type ProjectUpdate,
  RateLimitError,
  type LinearIssueData,
} from "../linear/client.js";
import { isMockMode, generateMockData } from "./mock-data.js";
import {
  getExistingIssueIds,
  upsertIssue,
  deleteIssuesByTeams,
  getTotalIssueCount,
  getAllIssues,
  getAllProjects,
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
  type PartialSyncState,
} from "../db/queries.js";
import type { Issue, Project, Engineer } from "../db/schema.js";
import { WIP_THRESHOLDS } from "../constants/thresholds.js";
import { isProjectActive } from "../utils/status-helpers.js";
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
    createdAt: new Date(dbIssue.created_at),
    updatedAt: new Date(dbIssue.updated_at),
    startedAt: dbIssue.started_at ? new Date(dbIssue.started_at) : null,
    completedAt: dbIssue.completed_at ? new Date(dbIssue.completed_at) : null,
    canceledAt: dbIssue.canceled_at ? new Date(dbIssue.canceled_at) : null,
    url: dbIssue.url,
    projectId: dbIssue.project_id,
    projectName: dbIssue.project_name,
    projectState: dbIssue.project_state,
    projectHealth: dbIssue.project_health,
    projectUpdatedAt: dbIssue.project_updated_at
      ? new Date(dbIssue.project_updated_at)
      : null,
    projectLeadId: dbIssue.project_lead_id,
    projectLeadName: dbIssue.project_lead_name,
    projectLabels: [], // Database doesn't store project labels, but that's okay for determining project IDs
    projectTargetDate: dbIssue.project_target_date,
    projectStartDate: dbIssue.project_start_date,
    parentId: dbIssue.parent_id,
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
    createdAt: Date;
    updatedAt: Date;
    startedAt: Date | null;
    completedAt: Date | null;
    canceledAt: Date | null;
    url: string;
    projectId: string | null;
    projectName: string | null;
    projectState: string | null;
    projectHealth: string | null;
    projectUpdatedAt: Date | null;
    projectLeadId: string | null;
    projectLeadName: string | null;
    projectTargetDate: string | null;
    projectStartDate: string | null;
    parentId: string | null;
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
      created_at: issue.createdAt.toISOString(),
      updated_at: issue.updatedAt.toISOString(),
      started_at: issue.startedAt ? issue.startedAt.toISOString() : null,
      completed_at: issue.completedAt ? issue.completedAt.toISOString() : null,
      canceled_at: issue.canceledAt ? issue.canceledAt.toISOString() : null,
      url: issue.url,
      project_id: issue.projectId,
      project_name: issue.projectName,
      project_state: issue.projectState,
      project_health: issue.projectHealth,
      project_updated_at: issue.projectUpdatedAt
        ? issue.projectUpdatedAt.toISOString()
        : null,
      project_lead_id: issue.projectLeadId,
      project_lead_name: issue.projectLeadName,
      project_target_date: issue.projectTargetDate,
      project_start_date: issue.projectStartDate,
      parent_id: issue.parentId,
    });
  }

  return { newCount, updatedCount };
}

/**
 * Performs sync of Linear issues to local database
 * @param includeProjectSync - Whether to also fetch all issues from active projects
 * @param callbacks - Optional callbacks for progress updates
 */
export async function performSync(
  includeProjectSync: boolean = true,
  callbacks?: SyncCallbacks
): Promise<SyncResult> {
  // Declare variables at function scope so they're accessible in catch blocks
  let allIssues: LinearIssueData[] = [];
  let startedIssues: LinearIssueData[] = [];
  let projectIssues: LinearIssueData[] = [];
  let cumulativeNewCount = 0;
  let cumulativeUpdatedCount = 0;

  // Wrap entire function in try-catch to ensure we never crash the app
  try {
    // Check for existing partial sync state
    const existingPartialSync = getPartialSyncState();
    const isResuming = existingPartialSync !== null;

    if (isResuming) {
      console.log("[SYNC] Resuming partial sync from previous attempt");
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
        projectUpdates
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

    // Connect to Linear
    const linearClient = createLinearClient();
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

    // Fetch issues (step 1 of N+1 where N is number of projects)
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

    // Phase 2: Fetch all issues for projects with active work (optional)
    let projectCount = 0;
    const activeProjectIds = new Set<string>();
    const projectDescriptionsMap = new Map<string, string | null>();
    const projectUpdatesMap = new Map<string, ProjectUpdate[]>();

    if (includeProjectSync) {
      const projectIdsFromIssues = new Set(
        startedIssues
          .filter((issue) => issue.projectId)
          .map((issue) => issue.projectId as string)
      );

      // Build a map of project IDs to project names from started issues
      const projectNameMap = new Map<string, string>();
      for (const issue of startedIssues) {
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
      console.log(
        `[SYNC] Found ${projectCount} active project(s) with started issues`
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

        // Total steps = 1 (started issues) + N (projects)
        const totalSteps = 1 + projectCount;

        // Step 1 complete (started issues)
        callbacks?.onProgressPercent?.(Math.round((1 / totalSteps) * 100));

        // Fetch issues and descriptions together - descriptions are fetched inline during issue fetching
        try {
          projectIssues = await linearClient.fetchIssuesByProjects(
            projectsToSync,
            (count, pageSize, projectIndex, totalProjects) => {
              callbacks?.onProjectIssueCountUpdate?.(count);
              // Update progress when starting a new project (pageSize is undefined at start)
              // When projectIndex is 0, we're starting the first project (1 step done: started issues)
              // When projectIndex is 1, we've completed project 0 (2 steps done: started + project 0)
              if (
                projectIndex !== undefined &&
                totalProjects !== undefined &&
                totalSteps > 0 &&
                pageSize === undefined
              ) {
                // Completed steps: 1 (started issues) + projectIndex (completed projects)
                const completedSteps = 1 + projectIndex;
                const percent = Math.min(
                  Math.round((completedSteps / totalSteps) * 100),
                  99
                );
                callbacks?.onProgressPercent?.(percent);
                setSyncProgress(percent);

                // Call project progress callback with current project info
                const currentProjectId = projectsToSync[projectIndex];
                const currentProjectName =
                  projectNameMap.get(currentProjectId) || null;
                callbacks?.onProjectProgress?.(
                  projectIndex + 1,
                  totalProjects,
                  currentProjectName
                );
              }
            },
            projectDescriptionsMap,
            projectUpdatesMap
          );

          // Write project issues to database immediately after successful fetch
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

          // Mark all synced projects as complete
          for (const projectId of projectsToSync) {
            const statusIndex = projectSyncStatuses.findIndex(
              (p) => p.projectId === projectId
            );
            if (statusIndex >= 0) {
              projectSyncStatuses[statusIndex].status = "complete";
            } else {
              projectSyncStatuses.push({ projectId, status: "complete" });
            }
          }

          // Save partial sync state after each project batch (in case of interruption)
          const partialState: PartialSyncState = {
            initialIssuesSync: "complete",
            projectSyncs: projectSyncStatuses,
          };
          savePartialSyncState(partialState);

          // All projects complete - set to 100%
          callbacks?.onProgressPercent?.(100);
          setSyncProgress(100);
          console.log(
            `[SYNC] Fetched ${projectIssues.length} issues from ${projectCount} project(s)`
          );
          console.log(
            `[SYNC] Fetched descriptions for ${projectDescriptionsMap.size} project(s)`
          );
          console.log(
            `[SYNC] Fetched updates for ${projectUpdatesMap.size} project(s)`
          );
        } catch (error) {
          // Even if there's an error, write any project issues we successfully fetched
          // (Note: if fetchIssuesByProjects throws, projectIssues will likely be empty,
          // but we write anyway in case there's partial data)
          if (projectIssues.length > 0) {
            console.log(
              `[SYNC] Writing ${projectIssues.length} partially fetched project issues to database...`
            );
            const counts = writeIssuesToDatabase(projectIssues);
            cumulativeNewCount += counts.newCount;
            cumulativeUpdatedCount += counts.updatedCount;
            console.log(
              `[SYNC] Wrote partial project issues - New: ${counts.newCount}, Updated: ${counts.updatedCount}`
            );
          }

          if (error instanceof RateLimitError) {
            // Save partial sync state before exiting
            const partialState: PartialSyncState = {
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
              projectIssueCount: projectIssues.length,
              error: errorMsg,
            };
          }
          throw error;
        }
      } else {
        // No projects, sync is complete
        callbacks?.onProgressPercent?.(100);
        setSyncProgress(100);
      }
    } else {
      // No project sync, sync is complete after started issues
      callbacks?.onProgressPercent?.(100);
      setSyncProgress(100);
    }

    // Remove ignored teams from database (do this once at the end)
    if (ignoredTeamKeys.length > 0) {
      deleteIssuesByTeams(ignoredTeamKeys);
      console.log(
        `[SYNC] Removed issues from ${ignoredTeamKeys.length} ignored team(s)`
      );
    }

    // Collect project labels from fetched issues for project metrics computation
    // (Issues are already written to database incrementally above)
    const projectLabelsMap = new Map<string, string[]>();
    for (const issue of [...startedIssues, ...projectIssues]) {
      // Collect project labels
      if (
        issue.projectId &&
        issue.projectLabels &&
        issue.projectLabels.length > 0
      ) {
        // Use the labels from any issue (they should be the same for all issues in a project)
        if (!projectLabelsMap.has(issue.projectId)) {
          projectLabelsMap.set(issue.projectId, issue.projectLabels);
        }
      }
    }

    // Get total count from database (issues already written incrementally)
    const total = getTotalIssueCount();
    console.log(`[SYNC] Database now contains ${total} total issue(s)`);

    // Count started issues for reporting
    const startedCount = startedIssues.filter(
      (i) => i.stateType === "started"
    ).length;

    // Compute and store project metrics
    console.log(`[SYNC] Computing project metrics...`);
    const computedProjectCount = await computeAndStoreProjects(
      projectLabelsMap,
      projectDescriptionsMap,
      projectUpdatesMap
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

    console.log(
      `[SYNC] Summary - New: ${cumulativeNewCount}, Updated: ${cumulativeUpdatedCount}, Started: ${startedCount}, Projects: ${projectCount}, Project Issues: ${projectIssues.length}, Computed Projects: ${computedProjectCount}, Engineers: ${computedEngineerCount}`
    );

    // Update sync metadata on success
    const syncTime = new Date().toISOString();
    setSyncStatus("idle");
    updateSyncMetadata({
      last_sync_time: syncTime,
      sync_error: null,
      sync_progress_percent: null,
    });

    // Clear partial sync state on successful completion
    clearPartialSyncState();

    return {
      success: true,
      newCount: cumulativeNewCount,
      updatedCount: cumulativeUpdatedCount,
      totalCount: total,
      issueCount: startedCount,
      projectCount: computedProjectCount,
      projectIssueCount: projectIssues.length,
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
        console.log(
          `[SYNC] Partial sync state already exists: ${JSON.stringify(
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
 * Compute project metrics from issues and store in projects table
 */
async function computeAndStoreProjects(
  projectLabelsMap?: Map<string, string[]>,
  projectDescriptionsMap?: Map<string, string | null>,
  projectUpdatesMap?: Map<string, ProjectUpdate[]>
): Promise<number> {
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
    // Only include active projects
    if (!isProjectActive(projectIssues)) continue;

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

    // Calculate flags
    const hasStatusMismatchFlag = hasStatusMismatch(
      firstIssue.project_state,
      projectIssues
    );
    const isStaleUpdateFlag = isStaleUpdate(lastActivityDate);
    const missingLeadFlag = isMissingLead(
      firstIssue.project_state,
      firstIssue.project_lead_name,
      projectIssues
    );
    const hasViolationsFlag = hasViolations(projectIssues);
    const missingHealthFlag = !firstIssue.project_health;

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

    // Get project updates from map, sort by createdAt descending (newest first), and serialize to JSON
    const projectUpdates = projectUpdatesMap?.get(projectId) || [];
    const sortedUpdates = projectUpdates.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const projectUpdatesJson =
      sortedUpdates.length > 0 ? JSON.stringify(sortedUpdates) : null;

    const project: Project = {
      project_id: projectId,
      project_name: firstIssue.project_name || "Unknown Project",
      project_state: firstIssue.project_state,
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
      has_violations: hasViolationsFlag ? 1 : 0,
      missing_health: missingHealthFlag ? 1 : 0,
      has_date_discrepancy: hasDateDiscrepancyFlag ? 1 : 0,
      start_date: linearStartDate || earliestStartedAt || earliestCreatedAt, // Prefer Linear's start date, then started_at, fallback to created_at
      last_activity_date: lastActivityDate,
      estimated_end_date: estimatedEndDate,
      target_date: targetDate, // Linear's explicit target date for the project
      issues_by_state: issuesByStateJson,
      engineers: engineersJson,
      teams: teamsJson,
      velocity_by_team: velocityByTeamJson,
      labels: labelsJson,
      project_updates: projectUpdatesJson,
    };

    upsertProject(project);
  }

  // Delete projects that no longer exist
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
  started_at: string | null;
  url: string;
  team_name: string;
  project_name: string | null;
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
      started_at: issue.started_at,
      url: issue.url,
      team_name: issue.team_name,
      project_name: issue.project_name,
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

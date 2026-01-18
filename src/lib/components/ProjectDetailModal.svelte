<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import type { ProjectSummary } from "../project-data";
  import type { Issue } from "../../db/schema";
  import Modal from "./Modal.svelte";
  import Badge from "./Badge.svelte";
  import ProgressBar from "./ProgressBar.svelte";
  import UserProfile from "./UserProfile.svelte";
  import {
    formatDateFull,
    formatRelativeDate,
    getHealthDisplay,
    calculateProjectAge,
    formatTimeDays,
    formatProjectAge,
    formatVelocity,
    formatPercent,
    calculateWIPAge,
    formatWIPAge,
    calculateIssueAccuracyRatio,
    formatAccuracyRatio,
    getAccuracyColorClass,
    formatCommentRecency,
    groupIssuesByParent,
  } from "$lib/utils/project-helpers";
  import {
    hasMissingEstimate,
    hasNoRecentComment,
    hasSubissueStatusMismatch,
    hasWIPAgeViolation,
  } from "../../utils/issue-validators";
  import PriorityDisplay from "./PriorityDisplay.svelte";
  import StatusDisplay from "./StatusDisplay.svelte";
  import { RefreshCw } from "lucide-svelte";
  import { projectsStore, databaseStore } from "../stores/database";
  import { isAuthenticated } from "$lib/stores/auth";
  import { syncStatusStore } from "$lib/stores/sync-status";

  let {
    project: initialProject,
    onclose,
    hideWarnings = false,
  }: {
    project: ProjectSummary;
    onclose: () => void;
    hideWarnings?: boolean;
  } = $props();

  // Keep project reactive to store updates
  const project = $derived.by(() => {
    const projects = $projectsStore;
    return projects.get(initialProject.projectId) || initialProject;
  });

  let projectUrl = $state<string | null>(null);
  let projectIssues = $state<Issue[]>([]);
  let issuesLoading = $state(true);
  let showAllHealthUpdates = $state(false);
  let isSyncingProject = $state(false);
  let maxPollTimeoutId: number | undefined;

  async function fetchProjectUrl() {
    if (!browser) return;
    try {
      const response = await fetch("/api/issues/with-projects");
      if (response.ok) {
        const data = await response.json();
        const projectIssue = data.issues?.find(
          (issue: any) => issue.project_id === project.projectId
        );
        if (projectIssue?.url) {
          // Extract workspace from issue URL
          const workspaceMatch = projectIssue.url.match(
            /https:\/\/linear\.app\/([^/]+)/
          );
          if (workspaceMatch) {
            const workspace = workspaceMatch[1];
            projectUrl = `https://linear.app/${workspace}/project/${project.projectId}`;
          }
        }
      }
    } catch (_error) {
      // Silently fail - link just won't be available
    }
  }

  async function fetchProjectIssues() {
    if (!browser) return;
    try {
      issuesLoading = true;
      const response = await fetch(
        `/api/issues/by-project/${project.projectId}`
      );
      if (response.ok) {
        const data = await response.json();
        projectIssues = data.issues || [];
      }
    } catch (error) {
      console.error("Failed to fetch project issues:", error);
      projectIssues = [];
    } finally {
      issuesLoading = false;
    }
  }

  function formatCommentCount(count: number | null | undefined): string {
    if (count === null || count === undefined || count === 0) {
      return "—";
    }
    return String(count);
  }

  function clearMaxTimeout() {
    if (maxPollTimeoutId) {
      clearTimeout(maxPollTimeoutId);
      maxPollTimeoutId = undefined;
    }
  }

  // Centralize polling in `syncStatusStore` to avoid duplicate `/api/sync/status` requests.
  // When a project sync finishes, refresh only this project.
  $effect(() => {
    if (!browser) return;
    if (!isSyncingProject) return;
    if (!$isAuthenticated) {
      isSyncingProject = false;
      clearMaxTimeout();
      return;
    }

    const status = $syncStatusStore;

    // Check if sync completed (status is idle and not running)
    // This handles both: 1) when syncingProjectId matches, and 2) when it's cleared after completion
    const isOurProjectSyncing = status.syncingProjectId === project.projectId;
    const syncCompleted = status.status === "idle" && !status.isRunning;
    const syncFailed = status.status === "error";

    // If another project is actively syncing, wait
    if (status.syncingProjectId && !isOurProjectSyncing) return;

    if (syncCompleted) {
      clearMaxTimeout();
      void databaseStore.refreshProject(project.projectId).then(() => {
        fetchProjectIssues();
      });
      isSyncingProject = false;
    } else if (syncFailed) {
      clearMaxTimeout();
      console.error("Sync failed:", status.error);
      isSyncingProject = false;
    }
  });

  async function syncProject() {
    if (!browser || isSyncingProject) return;

    // Check authentication before starting sync
    if (!$isAuthenticated) {
      console.error("Cannot sync: not authenticated");
      return;
    }

    try {
      isSyncingProject = true;
      // Optimistically update UI immediately
      syncStatusStore.setOptimisticSyncing(project.projectId);

      const { csrfPost } = await import("$lib/utils/csrf");
      const response = await csrfPost(`/api/sync/project/${project.projectId}`);
      if (response.ok) {
        // Clear polling after 60 seconds max
        maxPollTimeoutId = setTimeout(() => {
          if (isSyncingProject) {
            isSyncingProject = false;
          }
        }, 60000) as unknown as number;
      } else {
        const data = await response.json();
        console.error("Failed to start project sync:", data.message);
        isSyncingProject = false;
      }
    } catch (error) {
      console.error("Failed to sync project:", error);
      isSyncingProject = false;
    }
  }

  // Use pre-computed metrics from project (computed during sync)
  // Only compute projectAge on-demand since it depends on current time
  const projectAge = $derived(calculateProjectAge(project.startDate));

  onMount(() => {
    fetchProjectUrl();
    fetchProjectIssues();
  });
</script>

{#snippet headerSnippet()}
  <div
    class="flex justify-between items-start p-6 pb-4 border-b shrink-0 border-white/10"
  >
    <div class="flex-1 min-w-0">
      <h2
        id="modal-title"
        class="flex gap-2 items-center text-xl font-medium text-white"
      >
        {project.projectName}
        <button
          class="inline-flex justify-center items-center p-1.5 ml-2 rounded transition-colors duration-150 cursor-pointer text-neutral-400 hover:text-white hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
          onclick={syncProject}
          disabled={isSyncingProject}
          aria-label="Sync project"
          title="Sync this project"
        >
          <RefreshCw class="w-4 h-4 {isSyncingProject ? 'animate-spin' : ''}" />
        </button>
        {#if projectUrl}
          <a
            href={projectUrl}
            target="_blank"
            rel="noopener noreferrer"
            class="ml-2 text-sm text-violet-400 underline transition-colors duration-150 hover:text-violet-300"
          >
            Open in Linear →
          </a>
        {/if}
      </h2>
      {#if project.projectDescription}
        <div class="mt-1.5 text-sm text-neutral-400">
          {project.projectDescription}
        </div>
      {/if}
      {#if project.lastSyncedAt}
        <div class="mt-1.5 text-xs text-neutral-500">
          Last synced: {formatRelativeDate(project.lastSyncedAt)}
        </div>
      {:else}
        <div class="mt-1.5 text-xs text-neutral-500">Never synced</div>
      {/if}
    </div>
    <div class="flex gap-2 items-center">
      <button
        class="inline-flex justify-center items-center p-1.5 rounded transition-colors duration-150 cursor-pointer text-neutral-400 hover:text-white hover:bg-white/10"
        onclick={onclose}
        aria-label="Close modal"
        title="Close (ESC)"
      >
        <svg
          class="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>
  </div>
{/snippet}

{#snippet childrenSnippet()}
  <!-- Project Metadata and Dates -->
  <div class="flex flex-wrap gap-6 mb-6">
    <!-- Status -->
    <div>
      <div class="mb-1 text-xs text-neutral-500">Status</div>
      <div class="flex gap-2 items-center text-sm text-white">
        {#if project.projectStatus || project.projectStateCategory}
          {project.projectStatus || project.projectStateCategory}
          {#if !hideWarnings && project.hasStatusMismatch}
            <span
              class="text-amber-500"
              title="Status Mismatch: Project status doesn't match active work"
              >⚠️</span
            >
          {/if}
        {:else}
          <span class="text-sm text-neutral-400 dark:text-neutral-600">—</span>
        {/if}
      </div>
    </div>

    <!-- Teams -->
    <div>
      <div class="mb-1 text-xs text-neutral-500">Teams</div>
      <div class="flex flex-wrap gap-2">
        {#each Array.from(project.teams) as team}
          <Badge variant="outline">{team}</Badge>
        {/each}
      </div>
    </div>

    <!-- Lead -->
    <div>
      <div class="mb-1 text-xs text-neutral-500">Project Lead</div>
      <div class="text-sm text-white">
        {project.projectLeadName || "Not assigned"}
      </div>
    </div>

    <!-- Engineers -->
    <div>
      <div class="mb-1 text-xs text-neutral-500">
        Engineers ({project.engineerCount})
      </div>
      <div class="flex flex-wrap gap-2">
        {#each Array.from(project.engineers) as engineer}
          <Badge variant="secondary">{engineer}</Badge>
        {/each}
        {#if project.engineerCount === 0}
          <span class="text-xs text-neutral-500">No engineers assigned</span>
        {/if}
      </div>
    </div>

    <!-- Last Activity -->
    <div>
      <div class="mb-1 text-xs text-neutral-500">Last Activity</div>
      <div class="text-sm text-white">
        {formatDateFull(project.lastActivityDate)}
      </div>
    </div>

    <!-- Start Date -->
    <div>
      <div class="mb-1 text-xs text-neutral-500">Start Date</div>
      <div class="text-sm text-white">
        {formatDateFull(project.startDate)}
      </div>
    </div>

    <!-- Target Date -->
    <div>
      <div
        class="flex gap-1 items-center mb-1 text-xs text-neutral-500"
        title="Linear's explicit target date for the project"
      >
        Target Date
        {#if !hideWarnings && project.hasDateDiscrepancy}
          <span
            class="text-amber-400"
            title="Differs from predicted by 30+ days">⚠️</span
          >
        {/if}
      </div>
      <div class="text-sm text-white">
        {formatDateFull(project.targetDate)}
      </div>
    </div>

    <!-- Predicted Completion -->
    <div>
      <div
        class="flex gap-1 items-center mb-1 text-xs text-neutral-500"
        title="Velocity-predicted completion date"
      >
        Predicted Completion
        {#if !hideWarnings && project.hasDateDiscrepancy}
          <span class="text-amber-400" title="Differs from target by 30+ days"
            >⚠️</span
          >
        {/if}
      </div>
      <div class="text-sm text-white">
        {formatDateFull(project.estimatedEndDate)}
      </div>
    </div>
  </div>

  <!-- Progress Section -->
  <div class="mb-6">
    <div class="mb-2">
      <span class="text-sm font-medium text-neutral-300">Progress</span>
    </div>
    <ProgressBar {project} />
  </div>

  <!-- Gaps Summary -->
  {@const allGaps = [
    project.missingLead && "Project missing lead",
    project.isStaleUpdate && "Project missing update (7+ days)",
    project.hasStatusMismatch && "Project status mismatch",
    project.missingHealth && "Project missing health",
    project.hasDateDiscrepancy &&
      "Project target vs predicted dates differ by 30+ days",
    project.missingEstimateCount > 0 &&
      `${project.missingEstimateCount} issues missing points`,
    project.missingPriorityCount > 0 &&
      `${project.missingPriorityCount} issues missing priority`,
    project.noRecentCommentCount > 0 &&
      `${project.noRecentCommentCount} issues with no recent comment`,
    project.wipAgeViolationCount > 0 &&
      `${project.wipAgeViolationCount} issues in WIP > 14 days`,
  ].filter(Boolean)}
  {@const totalGaps =
    (project.missingLead ? 1 : 0) +
    (project.isStaleUpdate ? 1 : 0) +
    (project.hasStatusMismatch ? 1 : 0) +
    (project.missingHealth ? 1 : 0) +
    (project.hasDateDiscrepancy ? 1 : 0) +
    (project.missingEstimateCount || 0) +
    (project.missingPriorityCount || 0) +
    (project.noRecentCommentCount || 0) +
    (project.wipAgeViolationCount || 0)}
  {#if allGaps.length > 0}
    <div class="p-4 mb-6 rounded-md ring-1 ring-red-400 bg-neutral-800/50">
      <div
        class="flex gap-2 items-center mb-3 text-sm font-medium text-neutral-300"
      >
        Gaps
        <span
          class={totalGaps > 5
            ? "text-red-400"
            : totalGaps > 2
              ? "text-amber-400"
              : "text-green-400"}>({totalGaps})</span
        >
      </div>
      <ul class="space-y-1 text-sm">
        {#each allGaps as gap}
          <li class="flex gap-2 items-center text-neutral-400">
            <span>•</span>
            <span>{gap}</span>
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  <!-- Metrics Section -->
  <div class="p-4 mb-6 rounded-md border bg-neutral-800/50 border-white/5">
    <div class="mb-3 text-sm font-medium text-neutral-300">Metrics</div>
    <div class="grid grid-cols-2 gap-4">
      <!-- Left Column -->
      <div>
        <div
          class="flex gap-1 items-center mb-1 text-xs text-neutral-500"
          title="Sum of all issue estimates (story points) in the project"
        >
          Total Points
          {#if !hideWarnings && project.missingPoints > 0}
            <span
              class="text-amber-400"
              title="{project.missingPoints} issues missing estimates">⚠️</span
            >
          {/if}
        </div>
        <div class="text-sm text-white">
          {Math.round(project.totalPoints)}
          {#if !hideWarnings && project.missingPoints > 0}
            <span class="ml-1 text-xs text-amber-400">
              ({project.missingPoints} missing)
            </span>
          {/if}
        </div>
      </div>
      <div>
        <div
          class="mb-1 text-xs text-neutral-500"
          title="Average number of issues completed per week"
        >
          Velocity
        </div>
        <div class="flex gap-2 items-center text-sm text-white">
          {formatVelocity(project.velocity)} issues/week
          <span class="text-green-500">→</span>
        </div>
      </div>
      {#if project.averageCycleTime !== null}
        <div>
          <div
            class="mb-1 text-xs text-neutral-500"
            title="Average time from when an issue was started to when it was completed"
          >
            Avg Cycle Time
          </div>
          <div class="text-sm text-white">
            {formatTimeDays(project.averageCycleTime)}
          </div>
        </div>
      {/if}
      {#if project.averageLeadTime !== null}
        <div>
          <div
            class="mb-1 text-xs text-neutral-500"
            title="Average time from when an issue was created to when it was completed"
          >
            Avg Lead Time
          </div>
          <div class="text-sm text-white">
            {formatTimeDays(project.averageLeadTime)}
          </div>
        </div>
      {/if}
      <div>
        <div
          class="mb-1 text-xs text-neutral-500"
          title="Number of days since the project started"
        >
          Project Age
        </div>
        <div class="text-sm text-white">
          {formatProjectAge(projectAge)}
        </div>
      </div>
      {#if project.estimateAccuracy !== null}
        <div>
          <div
            class="mb-1 text-xs text-neutral-500"
            title="Percentage of completed issues where actual cycle time (started → completed) was within 20% of estimated time. Story points are converted to days using your team's average velocity{project.daysPerStoryPoint
              ? ` (${project.daysPerStoryPoint.toFixed(1)} days per point)`
              : ''}. Accuracy measures how well estimates predict actual completion time."
          >
            Estimate Accuracy
          </div>
          <div class="text-sm text-white">
            {formatPercent(project.estimateAccuracy)}
          </div>
        </div>
      {/if}
      {#if project.linearProgress !== null}
        <div>
          <div
            class="mb-1 text-xs text-neutral-500"
            title="Linear's calculated progress based on completed story points divided by total story points"
          >
            Linear Progress
            <span class="text-neutral-600">(by points)</span>
          </div>
          <div class="text-sm text-white">
            {formatPercent(project.linearProgress * 100)}
          </div>
        </div>
      {/if}
    </div>
    {#if project.velocityByTeam.size > 0}
      <div class="pt-3 mt-3 border-t border-white/5">
        <div
          class="mb-2 text-xs text-neutral-500"
          title="Issues completed per week, broken down by team within this project"
        >
          Velocity by Team
        </div>
        <div class="space-y-1">
          {#each Array.from(project.velocityByTeam.entries()) as [team, velocity]}
            <div class="flex justify-between items-center text-xs">
              <span class="text-neutral-400">{team}</span>
              <span class="text-neutral-300"
                >{formatVelocity(velocity)} issues/week</span
              >
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>

  <!-- Health -->
  <div class="mb-6">
    <div class="mb-2 text-xs text-neutral-500">Health</div>
    {#if project.projectUpdates && project.projectUpdates.length > 0}
      {@const latestUpdate = project.projectUpdates[0]}
      {@const updateHealthDisplay = latestUpdate.health
        ? getHealthDisplay(latestUpdate.health)
        : null}
      {@const updateDate = new Date(latestUpdate.createdAt)}
      {@const daysSinceUpdate = Math.floor(
        (Date.now() - updateDate.getTime()) / (1000 * 60 * 60 * 24)
      )}
      {@const isStaleHealth = daysSinceUpdate > 7}

      {#if isStaleHealth && !hideWarnings}
        <div class="flex gap-2 items-center mb-2 text-xs text-amber-500">
          <span>⚠️</span>
          <span>Health update is {daysSinceUpdate} days old</span>
        </div>
      {/if}

      {#if showAllHealthUpdates}
        <div class="space-y-3">
          {#each project.projectUpdates as update}
            {@const currentUpdateHealthDisplay = update.health
              ? getHealthDisplay(update.health)
              : null}
            <div class="p-3 rounded-md border bg-neutral-800/50 border-white/5">
              <div class="flex gap-2 items-center mb-2">
                {#if currentUpdateHealthDisplay}
                  <Badge
                    variant={currentUpdateHealthDisplay.variant}
                    class={currentUpdateHealthDisplay.colorClass}
                  >
                    {currentUpdateHealthDisplay.text}
                  </Badge>
                {/if}
                <span class="text-xs text-neutral-500">
                  {formatRelativeDate(update.createdAt)}
                </span>
                {#if update.userName}
                  <span class="text-neutral-600">•</span>
                  <UserProfile
                    name={update.userName}
                    avatarUrl={update.userAvatarUrl}
                    size="xs"
                  />
                {/if}
              </div>
              <div
                class="text-sm leading-relaxed whitespace-pre-wrap text-neutral-200"
              >
                {update.body}
              </div>
            </div>
          {/each}
          <button
            onclick={() => (showAllHealthUpdates = false)}
            class="mt-2 text-xs text-violet-400 underline transition-colors duration-150 cursor-pointer hover:text-violet-300"
          >
            Show only latest update
          </button>
        </div>
      {:else}
        <div class="p-3 rounded-md border bg-neutral-800/50 border-white/5">
          <div class="flex gap-2 items-center mb-2">
            {#if updateHealthDisplay}
              <Badge
                variant={updateHealthDisplay.variant}
                class={updateHealthDisplay.colorClass}
              >
                {updateHealthDisplay.text}
              </Badge>
            {/if}
            <span class="text-xs text-neutral-500">
              {formatRelativeDate(latestUpdate.createdAt)}
            </span>
            {#if latestUpdate.userName}
              <span class="text-neutral-600">•</span>
              <UserProfile
                name={latestUpdate.userName}
                avatarUrl={latestUpdate.userAvatarUrl}
                size="xs"
              />
            {/if}
          </div>
          <div
            class="text-sm leading-relaxed whitespace-pre-wrap text-neutral-200"
          >
            {latestUpdate.body}
          </div>
          {#if project.projectUpdates.length > 1}
            <button
              onclick={() => (showAllHealthUpdates = true)}
              class="mt-2 text-xs text-violet-400 underline transition-colors duration-150 cursor-pointer hover:text-violet-300"
            >
              +{project.projectUpdates.length - 1} more update{project
                .projectUpdates.length -
                1 ===
              1
                ? ""
                : "s"}
            </button>
          {/if}
        </div>
      {/if}
    {:else}
      <div class="p-3 rounded-md border bg-neutral-800/50 border-white/5">
        <p class="text-sm text-neutral-400">No health updates available</p>
      </div>
    {/if}
  </div>

  <!-- Issues Table -->
  <div class="mb-6">
    <div class="mb-2 text-xs text-neutral-500">Issues</div>
    {#if issuesLoading}
      <div class="text-sm text-neutral-400">Loading...</div>
    {:else if projectIssues.length === 0}
      <div class="text-sm text-neutral-400">No issues found</div>
    {:else}
      {@const issuesByState = (() => {
        const map = new Map();
        for (const issue of projectIssues) {
          if (!map.has(issue.state_name)) {
            map.set(issue.state_name, []);
          }
          map.get(issue.state_name)!.push(issue);
        }
        return map;
      })()}
      {@const stateTypeOrder = {
        started: 1,
        unstarted: 2,
        triage: 3,
        backlog: 4,
        completed: 5,
        canceled: 6,
      } as Record}
      {@const sortedStates = Array.from(issuesByState.entries()).sort(
        (a, b) => {
          // Sort by Linear's state_type: started, unstarted, triage, backlog, completed, canceled
          const aStateType = a[1][0]?.state_type || "";
          const bStateType = b[1][0]?.state_type || "";
          const aPriority = stateTypeOrder[aStateType] ?? 99;
          const bPriority = stateTypeOrder[bStateType] ?? 99;
          if (aPriority !== bPriority) return aPriority - bPriority;
          return a[0].localeCompare(b[0]);
        }
      )}
      {@const columnCount = project.daysPerStoryPoint !== null ? 9 : 8}
      <div class="overflow-x-auto max-h-[60vh] overflow-y-auto">
        <table class="w-full text-xs min-w-[680px]">
          <thead class="sticky top-0 z-10 bg-neutral-900">
            <tr class="border-b border-white/10">
              <th
                class="px-2 py-1.5 font-medium text-left text-neutral-400 w-[310px] min-w-[310px]"
                >Title</th
              >
              <th
                class="px-2 py-1.5 font-medium text-left text-neutral-400 w-[120px] min-w-[120px]"
                >Assignee</th
              >
              <th
                class="px-2 py-1.5 font-medium text-left text-neutral-400 w-[120px] min-w-[120px]"
                >Status</th
              >
              <th
                class="px-2 py-1.5 font-medium text-right text-neutral-400 w-[70px] min-w-[70px]"
                >Points</th
              >
              <th
                class="px-2 py-1.5 font-medium text-right text-neutral-400 w-[80px] min-w-[80px]"
                >Priority</th
              >
              <th
                class="px-2 py-1.5 font-medium text-right text-neutral-400 w-[110px] min-w-[110px]"
                title="Time since last comment">Last Comment</th
              >
              <th
                class="px-2 py-1.5 font-medium text-right text-neutral-400 w-[80px] min-w-[80px]"
                title="Total number of comments">Comments</th
              >
              <th
                class="px-2 py-1.5 font-medium text-right text-neutral-400 w-[70px] min-w-[70px]"
                >WIP Age</th
              >
              {#if project.daysPerStoryPoint !== null}
                <th
                  class="px-2 py-1.5 font-medium text-right text-neutral-400 w-[120px] min-w-[120px]"
                  title="Ratio of actual time to estimated time. 1.0x = perfect match. < 1.0x = faster than estimated, > 1.0x = slower than estimated. Green = within 30%, Yellow = 30-70% off, Red = 70%+ off."
                  >Estimate Accuracy</th
                >
              {/if}
            </tr>
          </thead>
          <tbody>
            {#each sortedStates as [state, issues]}
              <!-- Status Divider Row -->
              <tr>
                <td colspan={columnCount} class="px-2 py-2.5">
                  <span class="-ml-1 text-xs font-semibold text-neutral-400">
                    {state} ({issues.length})
                  </span>
                </td>
              </tr>
              <!-- Issues for this state - grouped by parent -->
              {@const groupedIssues = groupIssuesByParent(issues)}
              {#each groupedIssues as groupedIssue}
                {#if "parent" in groupedIssue}
                  {@const parent = groupedIssue.parent}
                  {@const subissues = groupedIssue.subissues}
                  {@const isCompleted = (() => {
                    const stateName = parent.state_name?.toLowerCase() || "";
                    return (
                      stateName.includes("done") ||
                      stateName.includes("completed")
                    );
                  })()}
                  {@const wipAge = calculateWIPAge(parent, isCompleted)}
                  {@const issueAccuracyRatio =
                    project.daysPerStoryPoint !== null && isCompleted
                      ? calculateIssueAccuracyRatio(
                          parent,
                          project.daysPerStoryPoint
                        )
                      : null}
                  {@const commentRecency = formatCommentRecency(
                    parent.last_comment_at
                  )}
                  {@const hasOldComment = hasNoRecentComment(parent)}
                  {@const missingEstimate = hasMissingEstimate(parent)}
                  {@const hasStatusMismatch = hasSubissueStatusMismatch(
                    parent,
                    projectIssues
                  )}
                  <!-- Parent issue row -->
                  <tr
                    class="border-b transition-colors cursor-pointer border-white/5 hover:bg-white/5 focus:outline-none"
                    onclick={() => {
                      if (parent.url && browser) {
                        window.open(
                          parent.url,
                          "_blank",
                          "noopener,noreferrer"
                        );
                      }
                    }}
                    role="button"
                    tabindex="0"
                    onkeydown={(e) => {
                      if (
                        (e.key === "Enter" || e.key === " ") &&
                        parent.url &&
                        browser
                      ) {
                        e.preventDefault();
                        window.open(
                          parent.url,
                          "_blank",
                          "noopener,noreferrer"
                        );
                      }
                    }}
                  >
                    <td
                      class="px-2 py-1.5 text-neutral-200 w-[310px] min-w-[310px] max-w-[310px]"
                    >
                      <div
                        class="overflow-hidden truncate whitespace-nowrap text-ellipsis"
                        title={parent.title}
                      >
                        {parent.title}
                        {#if subissues.length > 0}
                          <span class="ml-1 text-xs text-neutral-500"
                            >({subissues.length})</span
                          >
                        {/if}
                      </div>
                    </td>
                    <td
                      class="px-2 py-1.5 w-[120px] min-w-[120px] max-w-[120px]"
                    >
                      {#if parent.assignee_name}
                        <UserProfile
                          name={parent.assignee_name}
                          avatarUrl={parent.assignee_avatar_url}
                          size="xs"
                        />
                      {:else}
                        <span class="text-xs text-neutral-500">Unassigned</span>
                      {/if}
                    </td>
                    <td class="px-2 py-1.5">
                      <StatusDisplay
                        stateName={parent.state_name || ""}
                        stateType={parent.state_type || ""}
                        showWarnings={!hideWarnings}
                        warnings={hasStatusMismatch
                          ? [
                              {
                                type: "status-mismatch",
                                message:
                                  "Parent issue is done but has incomplete subissues",
                              },
                            ]
                          : []}
                      />
                    </td>
                    <td
                      class="px-2 py-1.5 text-right text-neutral-300 w-[70px] min-w-[70px]"
                    >
                      <div class="flex gap-1.5 justify-end items-center">
                        {#if parent.estimate !== null && parent.estimate !== undefined}
                          {Math.round(parent.estimate)}
                        {:else if !hideWarnings && missingEstimate}
                          <span class="text-amber-400" title="Missing estimate"
                            >⚠️</span
                          >
                        {:else}
                          <span class="text-neutral-500">—</span>
                        {/if}
                      </div>
                    </td>
                    <td class="px-2 py-1.5 text-right w-[80px] min-w-[80px]">
                      <div class="flex justify-end">
                        <PriorityDisplay priority={parent.priority || 0} />
                      </div>
                    </td>
                    <td class="px-2 py-1.5 text-right w-[110px] min-w-[110px]">
                      <div class="flex gap-1.5 justify-end items-center">
                        {#if !hideWarnings && hasOldComment}
                          <span
                            class="text-amber-400 shrink-0"
                            title="No comment since last business day">⚠️</span
                          >
                        {/if}
                        <span
                          class={!hideWarnings && hasOldComment
                            ? "text-amber-400"
                            : "text-neutral-300"}>{commentRecency}</span
                        >
                      </div>
                    </td>
                    <td
                      class="px-2 py-1.5 text-right text-neutral-300 w-[80px] min-w-[80px]"
                    >
                      {formatCommentCount(parent.comment_count)}
                    </td>
                    <td
                      class="px-2 py-1.5 text-right text-neutral-300 w-[70px] min-w-[70px]"
                    >
                      <div class="flex gap-1 justify-end items-center">
                        {#if hasWIPAgeViolation(parent)}
                          <span
                            class="text-amber-400"
                            title="WIP age exceeds 14 days">⚠️</span
                          >
                        {/if}
                        {formatWIPAge(wipAge)}
                      </div>
                    </td>
                    {#if project.daysPerStoryPoint !== null}
                      <td
                        class="px-2 py-1.5 text-right w-[120px] min-w-[120px]"
                      >
                        {#if issueAccuracyRatio !== null}
                          <span
                            class={getAccuracyColorClass(issueAccuracyRatio)}
                            title={issueAccuracyRatio === 1.0
                              ? "Perfect match! Actual time equals estimated time (1.0x)"
                              : issueAccuracyRatio >= 1.0
                                ? `Took ${((issueAccuracyRatio - 1) * 100).toFixed(0)}% longer than estimated (goal: 1.0x)`
                                : `Completed ${((1 - issueAccuracyRatio) * 100).toFixed(0)}% faster than estimated (goal: 1.0x)`}
                          >
                            {formatAccuracyRatio(issueAccuracyRatio)}
                          </span>
                        {:else}
                          <span class="text-neutral-500">—</span>
                        {/if}
                      </td>
                    {/if}
                  </tr>
                  <!-- Subissue rows -->
                  {#each subissues as subissue}
                    {@const subIsCompleted = (() => {
                      const stateName =
                        subissue.state_name?.toLowerCase() || "";
                      return (
                        stateName.includes("done") ||
                        stateName.includes("completed")
                      );
                    })()}
                    {@const subWipAge = calculateWIPAge(
                      subissue,
                      subIsCompleted
                    )}
                    {@const subIssueAccuracyRatio =
                      project.daysPerStoryPoint !== null && subIsCompleted
                        ? calculateIssueAccuracyRatio(
                            subissue,
                            project.daysPerStoryPoint
                          )
                        : null}
                    {@const subCommentRecency = formatCommentRecency(
                      subissue.last_comment_at
                    )}
                    {@const subHasOldComment = hasNoRecentComment(subissue)}
                    {@const subMissingEstimate = hasMissingEstimate(subissue)}
                    <tr
                      class="border-b transition-colors cursor-pointer border-white/5 hover:bg-white/5 focus:outline-none"
                      onclick={() => {
                        if (subissue.url && browser) {
                          window.open(
                            subissue.url,
                            "_blank",
                            "noopener,noreferrer"
                          );
                        }
                      }}
                      role="button"
                      tabindex="0"
                      onkeydown={(e) => {
                        if (
                          (e.key === "Enter" || e.key === " ") &&
                          subissue.url &&
                          browser
                        ) {
                          e.preventDefault();
                          window.open(
                            subissue.url,
                            "_blank",
                            "noopener,noreferrer"
                          );
                        }
                      }}
                    >
                      <td
                        class="px-2 py-1.5 text-neutral-200 w-[310px] min-w-[310px] max-w-[310px]"
                      >
                        <div
                          class="overflow-hidden pl-6 truncate whitespace-nowrap text-ellipsis"
                          title={subissue.title}
                        >
                          <span class="mr-1 text-neutral-400 shrink-0">↳</span>
                          {subissue.title}
                        </div>
                      </td>
                      <td
                        class="px-2 py-1.5 w-[120px] min-w-[120px] max-w-[120px]"
                      >
                        {#if subissue.assignee_name}
                          <UserProfile
                            name={subissue.assignee_name}
                            avatarUrl={subissue.assignee_avatar_url}
                            size="xs"
                          />
                        {:else}
                          <span class="text-xs text-neutral-500"
                            >Unassigned</span
                          >
                        {/if}
                      </td>
                      <td class="px-2 py-1.5">
                        <StatusDisplay
                          stateName={subissue.state_name || ""}
                          stateType={subissue.state_type || ""}
                          showWarnings={!hideWarnings}
                          warnings={[]}
                        />
                      </td>
                      <td
                        class="px-2 py-1.5 text-right text-neutral-300 w-[70px] min-w-[70px]"
                      >
                        <div class="flex gap-1.5 justify-end items-center">
                          {#if subissue.estimate !== null && subissue.estimate !== undefined}
                            {Math.round(subissue.estimate)}
                          {:else if !hideWarnings && subMissingEstimate}
                            <span
                              class="text-amber-400"
                              title="Missing estimate">⚠️</span
                            >
                          {:else}
                            <span class="text-neutral-500">—</span>
                          {/if}
                        </div>
                      </td>
                      <td class="px-2 py-1.5 text-right w-[80px] min-w-[80px]">
                        <div class="flex justify-end">
                          <PriorityDisplay priority={subissue.priority || 0} />
                        </div>
                      </td>
                      <td
                        class="px-2 py-1.5 text-right w-[110px] min-w-[110px]"
                      >
                        <div class="flex gap-1.5 justify-end items-center">
                          {#if !hideWarnings && subHasOldComment}
                            <span
                              class="text-amber-400 shrink-0"
                              title="No comment since last business day"
                              >⚠️</span
                            >
                          {/if}
                          <span
                            class={!hideWarnings && subHasOldComment
                              ? "text-amber-400"
                              : "text-neutral-300"}>{subCommentRecency}</span
                          >
                        </div>
                      </td>
                      <td
                        class="px-2 py-1.5 text-right text-neutral-300 w-[80px] min-w-[80px]"
                      >
                        {formatCommentCount(subissue.comment_count)}
                      </td>
                      <td
                        class="px-2 py-1.5 text-right text-neutral-300 w-[70px] min-w-[70px]"
                      >
                        <div class="flex gap-1 justify-end items-center">
                          {#if hasWIPAgeViolation(subissue)}
                            <span
                              class="text-amber-400"
                              title="WIP age exceeds 14 days">⚠️</span
                            >
                          {/if}
                          {formatWIPAge(subWipAge)}
                        </div>
                      </td>
                      {#if project.daysPerStoryPoint !== null}
                        <td
                          class="px-2 py-1.5 text-right w-[120px] min-w-[120px]"
                        >
                          {#if subIssueAccuracyRatio !== null}
                            <span
                              class={getAccuracyColorClass(
                                subIssueAccuracyRatio
                              )}
                              title={subIssueAccuracyRatio === 1.0
                                ? "Perfect match! Actual time equals estimated time (1.0x)"
                                : subIssueAccuracyRatio >= 1.0
                                  ? `Took ${((subIssueAccuracyRatio - 1) * 100).toFixed(0)}% longer than estimated (goal: 1.0x)`
                                  : `Completed ${((1 - subIssueAccuracyRatio) * 100).toFixed(0)}% faster than estimated (goal: 1.0x)`}
                            >
                              {formatAccuracyRatio(subIssueAccuracyRatio)}
                            </span>
                          {:else}
                            <span class="text-neutral-500">—</span>
                          {/if}
                        </td>
                      {/if}
                    </tr>
                  {/each}
                {:else}
                  {@const issue = groupedIssue}
                  {@const isCompleted = (() => {
                    const stateName = issue.state_name?.toLowerCase() || "";
                    return (
                      stateName.includes("done") ||
                      stateName.includes("completed")
                    );
                  })()}
                  {@const wipAge = calculateWIPAge(issue, isCompleted)}
                  {@const issueAccuracyRatio =
                    project.daysPerStoryPoint !== null && isCompleted
                      ? calculateIssueAccuracyRatio(
                          issue,
                          project.daysPerStoryPoint
                        )
                      : null}
                  {@const commentRecency = formatCommentRecency(
                    issue.last_comment_at
                  )}
                  {@const hasOldComment = hasNoRecentComment(issue)}
                  {@const missingEstimate = hasMissingEstimate(issue)}
                  <tr
                    class="border-b transition-colors cursor-pointer border-white/5 hover:bg-white/5 focus:outline-none"
                    onclick={() => {
                      if (issue.url && browser) {
                        window.open(issue.url, "_blank", "noopener,noreferrer");
                      }
                    }}
                    role="button"
                    tabindex="0"
                    onkeydown={(e) => {
                      if (
                        (e.key === "Enter" || e.key === " ") &&
                        issue.url &&
                        browser
                      ) {
                        e.preventDefault();
                        window.open(issue.url, "_blank", "noopener,noreferrer");
                      }
                    }}
                  >
                    <td
                      class="px-2 py-1.5 text-neutral-200 w-[310px] min-w-[310px] max-w-[310px]"
                    >
                      <div
                        class="overflow-hidden truncate whitespace-nowrap text-ellipsis"
                        title={issue.title}
                      >
                        {issue.title}
                      </div>
                    </td>
                    <td
                      class="px-2 py-1.5 w-[120px] min-w-[120px] max-w-[120px]"
                    >
                      {#if issue.assignee_name}
                        <UserProfile
                          name={issue.assignee_name}
                          avatarUrl={issue.assignee_avatar_url}
                          size="xs"
                        />
                      {:else}
                        <span class="text-xs text-neutral-500">Unassigned</span>
                      {/if}
                    </td>
                    <td class="px-2 py-1.5">
                      <StatusDisplay
                        stateName={issue.state_name || ""}
                        stateType={issue.state_type || ""}
                        showWarnings={!hideWarnings}
                        warnings={[]}
                      />
                    </td>
                    <td
                      class="px-2 py-1.5 text-right text-neutral-300 w-[70px] min-w-[70px]"
                    >
                      <div class="flex gap-1.5 justify-end items-center">
                        {#if issue.estimate !== null && issue.estimate !== undefined}
                          {Math.round(issue.estimate)}
                        {:else if !hideWarnings && missingEstimate}
                          <span class="text-amber-400" title="Missing estimate"
                            >⚠️</span
                          >
                        {:else}
                          <span class="text-neutral-500">—</span>
                        {/if}
                      </div>
                    </td>
                    <td class="px-2 py-1.5 text-right w-[80px] min-w-[80px]">
                      <div class="flex justify-end">
                        <PriorityDisplay priority={issue.priority || 0} />
                      </div>
                    </td>
                    <td class="px-2 py-1.5 text-right w-[110px] min-w-[110px]">
                      <div class="flex gap-1.5 justify-end items-center">
                        {#if !hideWarnings && hasOldComment}
                          <span
                            class="text-amber-400 shrink-0"
                            title="No comment since last business day">⚠️</span
                          >
                        {/if}
                        <span
                          class={!hideWarnings && hasOldComment
                            ? "text-amber-400"
                            : "text-neutral-300"}>{commentRecency}</span
                        >
                      </div>
                    </td>
                    <td
                      class="px-2 py-1.5 text-right text-neutral-300 w-[80px] min-w-[80px]"
                    >
                      {formatCommentCount(issue.comment_count)}
                    </td>
                    <td
                      class="px-2 py-1.5 text-right text-neutral-300 w-[70px] min-w-[70px]"
                    >
                      <div class="flex gap-1 justify-end items-center">
                        {#if hasWIPAgeViolation(issue)}
                          <span
                            class="text-amber-400"
                            title="WIP age exceeds 14 days">⚠️</span
                          >
                        {/if}
                        {formatWIPAge(wipAge)}
                      </div>
                    </td>
                    {#if project.daysPerStoryPoint !== null}
                      <td
                        class="px-2 py-1.5 text-right w-[120px] min-w-[120px]"
                      >
                        {#if issueAccuracyRatio !== null}
                          <span
                            class={getAccuracyColorClass(issueAccuracyRatio)}
                            title={issueAccuracyRatio === 1.0
                              ? "Perfect match! Actual time equals estimated time (1.0x)"
                              : issueAccuracyRatio >= 1.0
                                ? `Took ${((issueAccuracyRatio - 1) * 100).toFixed(0)}% longer than estimated (goal: 1.0x)`
                                : `Completed ${((1 - issueAccuracyRatio) * 100).toFixed(0)}% faster than estimated (goal: 1.0x)`}
                          >
                            {formatAccuracyRatio(issueAccuracyRatio)}
                          </span>
                        {:else}
                          <span class="text-neutral-500">—</span>
                        {/if}
                      </td>
                    {/if}
                  </tr>
                {/if}
              {/each}
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
{/snippet}

<Modal
  {onclose}
  size="2xl"
  maxHeight="90vh"
  scrollable={true}
  header={headerSnippet}
  children={childrenSnippet}
/>

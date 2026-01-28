<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import type { ProjectSummary } from "../project-data";
  import type { Issue } from "../../db/schema";
  import Modal from "./Modal.svelte";
  import Badge from "./Badge.svelte";
  import ProgressBar from "./ProgressBar.svelte";
  import UserProfile from "./UserProfile.svelte";
  import IssueTable from "./IssueTable.svelte";
  import {
    formatDateFull,
    formatRelativeDate,
    getHealthDisplay,
    calculateProjectAge,
    formatTimeDays,
    formatProjectAge,
    formatVelocity,
    formatPercent,
  } from "$lib/utils/project-helpers";
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
    class="flex justify-between items-start p-6 pb-4 border-b shrink-0 border-black-200 dark:border-white/10"
  >
    <div class="flex-1 min-w-0">
      <h2
        id="modal-title"
        class="flex gap-2 items-center text-xl font-medium text-black-900 dark:text-white"
      >
        {project.projectName}
        <button
          class="inline-flex justify-center items-center p-1.5 ml-2 rounded transition-colors duration-150 cursor-pointer text-black-400 hover:text-white hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
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
            class="ml-2 text-sm text-brand-400 underline transition-colors duration-150 hover:text-brand-300"
          >
            Open in Linear →
          </a>
        {/if}
      </h2>
      {#if project.projectDescription}
        <div class="mt-1.5 text-sm text-black-400">
          {project.projectDescription}
        </div>
      {/if}
      {#if project.lastSyncedAt}
        <div class="mt-1.5 text-xs text-black-500">
          Last synced: {formatRelativeDate(project.lastSyncedAt)}
        </div>
      {:else}
        <div class="mt-1.5 text-xs text-black-500">Never synced</div>
      {/if}
    </div>
    <div class="flex gap-2 items-center">
      <button
        class="inline-flex justify-center items-center p-1.5 rounded transition-colors duration-150 cursor-pointer text-black-400 hover:text-white hover:bg-black-100 dark:bg-white/10"
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
      <div class="mb-1 text-xs text-black-500">Status</div>
      <div
        class="flex gap-2 items-center text-sm text-black-900 dark:text-white"
      >
        {#if project.projectStatus || project.projectStateCategory}
          {project.projectStatus || project.projectStateCategory}
          {#if !hideWarnings && project.hasStatusMismatch}
            <span
              class="text-warning-500"
              title="Status Mismatch: Project status doesn't match active work"
              >⚠️</span
            >
          {/if}
        {:else}
          <span class="text-sm text-black-400 dark:text-black-600">—</span>
        {/if}
      </div>
    </div>

    <!-- Teams -->
    <div>
      <div class="mb-1 text-xs text-black-500">Teams</div>
      <div class="flex flex-wrap gap-2">
        {#each Array.from(project.teams) as team}
          <Badge variant="outline">{team}</Badge>
        {/each}
      </div>
    </div>

    <!-- Lead -->
    <div>
      <div class="mb-1 text-xs text-black-500">Project Lead</div>
      <div class="text-sm text-black-900 dark:text-white">
        {project.projectLeadName || "Not assigned"}
      </div>
    </div>

    <!-- Engineers -->
    <div>
      <div class="mb-1 text-xs text-black-500">
        Engineers ({project.engineerCount})
      </div>
      <div class="flex flex-wrap gap-2">
        {#each Array.from(project.engineers) as engineer}
          <Badge variant="secondary">{engineer}</Badge>
        {/each}
        {#if project.engineerCount === 0}
          <span class="text-xs text-black-500">No engineers assigned</span>
        {/if}
      </div>
    </div>

    <!-- Last Activity -->
    <div>
      <div class="mb-1 text-xs text-black-500">Last Activity</div>
      <div class="text-sm text-black-900 dark:text-white">
        {formatDateFull(project.lastActivityDate)}
      </div>
    </div>

    <!-- Start Date -->
    <div>
      <div class="mb-1 text-xs text-black-500">Start Date</div>
      <div class="text-sm text-black-900 dark:text-white">
        {formatDateFull(project.startDate)}
      </div>
    </div>

    <!-- Target Date -->
    <div>
      <div
        class="flex gap-1 items-center mb-1 text-xs text-black-500"
        title="Linear's explicit target date for the project"
      >
        Target Date
        {#if !hideWarnings && project.hasDateDiscrepancy}
          <span
            class="text-warning-400"
            title="Differs from predicted by 30+ days">⚠️</span
          >
        {/if}
      </div>
      <div class="text-sm text-black-900 dark:text-white">
        {formatDateFull(project.targetDate)}
      </div>
    </div>

    <!-- Predicted Completion -->
    <div>
      <div
        class="flex gap-1 items-center mb-1 text-xs text-black-500"
        title="Velocity-predicted completion date"
      >
        Predicted Completion
        {#if !hideWarnings && project.hasDateDiscrepancy}
          <span class="text-warning-400" title="Differs from target by 30+ days"
            >⚠️</span
          >
        {/if}
      </div>
      <div class="text-sm text-black-900 dark:text-white">
        {formatDateFull(project.estimatedEndDate)}
      </div>
    </div>
  </div>

  <!-- Progress Section -->
  <div class="mb-6">
    <div class="mb-2">
      <span class="text-sm font-medium text-black-700 dark:text-black-300"
        >Progress</span
      >
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
    <div class="p-4 mb-6 rounded-md ring-1 ring-danger-400 bg-black-800/50">
      <div
        class="flex gap-2 items-center mb-3 text-sm font-medium text-black-700 dark:text-black-300"
      >
        Gaps
        <span
          class={totalGaps > 5
            ? "text-danger-400"
            : totalGaps > 2
              ? "text-warning-400"
              : "text-success-400"}>({totalGaps})</span
        >
      </div>
      <ul class="space-y-1 text-sm">
        {#each allGaps as gap}
          <li class="flex gap-2 items-center text-black-400">
            <span>•</span>
            <span>{gap}</span>
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  <!-- Metrics Section -->
  <div class="p-4 mb-6 rounded-md border bg-black-800/50 border-white/5">
    <div class="mb-3 text-sm font-medium text-black-700 dark:text-black-300">
      Metrics
    </div>
    <div class="grid grid-cols-2 gap-4">
      <!-- Left Column -->
      <div>
        <div
          class="flex gap-1 items-center mb-1 text-xs text-black-500"
          title="Sum of all issue estimates (story points) in the project"
        >
          Total Points
          {#if !hideWarnings && project.missingPoints > 0}
            <span
              class="text-warning-400"
              title="{project.missingPoints} issues missing estimates">⚠️</span
            >
          {/if}
        </div>
        <div class="text-sm text-black-900 dark:text-white">
          {Math.round(project.totalPoints)}
          {#if !hideWarnings && project.missingPoints > 0}
            <span class="ml-1 text-xs text-warning-400">
              ({project.missingPoints} missing)
            </span>
          {/if}
        </div>
      </div>
      <div>
        <div
          class="mb-1 text-xs text-black-500"
          title="Average number of issues completed per week"
        >
          Velocity
        </div>
        <div
          class="flex gap-2 items-center text-sm text-black-900 dark:text-white"
        >
          {formatVelocity(project.velocity)} issues/week
          <span class="text-success-500">→</span>
        </div>
      </div>
      {#if project.averageCycleTime !== null}
        <div>
          <div
            class="mb-1 text-xs text-black-500"
            title="Average time from when an issue was started to when it was completed"
          >
            Avg Cycle Time
          </div>
          <div class="text-sm text-black-900 dark:text-white">
            {formatTimeDays(project.averageCycleTime)}
          </div>
        </div>
      {/if}
      {#if project.averageLeadTime !== null}
        <div>
          <div
            class="mb-1 text-xs text-black-500"
            title="Average time from when an issue was created to when it was completed"
          >
            Avg Lead Time
          </div>
          <div class="text-sm text-black-900 dark:text-white">
            {formatTimeDays(project.averageLeadTime)}
          </div>
        </div>
      {/if}
      <div>
        <div
          class="mb-1 text-xs text-black-500"
          title="Number of days since the project started"
        >
          Project Age
        </div>
        <div class="text-sm text-black-900 dark:text-white">
          {formatProjectAge(projectAge)}
        </div>
      </div>
      {#if project.estimateAccuracy !== null}
        <div>
          <div
            class="mb-1 text-xs text-black-500"
            title="Percentage of completed issues where actual cycle time (started → completed) was within 20% of estimated time. Story points are converted to days using your team's average velocity{project.daysPerStoryPoint
              ? ` (${project.daysPerStoryPoint.toFixed(1)} days per point)`
              : ''}. Accuracy measures how well estimates predict actual completion time."
          >
            Estimate Accuracy
          </div>
          <div class="text-sm text-black-900 dark:text-white">
            {formatPercent(project.estimateAccuracy)}
          </div>
        </div>
      {/if}
      {#if project.linearProgress !== null}
        <div>
          <div
            class="mb-1 text-xs text-black-500"
            title="Linear's calculated progress based on completed story points divided by total story points"
          >
            Linear Progress
            <span class="text-black-600">(by points)</span>
          </div>
          <div class="text-sm text-black-900 dark:text-white">
            {formatPercent(project.linearProgress * 100)}
          </div>
        </div>
      {/if}
    </div>
    {#if project.velocityByTeam.size > 0}
      <div class="pt-3 mt-3 border-t border-white/5">
        <div
          class="mb-2 text-xs text-black-500"
          title="Issues completed per week, broken down by team within this project"
        >
          Velocity by Team
        </div>
        <div class="space-y-1">
          {#each Array.from(project.velocityByTeam.entries()) as [team, velocity]}
            <div class="flex justify-between items-center text-xs">
              <span class="text-black-600 dark:text-black-400">{team}</span>
              <span class="text-black-700 dark:text-black-300"
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
    <div class="mb-2 text-xs text-black-500">Health</div>
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
        <div class="flex gap-2 items-center mb-2 text-xs text-warning-500">
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
            <div class="p-3 rounded-md border bg-black-800/50 border-white/5">
              <div class="flex gap-2 items-center mb-2">
                {#if currentUpdateHealthDisplay}
                  <Badge
                    variant={currentUpdateHealthDisplay.variant}
                    class={currentUpdateHealthDisplay.colorClass}
                  >
                    {currentUpdateHealthDisplay.text}
                  </Badge>
                {/if}
                <span class="text-xs text-black-500">
                  {formatRelativeDate(update.createdAt)}
                </span>
                {#if update.userName}
                  <span class="text-black-600">•</span>
                  <UserProfile
                    name={update.userName}
                    avatarUrl={update.userAvatarUrl}
                    size="xs"
                  />
                {/if}
              </div>
              <div
                class="text-sm leading-relaxed whitespace-pre-wrap text-black-200"
              >
                {update.body}
              </div>
            </div>
          {/each}
          <button
            onclick={() => (showAllHealthUpdates = false)}
            class="mt-2 text-xs text-brand-400 underline transition-colors duration-150 cursor-pointer hover:text-brand-300"
          >
            Show only latest update
          </button>
        </div>
      {:else}
        <div class="p-3 rounded-md border bg-black-800/50 border-white/5">
          <div class="flex gap-2 items-center mb-2">
            {#if updateHealthDisplay}
              <Badge
                variant={updateHealthDisplay.variant}
                class={updateHealthDisplay.colorClass}
              >
                {updateHealthDisplay.text}
              </Badge>
            {/if}
            <span class="text-xs text-black-500">
              {formatRelativeDate(latestUpdate.createdAt)}
            </span>
            {#if latestUpdate.userName}
              <span class="text-black-600">•</span>
              <UserProfile
                name={latestUpdate.userName}
                avatarUrl={latestUpdate.userAvatarUrl}
                size="xs"
              />
            {/if}
          </div>
          <div
            class="text-sm leading-relaxed whitespace-pre-wrap text-black-200"
          >
            {latestUpdate.body}
          </div>
          {#if project.projectUpdates.length > 1}
            <button
              onclick={() => (showAllHealthUpdates = true)}
              class="mt-2 text-xs text-brand-400 underline transition-colors duration-150 cursor-pointer hover:text-brand-300"
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
      <div class="p-3 rounded-md border bg-black-800/50 border-white/5">
        <p class="text-sm text-black-400">No health updates available</p>
      </div>
    {/if}
  </div>

  <!-- Issues Table -->
  <div class="mb-6">
    <div class="mb-2 text-xs text-black-500">Issues</div>
    {#if issuesLoading}
      <div class="text-sm text-black-400">Loading...</div>
    {:else if projectIssues.length === 0}
      <div class="text-sm text-black-400">No issues found</div>
    {:else}
      <IssueTable
        issues={projectIssues}
        showAssignee={true}
        showIdentifier={false}
        showEstimateAccuracy={project.daysPerStoryPoint !== null}
        daysPerStoryPoint={project.daysPerStoryPoint}
        groupByState={true}
        {hideWarnings}
      />
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

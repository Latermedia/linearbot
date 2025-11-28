<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import {
    databaseStore,
    projectsStore,
    teamsStore,
    domainsStore,
  } from "$lib/stores/database";
  import { presentationMode } from "$lib/stores/presentation";
  import Card from "$lib/components/Card.svelte";
  import Skeleton from "$lib/components/Skeleton.svelte";
  import Badge from "$lib/components/Badge.svelte";
  import ProgressBar from "$lib/components/ProgressBar.svelte";
  import ProjectDetailModal from "$lib/components/ProjectDetailModal.svelte";
  import ProjectsTable from "$lib/components/ProjectsTable.svelte";
  import GanttChart from "$lib/components/GanttChart.svelte";
  import ToggleGroupRoot from "$lib/components/ToggleGroupRoot.svelte";
  import ToggleGroupItem from "$lib/components/ToggleGroupItem.svelte";
  import type {
    ProjectSummary,
    TeamSummary,
    DomainSummary,
  } from "$lib/project-data";
  import type { Issue } from "../../db/schema";
  import {
    getRecentProgress,
    formatDateFull,
    getHealthDisplay,
  } from "$lib/utils/project-helpers";
  import {
    getTotalCompletedInPeriod,
    getRecentVelocity,
    getTotalActiveEngineers,
  } from "$lib/utils/executive-stats";

  let viewType = $state<"card" | "table" | "gantt">("card");
  let endDateMode = $state<"predicted" | "target">("predicted");

  // Load data on mount
  onMount(() => {
    databaseStore.load();
  });

  // Secret executive view shortcut: Ctrl+Shift+E (Windows/Linux) or Cmd+Shift+E (Mac)
  $effect(() => {
    if (!browser) return;

    function handleKeydown(event: KeyboardEvent) {
      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const keyLower = event.key.toLowerCase();

      // Check for shortcut: Cmd+Shift+E (Mac) or Ctrl+Shift+E (Windows/Linux)
      const modifierPressed = isMac
        ? event.metaKey && event.shiftKey && !event.altKey && !event.ctrlKey
        : event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey;

      if (modifierPressed && keyLower === "e") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        presentationMode.set(false);
        goto("/");
        return false;
      }
    }

    document.addEventListener("keydown", handleKeydown, {
      capture: true,
      passive: false,
    });

    return () => {
      document.removeEventListener("keydown", handleKeydown, {
        capture: true,
      } as any);
    };
  });

  const loading = $derived($databaseStore.loading);
  const error = $derived($databaseStore.error);
  const projects = $derived($projectsStore);
  const issues = $derived($databaseStore.issues);
  const allTeams = $derived($teamsStore);
  const allDomains = $derived($domainsStore);

  // Filter projects: Executive Visibility label + in progress
  const executiveProjects = $derived.by(() => {
    if (!browser || projects.size === 0) return [];

    return Array.from(projects.values()).filter((project) => {
      // Check for Executive Visibility label
      const hasExecutiveLabel = project.labels.includes("Executive Visibility");

      // Check if in progress (project_state contains "progress" or "started")
      const projectState = project.projectState?.toLowerCase() || "";
      const isInProgress =
        projectState.includes("progress") ||
        projectState.includes("started") ||
        projectState === "started";

      return hasExecutiveLabel && isInProgress;
    });
  });

  // Create a single unified group for executive projects
  const executiveTeam = $derived.by(() => {
    return {
      teamId: "executive",
      teamName: "Executive Projects",
      teamKey: "EXEC",
      projects: executiveProjects,
      domain: null,
    } as TeamSummary;
  });

  // For table/gantt views, we use a single team array
  const executiveTeams = $derived.by(() => {
    if (executiveProjects.length === 0) return [];
    return [executiveTeam];
  });

  // Empty domains array since we don't group by domain in executive view
  const executiveDomains = $derived.by(() => {
    return [];
  });

  // Calculate recent progress for each project
  const projectsWithProgress = $derived.by(() => {
    if (!issues || issues.length === 0)
      return executiveProjects.map((p) => ({
        project: p,
        recentProgress: null,
      }));

    return executiveProjects.map((project) => {
      const recentProgress = getRecentProgress(project, issues, 14);
      return { project, recentProgress };
    });
  });

  // Calculate executive-level stats
  const executiveStats = $derived.by(() => {
    if (
      !browser ||
      executiveProjects.length === 0 ||
      !issues ||
      issues.length === 0
    ) {
      return {
        totalCompleted: 0,
        recentVelocity: 0,
        activeEngineers: 0,
      };
    }

    const projectIds = executiveProjects.map((p) => p.projectId);
    const totalCompleted = getTotalCompletedInPeriod(issues, projectIds, 14);
    const recentVelocity = getRecentVelocity(issues, projectIds, 14);
    const activeEngineers = getTotalActiveEngineers(executiveProjects);

    return {
      totalCompleted,
      recentVelocity,
      activeEngineers,
    };
  });

  let selectedProject: ProjectSummary | null = $state(null);

  function handleProjectClick(project: ProjectSummary): void {
    selectedProject = project;
  }

  function closeModal(): void {
    selectedProject = null;
  }
</script>

<div class="space-y-6">
  <!-- Header -->
  <div>
    <h1 class="text-3xl font-bold text-neutral-900 dark:text-white">
      Executive Focus
    </h1>
    <div class="flex gap-2 items-center mt-2">
      <p class="text-sm text-neutral-600 dark:text-neutral-400">
        High-level progress overview for projects with
      </p>
      <Badge variant="outline">Executive Visibility</Badge>
      <p class="text-sm text-neutral-600 dark:text-neutral-400">label</p>
    </div>
  </div>

  <!-- Stats summary -->
  {#if !loading && !error && executiveProjects.length > 0}
    <div class="flex flex-wrap gap-4">
      <Card class="max-w-[200px]">
        <div class="mb-1 text-xs text-neutral-500 dark:text-neutral-300">
          Active Projects
        </div>
        <div class="text-2xl font-semibold text-neutral-900 dark:text-white">
          {executiveProjects.length}
        </div>
      </Card>
      <Card class="max-w-[200px]">
        <div class="mb-1 text-xs text-neutral-500 dark:text-neutral-300">
          Total Issues
        </div>
        <div class="text-2xl font-semibold text-neutral-900 dark:text-white">
          {executiveProjects.reduce((sum, p) => sum + p.totalIssues, 0)}
        </div>
      </Card>
      <Card class="max-w-[200px]">
        <div class="mb-1 text-xs text-neutral-500 dark:text-neutral-300">
          Overall Progress
        </div>
        <div class="text-2xl font-semibold text-neutral-900 dark:text-white">
          {Math.round(
            (executiveProjects.reduce((sum, p) => sum + p.completedIssues, 0) /
              Math.max(
                1,
                executiveProjects.reduce((sum, p) => sum + p.totalIssues, 0)
              )) *
              100
          )}%
        </div>
      </Card>
      <Card class="max-w-[200px]">
        <div class="mb-1 text-xs text-neutral-500 dark:text-neutral-300">
          Issues Completed (Last 2 Weeks)
        </div>
        <div class="text-2xl font-semibold text-neutral-900 dark:text-white">
          {executiveStats.totalCompleted}
        </div>
      </Card>
      <Card class="max-w-[200px]">
        <div class="mb-1 text-xs text-neutral-500 dark:text-neutral-300">
          Recent Velocity
        </div>
        <div class="text-2xl font-semibold text-neutral-900 dark:text-white">
          {executiveStats.recentVelocity.toFixed(1)}
        </div>
        <div class="text-xs text-neutral-600 dark:text-neutral-400">
          issues/week
        </div>
      </Card>
      <Card class="max-w-[200px]">
        <div class="mb-1 text-xs text-neutral-500 dark:text-neutral-300">
          Active Engineers
        </div>
        <div class="text-2xl font-semibold text-neutral-900 dark:text-white">
          {executiveStats.activeEngineers}
        </div>
      </Card>
    </div>
  {/if}

  <!-- Sticky controls wrapper -->
  <div
    class="sticky top-[60px] z-30 backdrop-blur-sm bg-white/95 dark:bg-neutral-950/95 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pt-1 -mt-1"
  >
    <!-- View controls -->
    <div
      class="flex flex-col gap-4 items-start py-2 sm:flex-row sm:items-center"
    >
      <!-- View type toggle -->
      <ToggleGroupRoot bind:value={viewType} variant="outline" type="single">
        <ToggleGroupItem value="card" aria-label="Card view">
          Card
        </ToggleGroupItem>
        <ToggleGroupItem value="table" aria-label="Table view">
          Table
        </ToggleGroupItem>
        <ToggleGroupItem value="gantt" aria-label="Gantt view">
          Gantt
        </ToggleGroupItem>
      </ToggleGroupRoot>

      <!-- End date mode toggle (only for Gantt view) -->
      {#if viewType === "gantt"}
        <ToggleGroupRoot
          bind:value={endDateMode}
          variant="outline"
          type="single"
        >
          <ToggleGroupItem
            value="predicted"
            aria-label="Use predicted end dates"
          >
            Predicted
          </ToggleGroupItem>
          <ToggleGroupItem value="target" aria-label="Use target end dates">
            Target
          </ToggleGroupItem>
        </ToggleGroupRoot>
      {/if}
    </div>
  </div>

  <!-- Main content -->
  {#if loading}
    <div class="space-y-4">
      <Card>
        <Skeleton class="mb-4 w-48 h-8" />
        <div class="space-y-3">
          <Skeleton class="w-full h-32" />
          <Skeleton class="w-full h-32" />
          <Skeleton class="w-full h-32" />
        </div>
      </Card>
    </div>
  {:else if error}
    <Card class="border-red-500/50">
      <div class="mb-3 text-sm font-medium text-red-600 dark:text-red-400">
        Error Loading Data
      </div>
      <p class="mb-3 text-neutral-700 dark:text-neutral-400">{error}</p>
      <p class="text-sm text-neutral-600 dark:text-neutral-500">
        Make sure the database is synced. Run: <code
          class="px-2 py-1 font-mono text-xs rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300"
          >bun run sync</code
        >
      </p>
      <p class="mt-2 text-sm text-neutral-500 dark:text-neutral-500">
        No Linear API key? Mock data will be generated automatically.
      </p>
    </Card>
  {:else if executiveProjects.length === 0}
    <Card>
      <div class="mb-3 text-sm font-medium text-neutral-900 dark:text-white">
        No Executive Projects Found
      </div>
      <p class="text-neutral-700 dark:text-neutral-400">
        No projects found with "Executive Visibility" label that are currently
        in progress.
      </p>
    </Card>
  {:else if viewType === "card"}
    <div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {#each projectsWithProgress as { project, recentProgress }}
        {@const healthDisplay = getHealthDisplay(project.projectHealth)}
        {@const teamsArray = Array.from(project.teams)}
        {@const engineersArray = Array.from(project.engineers)}

        <Card
          class="p-6 cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors"
          onclick={() => handleProjectClick(project)}
        >
          <!-- Project Header -->
          <div class="mb-4">
            <h3
              class="mb-1 text-lg font-semibold text-neutral-900 dark:text-white"
            >
              {project.projectName}
            </h3>
          </div>

          <!-- Progress Bar -->
          <div class="mb-4">
            <ProgressBar {project} />
          </div>

          <!-- Recent Progress (Last 2 Weeks) -->
          {#if recentProgress}
            <div class="mb-4">
              <div class="mb-1 text-xs text-neutral-500 dark:text-neutral-400">
                Progress (Last 2 Weeks)
              </div>
              <div class="flex gap-2 items-baseline">
                <span
                  class="text-xl font-semibold text-neutral-900 dark:text-white"
                >
                  {recentProgress.completed}
                </span>
                <span class="text-sm text-neutral-600 dark:text-neutral-400">
                  issues completed
                </span>
              </div>
            </div>
          {/if}

          <!-- Key Metrics Grid -->
          <div class="grid grid-cols-2 gap-3 mb-4">
            <!-- Velocity -->
            <div>
              <div class="mb-1 text-xs text-neutral-500 dark:text-neutral-400">
                Velocity
              </div>
              <div
                class="text-lg font-semibold text-neutral-900 dark:text-white"
              >
                {project.velocity.toFixed(1)}
              </div>
              <div class="text-xs text-neutral-600 dark:text-neutral-400">
                issues/week
              </div>
            </div>

            <!-- Health Status -->
            <div>
              <div class="mb-1 text-xs text-neutral-500 dark:text-neutral-400">
                Health
              </div>
              <div class="text-lg font-semibold {healthDisplay.colorClass}">
                {healthDisplay.text}
              </div>
            </div>

            <!-- Teams -->
            <div>
              <div class="mb-1 text-xs text-neutral-500 dark:text-neutral-400">
                Teams
              </div>
              <div
                class="text-lg font-semibold text-neutral-900 dark:text-white"
              >
                {teamsArray.length}
              </div>
            </div>

            <!-- Engineers -->
            <div>
              <div class="mb-1 text-xs text-neutral-500 dark:text-neutral-400">
                Engineers
              </div>
              <div
                class="text-lg font-semibold text-neutral-900 dark:text-white"
              >
                {engineersArray.length}
              </div>
            </div>
          </div>

          <!-- Timeline -->
          {#if project.estimatedEndDate}
            <div
              class="pt-4 border-t border-neutral-200 dark:border-neutral-800"
            >
              <div class="mb-1 text-xs text-neutral-500 dark:text-neutral-400">
                Estimated Completion
              </div>
              <div class="text-sm font-medium text-neutral-900 dark:text-white">
                {formatDateFull(project.estimatedEndDate)}
              </div>
            </div>
          {/if}
        </Card>
      {/each}
    </div>
  {:else if viewType === "table"}
    <ProjectsTable
      teams={executiveTeams}
      domains={executiveDomains}
      groupBy="team"
      hideWarnings={true}
    />
  {:else if viewType === "gantt"}
    <GanttChart
      teams={executiveTeams}
      domains={executiveDomains}
      groupBy="team"
      hideWarnings={true}
      {endDateMode}
    />
  {/if}
</div>

<!-- Project Detail Modal -->
{#if selectedProject}
  <ProjectDetailModal
    project={selectedProject}
    onclose={closeModal}
    hideWarnings={true}
  />
{/if}

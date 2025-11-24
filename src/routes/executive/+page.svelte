<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { databaseStore, projectsStore } from "$lib/stores/database";
  import { presentationMode } from "$lib/stores/presentation";
  import Card from "$lib/components/ui/card.svelte";
  import Skeleton from "$lib/components/ui/skeleton.svelte";
  import Badge from "$lib/components/ui/badge.svelte";
  import ProgressBar from "$lib/components/ProgressBar.svelte";
  import ProjectDetailModal from "$lib/components/ProjectDetailModal.svelte";
  import type { ProjectSummary } from "$lib/project-data";
  import type { Issue } from "../../db/schema";
  import {
    getRecentProgress,
    formatDateFull,
    getHealthDisplay,
  } from "$lib/utils/project-helpers";

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
    </div>
  {/if}

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
  {:else}
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

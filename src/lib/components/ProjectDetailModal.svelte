<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import type { ProjectSummary } from "../project-data";
  import Badge from "./ui/badge.svelte";
  import {
    formatDateFull,
    getProgressPercent,
    getCompletedPercent,
    getWIPPercent,
    getHealthDisplay,
  } from "$lib/utils/project-helpers";

  let {
    project,
    onclose,
  }: {
    project: ProjectSummary;
    onclose: () => void;
  } = $props();

  let projectUrl = $state<string | null>(null);

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      onclose();
    }
  }

  function handleBackdropClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (target.classList.contains("modal-backdrop")) {
      onclose();
    }
  }

  function handleBackdropKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const target = event.target as HTMLElement;
      if (target.classList.contains("modal-backdrop")) {
        onclose();
      }
    }
  }

  async function fetchProjectUrl() {
    if (!browser) return;
    try {
      const response = await fetch("/api/issues/with-projects");
      if (response.ok) {
        const data = await response.json();
        const projectIssue = data.issues?.find((issue: any) => issue.project_id === project.projectId);
        if (projectIssue?.url) {
          // Extract workspace from issue URL
          const workspaceMatch = projectIssue.url.match(/https:\/\/linear\.app\/([^\/]+)/);
          if (workspaceMatch) {
            const workspace = workspaceMatch[1];
            projectUrl = `https://linear.app/${workspace}/project/${project.projectId}`;
          }
        }
      }
    } catch (error) {
      // Silently fail - link just won't be available
    }
  }

  onMount(() => {
    document.addEventListener("keydown", handleKeydown);
    document.body.style.overflow = "hidden";
    fetchProjectUrl();
    return () => {
      document.removeEventListener("keydown", handleKeydown);
      document.body.style.overflow = "";
    };
  });
</script>

<div
  class="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/60"
  onclick={handleBackdropClick}
  onkeydown={handleBackdropKeydown}
  role="dialog"
  aria-modal="true"
  aria-labelledby="modal-title"
  tabindex="-1"
>
  <div
    class="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-md border shadow-2xl bg-neutral-900 border-white/10 shadow-black/50 m-4"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => e.stopPropagation()}
    role="document"
  >
    <div class="p-6">
      <!-- Header -->
      <div class="flex items-start justify-between mb-6">
        <div class="flex-1">
          <h2
            id="modal-title"
            class="text-lg font-medium text-white mb-2 flex items-center gap-2"
          >
            {project.projectName}
            {#if project.hasStatusMismatch || project.isStaleUpdate || project.missingLead}
              <span class="text-amber-500">⚠️</span>
            {/if}
          </h2>
          <div class="flex items-center gap-3">
            <div class="text-xs text-neutral-400">
              Project ID: {project.projectId}
            </div>
            {#if projectUrl}
              <a
                href={projectUrl}
                target="_blank"
                rel="noopener noreferrer"
                class="text-xs text-violet-400 hover:text-violet-300 transition-colors duration-150 underline"
              >
                Open in Linear →
              </a>
            {/if}
          </div>
        </div>
        <button
          class="text-neutral-400 hover:text-white transition-colors duration-150"
          onclick={onclose}
          aria-label="Close modal"
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

      <!-- Progress Section -->
      <div class="mb-6">
        <div class="flex items-center justify-between mb-2">
          <span class="text-sm font-medium text-neutral-300">Progress</span>
          <span class="text-sm text-neutral-400"
            >{getProgressPercent(project)}%</span
          >
        </div>
        {#if true}
          {@const completedPercent = getCompletedPercent(project)}
          {@const wipPercent = getWIPPercent(project)}
          <div class="space-y-1.5">
            <div class="flex items-center gap-2">
              <div
                class="flex-1 h-2 bg-neutral-200 dark:bg-neutral-800 rounded overflow-hidden relative"
              >
                {#if completedPercent > 0}
                  <div
                    class="h-full bg-violet-500 transition-colors duration-150 absolute left-0 top-0"
                    style={`width: ${completedPercent}%`}
                  ></div>
                {/if}
                {#if wipPercent > 0}
                  <div
                    class="h-full bg-amber-500 transition-colors duration-150 absolute top-0"
                    style={`width: ${wipPercent}%; left: ${completedPercent}%`}
                  ></div>
                {/if}
              </div>
            </div>
            <div class="flex items-center justify-between text-xs text-neutral-400">
              <span>
                {#if project.inProgressIssues > 0}
                  {project.inProgressIssues} in progress
                {:else}
                  <span class="text-neutral-500">0 in progress</span>
                {/if}
              </span>
              <span>{project.completedIssues}/{project.totalIssues}</span>
            </div>
          </div>
        {/if}
      </div>

      <!-- Dates Section -->
      <div class="grid grid-cols-2 gap-4 mb-6">
        <div>
          <div class="text-xs text-neutral-500 mb-1">Start Date</div>
          <div class="text-sm text-white">{formatDateFull(project.startDate)}</div>
        </div>
        <div>
          <div class="text-xs text-neutral-500 mb-1">Estimated End Date</div>
          <div class="text-sm text-white">
            {formatDateFull(project.estimatedEndDate)}
          </div>
        </div>
      </div>

      <!-- Status Flags -->
      {#if project.hasStatusMismatch || project.isStaleUpdate || project.missingLead}
        <div class="mb-6 p-3 rounded-md bg-amber-500/10 border border-amber-500/20">
          <div class="text-sm font-medium text-amber-400 mb-2">⚠️ Issues</div>
          <div class="space-y-1 text-xs text-amber-300">
            {#if project.hasStatusMismatch}
              <div>• Status Mismatch: Project status doesn't match active work</div>
            {/if}
            {#if project.isStaleUpdate}
              <div>• Stale Update: Project hasn't been updated in 7+ days</div>
            {/if}
            {#if project.missingLead}
              <div>• Missing Lead: No project lead assigned</div>
            {/if}
          </div>
        </div>
      {/if}

      <!-- Project Health -->
      <div class="mb-6">
        <div class="text-xs text-neutral-500 mb-1">Project Health</div>
        {#if true}
          {@const healthDisplay = getHealthDisplay(project.projectHealth)}
          <Badge variant={healthDisplay.variant} class={healthDisplay.colorClass}>
            {healthDisplay.text}
          </Badge>
        {/if}
      </div>

      <!-- Project State -->
      <div class="mb-6">
        <div class="text-xs text-neutral-500 mb-1">Project State</div>
        <div class="text-sm text-white">
          {project.projectState || "Not set"}
        </div>
        {#if project.projectUpdatedAt}
          <div class="text-xs text-neutral-500 mt-1">
            Last updated: {formatDateFull(project.projectUpdatedAt)}
          </div>
        {/if}
      </div>

      <!-- Teams -->
      <div class="mb-6">
        <div class="text-xs text-neutral-500 mb-2">Teams</div>
        <div class="flex flex-wrap gap-2">
          {#each Array.from(project.teams) as team}
            <Badge variant="outline">{team}</Badge>
          {/each}
        </div>
      </div>

      <!-- Lead -->
      <div class="mb-6">
        <div class="text-xs text-neutral-500 mb-1">Project Lead</div>
        <div class="text-sm text-white">
          {project.projectLeadName || "Not assigned"}
        </div>
      </div>

      <!-- Engineers -->
      <div class="mb-6">
        <div class="text-xs text-neutral-500 mb-2">
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

      <!-- Issue Breakdown by State -->
      <div class="mb-6">
        <div class="text-xs text-neutral-500 mb-2">Issues by State</div>
        <div class="space-y-1">
          {#each Array.from(project.issuesByState.entries()) as [state, count]}
            <div class="flex items-center justify-between text-sm">
              <span class="text-neutral-300">{state}</span>
              <span class="text-neutral-400">{count}</span>
            </div>
          {/each}
        </div>
      </div>

      <!-- Last Activity -->
      <div>
        <div class="text-xs text-neutral-500 mb-1">Last Activity</div>
        <div class="text-sm text-white">
          {formatDateFull(project.lastActivityDate)}
        </div>
      </div>
    </div>
  </div>
</div>


<script lang="ts">
  import { onMount } from "svelte";
  import type { ProjectSummary } from "../project-data";
  import Badge from "./ui/badge.svelte";
  import { cn } from "$lib/utils";

  let {
    project,
    onclose,
  }: {
    project: ProjectSummary;
    onclose: () => void;
  } = $props();

  function formatDate(date: Date | string | null): string {
    if (!date) return "N/A";
    const d = typeof date === "string" ? new Date(date) : date;
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function getProgressPercent(project: ProjectSummary): number {
    if (project.totalIssues === 0) return 0;
    return Math.round((project.completedIssues / project.totalIssues) * 100);
  }

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

  onMount(() => {
    document.addEventListener("keydown", handleKeydown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeydown);
      document.body.style.overflow = "";
    };
  });
</script>

<div
  class="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/60"
  onclick={handleBackdropClick}
  role="dialog"
  aria-modal="true"
  aria-labelledby="modal-title"
>
  <div
    class="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-md border shadow-2xl bg-neutral-900 border-white/10 shadow-black/50 m-4"
    onclick={(e) => e.stopPropagation()}
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
          <div class="text-xs text-neutral-400">
            Project ID: {project.projectId}
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
        <div class="h-2 w-full rounded-full bg-white/10 overflow-hidden">
          <div
            class="h-full bg-violet-500/50 dark:bg-violet-500/60 transition-all duration-300"
            style={`width: ${getProgressPercent(project)}%`}
          ></div>
        </div>
        <div class="flex gap-4 mt-2 text-xs text-neutral-400">
          <span>{project.completedIssues} completed</span>
          <span>{project.inProgressIssues} in progress</span>
          <span>{project.totalIssues} total</span>
        </div>
      </div>

      <!-- Dates Section -->
      <div class="grid grid-cols-2 gap-4 mb-6">
        <div>
          <div class="text-xs text-neutral-500 mb-1">Start Date</div>
          <div class="text-sm text-white">{formatDate(project.startDate)}</div>
        </div>
        <div>
          <div class="text-xs text-neutral-500 mb-1">Estimated End Date</div>
          <div class="text-sm text-white">
            {formatDate(project.estimatedEndDate)}
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

      <!-- Project State -->
      <div class="mb-6">
        <div class="text-xs text-neutral-500 mb-1">Project State</div>
        <div class="text-sm text-white">
          {project.projectState || "Not set"}
        </div>
        {#if project.projectUpdatedAt}
          <div class="text-xs text-neutral-500 mt-1">
            Last updated: {formatDate(project.projectUpdatedAt)}
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
          {formatDate(project.lastActivityDate)}
        </div>
      </div>
    </div>
  </div>
</div>


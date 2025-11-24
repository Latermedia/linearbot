<script lang="ts">
  import Badge from "$lib/components/ui/badge.svelte";
  import type { ProjectSummary } from "../project-data";
  import {
    formatDate,
    formatRelativeDate,
    getProgressPercent,
    getCompletedPercent,
    getWIPPercent,
    hasHealthIssues,
    getHealthDisplay,
    getBacklogCount,
  } from "$lib/utils/project-helpers";

  let {
    project,
    onmouseenter,
    onmousemove,
    onmouseleave,
    onclick,
  }: {
    project: ProjectSummary;
    onmouseenter?: (event: MouseEvent) => void;
    onmousemove?: (event: MouseEvent) => void;
    onmouseleave?: () => void;
    onclick?: () => void;
  } = $props();

  const completedPercent = $derived(getCompletedPercent(project));
  const wipPercent = $derived(getWIPPercent(project));
  const hasIssues = $derived(hasHealthIssues(project) || project.hasViolations);
  const healthDisplay = $derived(getHealthDisplay(project.projectHealth));
  const backlogCount = $derived(getBacklogCount(project));
</script>

<tr
  class="border-b border-neutral-200 dark:border-white/5 hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors duration-150 cursor-pointer"
  onmouseenter={onmouseenter}
  onmousemove={onmousemove}
  onmouseleave={onmouseleave}
  onclick={onclick}
  role="button"
  tabindex="0"
>
  <td class="py-3 px-2 w-[32px]">
    {#if hasIssues}
      <span class="text-amber-400 text-sm" title="Health check failed">⚠️</span>
    {/if}
  </td>
  <td class="py-3 px-2 w-[200px]">
    <div class="text-sm font-medium text-neutral-900 dark:text-white">
      {project.projectName || "Unknown"}
    </div>
    {#if project.projectLeadName}
      <div class="text-sm text-neutral-600 dark:text-neutral-400">
        Lead: {project.projectLeadName}
      </div>
    {/if}
  </td>
  <td class="py-3 px-2 w-[180px]">
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
      <div class="flex items-center justify-between text-xs text-neutral-600 dark:text-neutral-400">
        <span>
          {#if project.inProgressIssues > 0}
            {project.inProgressIssues} in progress
          {:else}
            <span class="text-neutral-400 dark:text-neutral-600">0 in progress</span>
          {/if}
        </span>
        <span>{project.completedIssues}/{project.totalIssues}</span>
      </div>
      {#if backlogCount > 0}
        <div class="text-xs text-neutral-500 dark:text-neutral-500">
          {backlogCount} in backlog
        </div>
      {/if}
    </div>
  </td>
  <td class="py-3 px-2 w-[100px]">
    {#if project.projectState}
      <Badge variant="outline" class="text-xs">
        {project.projectState}
      </Badge>
    {:else}
      <span class="text-sm text-neutral-400 dark:text-neutral-600">—</span>
    {/if}
  </td>
  <td class="py-3 px-2 w-[140px]">
    <Badge variant={healthDisplay.variant} class={healthDisplay.colorClass}>
      {healthDisplay.text}
    </Badge>
  </td>
  <td class="py-3 px-2 w-[100px]">
    <div class="text-sm text-neutral-700 dark:text-neutral-300">
      {project.engineerCount}
    </div>
    {#if project.teams.size > 1}
      <div class="text-xs text-neutral-500 dark:text-neutral-500 mt-0.5">
        {project.teams.size} teams
      </div>
    {/if}
  </td>
  <td class="py-3 px-2 w-[100px] text-sm text-neutral-600 dark:text-neutral-400">
    {formatDate(project.startDate)}
  </td>
  <td class="py-3 px-2 w-[100px] text-sm text-neutral-600 dark:text-neutral-400">
    {formatRelativeDate(project.lastActivityDate)}
  </td>
  <td class="py-3 px-2 w-[120px] text-sm text-neutral-600 dark:text-neutral-400">
    {formatDate(project.estimatedEndDate)}
  </td>
</tr>


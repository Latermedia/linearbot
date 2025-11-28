<script lang="ts">
  import Badge from "$lib/components/Badge.svelte";
  import ProgressBar from "./ProgressBar.svelte";
  import type { ProjectSummary } from "../project-data";
  import {
    formatDate,
    formatRelativeDate,
    hasHealthIssues,
    getHealthDisplay,
  } from "$lib/utils/project-helpers";

  let {
    project,
    hideWarnings = false,
    onmouseenter,
    onmousemove,
    onmouseleave,
    onclick,
  }: {
    project: ProjectSummary;
    hideWarnings?: boolean;
    onmouseenter?: (event: MouseEvent) => void;
    onmousemove?: (event: MouseEvent) => void;
    onmouseleave?: () => void;
    onclick?: () => void;
  } = $props();

  const hasIssues = $derived(hasHealthIssues(project) || project.hasViolations);
  const healthDisplay = $derived(getHealthDisplay(project.projectHealth));
</script>

<tr
  class="border-b border-neutral-200 dark:border-white/5 hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors duration-150 cursor-pointer"
  {onmouseenter}
  {onmousemove}
  {onmouseleave}
  {onclick}
  role="button"
  tabindex="0"
>
  <td class="py-3 px-2 w-[32px]">
    {#if !hideWarnings && hasIssues}
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
    <ProgressBar {project} percentageSize="text-[10px]" />
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
  <td
    class="py-3 px-2 w-[100px] text-sm text-neutral-600 dark:text-neutral-400"
  >
    {formatDate(project.startDate)}
  </td>
  <td
    class="py-3 px-2 w-[100px] text-sm text-neutral-600 dark:text-neutral-400"
  >
    {formatRelativeDate(project.lastActivityDate)}
  </td>
  <td
    class="py-3 px-2 w-[100px] text-sm text-neutral-600 dark:text-neutral-400"
    title="Linear's project target date"
  >
    {formatDate(project.targetDate)}
  </td>
  <td
    class="py-3 px-2 w-[100px] text-sm text-neutral-600 dark:text-neutral-400"
    title="Velocity-predicted completion date"
  >
    {formatDate(project.estimatedEndDate)}
  </td>
</tr>

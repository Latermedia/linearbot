<script lang="ts">
  import type { ProjectSummary } from "../project-data";
  import {
    getProgressPercent,
    getCompletedPercent,
    getWIPPercent,
  } from "../utils/project-helpers";

  let {
    project,
    percentageSize = "text-xs",
  }: {
    project: ProjectSummary;
    percentageSize?: string;
  } = $props();

  const progress = $derived(getProgressPercent(project));
  const completedPercent = $derived(getCompletedPercent(project));
  const wipPercent = $derived(getWIPPercent(project));
</script>

<div class="space-y-1">
  <!-- Percentage row -->
  <div class="flex justify-end">
    <span
      class="font-semibold text-neutral-700 dark:text-neutral-300 {percentageSize}"
    >
      {progress}%
    </span>
  </div>
  <!-- Progress bar row -->
  <div class="flex gap-2 items-center">
    <div
      class="overflow-hidden relative flex-1 h-2 rounded bg-neutral-200 dark:bg-neutral-800"
    >
      {#if completedPercent > 0}
        <div
          class="absolute top-0 left-0 h-full bg-violet-500 transition-colors duration-150"
          style={`width: ${completedPercent}%`}
        ></div>
      {/if}
      {#if wipPercent > 0}
        <div
          class="absolute top-0 h-full bg-amber-500 transition-colors duration-150"
          style={`width: ${wipPercent}%; left: ${completedPercent}%`}
        ></div>
      {/if}
    </div>
  </div>
  <!-- Status row -->
  <div
    class="flex justify-between items-center text-xs text-neutral-600 dark:text-neutral-400"
  >
    <span>
      {#if project.inProgressIssues > 0}
        {project.inProgressIssues} in progress
      {:else}
        <span class="text-neutral-400 dark:text-neutral-600">0 in progress</span
        >
      {/if}
    </span>
    <span class="font-medium"
      >{project.completedIssues}/{project.totalIssues}</span
    >
  </div>
</div>

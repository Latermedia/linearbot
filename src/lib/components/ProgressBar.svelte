<script lang="ts">
  import type { ProjectSummary } from "../project-data";
  import { getCompletedPercent, getWIPPercent } from "../utils/project-helpers";

  let {
    project,
  }: {
    project: ProjectSummary;
  } = $props();

  const completedPercent = $derived(getCompletedPercent(project));
  const wipPercent = $derived(getWIPPercent(project));
</script>

<div class="space-y-1">
  <!-- Progress bar row -->
  <div class="flex gap-2 items-center">
    <div
      class="overflow-hidden relative flex-1 h-2 rounded bg-black-200 dark:bg-black-800"
    >
      {#if completedPercent > 0}
        <div
          class="absolute top-0 left-0 h-full transition-colors duration-150 bg-brand-400/60 dark:bg-brand-400/50"
          style={`width: ${completedPercent}%`}
        ></div>
      {/if}
      {#if wipPercent > 0}
        <div
          class="absolute top-0 h-full bg-brand-500/20 dark:bg-brand-400/20"
          style={`width: ${wipPercent}%; left: ${completedPercent}%`}
        ></div>
      {/if}
    </div>
  </div>
  <!-- Status row -->
  <div
    class="flex justify-between items-center text-xs text-black-600 dark:text-black-400"
  >
    <span>
      {#if project.inProgressIssues > 0}
        {project.inProgressIssues} in progress
      {:else}
        <span class="text-black-400 dark:text-black-600">0 in progress</span>
      {/if}
    </span>
    <span class="font-medium"
      >{project.completedIssues}/{project.totalIssues}</span
    >
  </div>
</div>

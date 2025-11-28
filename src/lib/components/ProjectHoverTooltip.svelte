<script lang="ts">
  import type { ProjectSummary } from "../project-data";
  import ProgressBar from "./ProgressBar.svelte";
  import { getHealthDisplay, formatDateFull } from "../utils/project-helpers";

  let {
    project,
    hideWarnings = false,
    position,
  }: {
    project: ProjectSummary;
    hideWarnings?: boolean;
    position: { x: number; y: number };
  } = $props();

  const healthDisplay = $derived(getHealthDisplay(project.projectHealth));
  const teamsArray = $derived(Array.from(project.teams));
  const engineersArray = $derived(Array.from(project.engineers));

  // Collect warning counts
  const warnings = $derived.by(() => {
    if (hideWarnings) return [];

    const warningList: { label: string; count: number }[] = [];

    // Issue-level violations
    if (project.missingEstimateCount > 0) {
      warningList.push({
        label: "Missing points",
        count: project.missingEstimateCount,
      });
    }
    if (project.missingPriorityCount > 0) {
      warningList.push({
        label: "Missing priority",
        count: project.missingPriorityCount,
      });
    }
    if (project.noRecentCommentCount > 0) {
      warningList.push({
        label: "No recent comment",
        count: project.noRecentCommentCount,
      });
    }
    if (project.wipAgeViolationCount > 0) {
      warningList.push({
        label: "WIP age violation",
        count: project.wipAgeViolationCount,
      });
    }
    if (project.missingDescriptionCount > 0) {
      warningList.push({
        label: "Missing description",
        count: project.missingDescriptionCount,
      });
    }

    // Project-level violations
    if (project.missingLead) {
      warningList.push({ label: "Missing project lead", count: 1 });
    }
    if (project.isStaleUpdate) {
      warningList.push({ label: "Missing project update (7+ days)", count: 1 });
    }
    if (project.hasStatusMismatch) {
      warningList.push({ label: "Status mismatch", count: 1 });
    }
    if (project.missingHealth) {
      warningList.push({ label: "Missing project health", count: 1 });
    }

    return warningList;
  });
</script>

<div
  class="fixed z-50 px-4 py-3 text-xs rounded-lg border shadow-lg pointer-events-none bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 max-w-[280px]"
  style={`left: ${position.x + 10}px; top: ${position.y + 10}px;`}
>
  <!-- Project Header -->
  <div class="mb-3">
    <h3 class="text-sm font-semibold text-neutral-900 dark:text-white">
      {project.projectName}
    </h3>
  </div>

  <!-- Progress Bar -->
  <div class="mb-3">
    <ProgressBar {project} percentageSize="text-[10px]" />
  </div>

  <!-- Key Metrics Grid -->
  <div class="grid grid-cols-2 gap-2 mb-3">
    <!-- Velocity -->
    <div>
      <div class="mb-0.5 text-[10px] text-neutral-500 dark:text-neutral-400">
        Velocity
      </div>
      <div class="text-sm font-semibold text-neutral-900 dark:text-white">
        {project.velocity.toFixed(1)}
      </div>
      <div class="text-[10px] text-neutral-600 dark:text-neutral-400">
        issues/week
      </div>
    </div>

    <!-- Health Status -->
    <div>
      <div class="mb-0.5 text-[10px] text-neutral-500 dark:text-neutral-400">
        Health
      </div>
      <div class="text-sm font-semibold {healthDisplay.colorClass}">
        {healthDisplay.text}
      </div>
    </div>

    <!-- Teams -->
    <div>
      <div class="mb-0.5 text-[10px] text-neutral-500 dark:text-neutral-400">
        Teams
      </div>
      <div class="text-sm font-semibold text-neutral-900 dark:text-white">
        {teamsArray.length}
      </div>
    </div>

    <!-- Engineers -->
    <div>
      <div class="mb-0.5 text-[10px] text-neutral-500 dark:text-neutral-400">
        Engineers
      </div>
      <div class="text-sm font-semibold text-neutral-900 dark:text-white">
        {engineersArray.length}
      </div>
    </div>
  </div>

  <!-- Estimated Completion -->
  {#if project.estimatedEndDate}
    <div class="pt-2 mb-3 border-t border-neutral-200 dark:border-neutral-800">
      <div class="mb-0.5 text-[10px] text-neutral-500 dark:text-neutral-400">
        Estimated Completion
      </div>
      <div class="text-xs font-medium text-neutral-900 dark:text-white">
        {formatDateFull(project.estimatedEndDate)}
      </div>
    </div>
  {/if}

  <!-- Warnings -->
  {#if warnings.length > 0}
    <div class="pt-2 border-t border-neutral-200 dark:border-neutral-800">
      <div
        class="mb-1.5 text-[10px] font-medium text-neutral-500 dark:text-neutral-400"
      >
        Warnings
      </div>
      <div class="space-y-1">
        {#each warnings as warning}
          <div
            class="flex gap-1.5 items-center text-xs text-neutral-700 dark:text-neutral-300"
          >
            <span class="text-amber-400 shrink-0">⚠️</span>
            <span class="flex-1">{warning.label}: {warning.count}</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

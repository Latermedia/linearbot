<script lang="ts">
  import Badge from "$lib/components/Badge.svelte";
  import ProgressBar from "./ProgressBar.svelte";
  import UserProfile from "./UserProfile.svelte";
  import type { ProjectSummary } from "../project-data";
  import {
    getHealthDisplay,
    isHealthUpdateOverdue,
    getDaysSinceHealthUpdate,
  } from "$lib/utils/project-helpers";
  import {
    getGapsCountStatus,
    getStatusTextColor,
  } from "$lib/utils/status-colors";

  /** Effective health data from metrics snapshot */
  export interface ProjectHealthData {
    effectiveHealth: string;
    healthSource: "human" | "velocity";
    linearHealth: string | null;
    calculatedHealth: string;
  }

  let {
    project,
    projectHealth,
    onclick,
  }: {
    project: ProjectSummary;
    /** Calculated health from metrics (effectiveHealth based on self-reported or trajectory) */
    projectHealth?: ProjectHealthData;
    onclick?: () => void;
  } = $props();

  // Self-reported health display (for Update column)
  const selfReportedHealthDisplay = $derived(
    getHealthDisplay(project.projectHealth)
  );
  const updateOverdue = $derived(isHealthUpdateOverdue(project));
  const daysSinceUpdate = $derived(getDaysSinceHealthUpdate(project));

  // Effective health display (for Health column)
  const effectiveHealthDisplay = $derived.by(() => {
    if (!projectHealth) {
      // Fallback to self-reported if no metrics data
      return getHealthDisplay(project.projectHealth);
    }
    return getHealthDisplay(projectHealth.effectiveHealth);
  });

  // Source indicator (Self-reported or Trajectory)
  const healthSourceLabel = $derived.by(() => {
    if (!projectHealth) return null;
    return projectHealth.healthSource === "human" ? "Self" : "Trajectory";
  });

  // Calculate total violations (project-level + issue-level)
  const totalViolations = $derived.by(() => {
    let count = 0;
    // Project-level violations
    if (project.missingLead) count++;
    if (project.isStaleUpdate) count++;
    if (project.hasStatusMismatch) count++;
    if (project.missingHealth) count++;
    if (project.hasDateDiscrepancy) count++;
    // Issue-level violations
    count += project.missingEstimateCount || 0;
    count += project.missingPriorityCount || 0;
    count += project.noRecentCommentCount || 0;
    count += project.wipAgeViolationCount || 0;
    return count;
  });

  const gapsColorClass = $derived(
    getStatusTextColor(getGapsCountStatus(totalViolations))
  );
</script>

<tr
  class="border-b transition-colors duration-150 cursor-pointer border-neutral-200 dark:border-white/5 hover:bg-neutral-50 dark:hover:bg-white/5"
  {onclick}
  role="button"
  tabindex="0"
>
  <td class="py-3 px-2 w-[200px]">
    <div class="text-sm font-medium text-neutral-900 dark:text-white">
      {project.projectName || "Unknown"}
    </div>
    <div class="mt-1">
      {#if project.projectLeadName}
        <UserProfile
          name={project.projectLeadName}
          avatarUrl={project.projectLeadAvatarUrl}
          size="xs"
        />
      {:else}
        <span
          class="flex gap-1 items-center text-xs text-amber-400"
          title="Missing project lead"
        >
          ⚠️ missing lead
        </span>
      {/if}
    </div>
  </td>
  <td class="py-3 px-2 w-[180px]">
    <ProgressBar {project} />
  </td>
  <td class="py-3 px-2 w-[100px]">
    <div class="flex flex-wrap gap-y-1 gap-x-2 items-center">
      {#if project.projectStatus || project.projectStateCategory}
        <Badge variant="outline" class="text-xs">
          {project.projectStatus || project.projectStateCategory}
        </Badge>
      {:else}
        <span class="text-sm text-neutral-400 dark:text-neutral-600">—</span>
      {/if}
      {#if project.hasStatusMismatch}
        <span
          class="flex gap-1 items-center text-xs whitespace-nowrap text-neutral-500 dark:text-neutral-400"
          title="Project status doesn't match issue progress"
        >
          ⚠️ mismatch
        </span>
      {/if}
    </div>
  </td>
  <td class="py-3 px-2 w-[100px]">
    <div class="flex flex-col gap-0.5">
      <Badge
        variant={effectiveHealthDisplay.variant}
        class={effectiveHealthDisplay.colorClass}
      >
        {effectiveHealthDisplay.text}
      </Badge>
      {#if healthSourceLabel}
        <span class="text-[10px] text-neutral-500 dark:text-neutral-500">
          {healthSourceLabel}
        </span>
      {/if}
    </div>
  </td>
  <td class="py-3 px-2 w-[120px]">
    <div class="flex flex-wrap gap-y-1 gap-x-2 items-center">
      <Badge
        variant={selfReportedHealthDisplay.variant}
        class={selfReportedHealthDisplay.colorClass}
      >
        {selfReportedHealthDisplay.text}
      </Badge>
      {#if updateOverdue}
        <span
          class="flex gap-1 items-center text-xs whitespace-nowrap text-neutral-500 dark:text-neutral-400"
          title={daysSinceUpdate !== null
            ? `Last update ${daysSinceUpdate} days ago`
            : "No health updates found"}
        >
          ⚠️ {daysSinceUpdate !== null ? `${daysSinceUpdate}d` : "none"}
        </span>
      {/if}
    </div>
  </td>
  <td class="py-3 px-2 w-[80px]">
    <span class="text-sm font-medium {gapsColorClass}">
      {totalViolations}
    </span>
  </td>
</tr>

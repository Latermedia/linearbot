<script lang="ts">
  import { cn } from "$lib/utils";
  import type { ProjectSummary } from "../project-data";
  import {
    getProgressPercent,
    hasDiscrepancies,
  } from "$lib/utils/project-helpers";

  let {
    project,
    position,
    hideWarnings = false,
    endDateMode = "predicted",
    targetDatePercent = null,
    onmouseenter,
    onmousemove,
    onmouseleave,
    onclick,
  }: {
    project: ProjectSummary;
    position: {
      startPercent: number;
      widthPercent: number;
      extendsBefore: boolean;
      extendsAfter: boolean;
    };
    hideWarnings?: boolean;
    endDateMode?: "predicted" | "target";
    targetDatePercent?: number | null;
    onmouseenter?: (event: MouseEvent) => void;
    onmousemove?: (event: MouseEvent) => void;
    onmouseleave?: () => void;
    onclick?: () => void;
  } = $props();

  // Show target marker when in predicted mode and target date exists
  // Calculate position relative to the bar (as percentage of bar width)
  const showTargetMarker = $derived(
    endDateMode === "predicted" &&
      targetDatePercent !== null &&
      project.targetDate
  );

  // Calculate where the target marker should appear relative to the bar
  const targetMarkerRelativePercent = $derived.by(() => {
    if (!showTargetMarker || targetDatePercent === null) return null;
    // Convert absolute percentage to relative position within the bar
    const barStart = position.startPercent;
    const barEnd = position.startPercent + position.widthPercent;

    // Only show if target is within or near the bar
    if (targetDatePercent < barStart - 5 || targetDatePercent > barEnd + 5)
      return null;

    // Calculate as percentage of bar width
    const relativePercent =
      ((targetDatePercent - barStart) / position.widthPercent) * 100;
    return Math.max(0, Math.min(100, relativePercent));
  });

  const progress = $derived(getProgressPercent(project));
  const hasWarnings = $derived(
    hasDiscrepancies(project) || project.hasViolations
  );

  // Generate mask-image CSS for fade effect when extending beyond range
  const maskStyle = $derived(() => {
    if (position.extendsBefore && position.extendsAfter) {
      return "mask-image: linear-gradient(to right, transparent 0px, black 24px, black calc(100% - 24px), transparent 100%); -webkit-mask-image: linear-gradient(to right, transparent 0px, black 24px, black calc(100% - 24px), transparent 100%);";
    }
    if (position.extendsBefore && !position.extendsAfter) {
      return "mask-image: linear-gradient(to right, transparent 0px, black 24px); -webkit-mask-image: linear-gradient(to right, transparent 0px, black 24px);";
    }
    if (!position.extendsBefore && position.extendsAfter) {
      return "mask-image: linear-gradient(to left, transparent 0px, black 24px); -webkit-mask-image: linear-gradient(to left, transparent 0px, black 24px);";
    }
    return "";
  });
</script>

<div class="relative h-12">
  <div
    class={cn(
      "absolute h-10 rounded-md flex items-center px-6 cursor-pointer transition-all duration-150",
      "bg-black-600 dark:bg-black-700 text-white text-xs font-medium overflow-hidden",
      "hover:bg-black-500 dark:hover:bg-black-600 hover:shadow-sm"
    )}
    style={`
      left: ${position.startPercent}%; 
      width: ${position.widthPercent}%;
      ${maskStyle()}
    `}
    {onmouseenter}
    {onmousemove}
    {onmouseleave}
    {onclick}
    onkeydown={(e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onclick?.();
      }
    }}
    role="button"
    tabindex="0"
  >
    <!-- Progress fill background -->
    <div
      class="absolute inset-0 rounded-md bg-brand-500/40 dark:bg-brand-500/50"
      style={`width: ${progress}%;`}
    ></div>
    <!-- Target date marker (shows when in predicted mode) -->
    {#if showTargetMarker && targetMarkerRelativePercent !== null}
      <div
        class="absolute top-0 bottom-0 z-20 flex flex-col items-center justify-center"
        style={`left: ${targetMarkerRelativePercent}%;`}
        title={`Target: ${new Date(project.targetDate!).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
      >
        <!-- Vertical line -->
        <div class="w-0.5 h-full bg-warning-400/80"></div>
        <!-- Diamond marker at top -->
        <div
          class="absolute -top-1 w-2.5 h-2.5 bg-warning-400 rotate-45 border border-warning-500"
        ></div>
      </div>
    {/if}
    <!-- Project name overlay -->
    <span class="flex relative z-10 gap-1.5 items-center truncate">
      {#if !hideWarnings && hasWarnings}
        <span class="text-sm text-warning-400 shrink-0">⚠️</span>
      {/if}
      {project.projectName}
    </span>
  </div>
</div>

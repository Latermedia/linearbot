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
    onmouseenter?: (event: MouseEvent) => void;
    onmousemove?: (event: MouseEvent) => void;
    onmouseleave?: () => void;
    onclick?: () => void;
  } = $props();

  const progress = $derived(getProgressPercent(project));
  const hasWarnings = $derived(hasDiscrepancies(project));

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
      "bg-neutral-600 dark:bg-neutral-700 text-white text-xs font-medium overflow-hidden",
      "hover:bg-neutral-500 dark:hover:bg-neutral-600 hover:shadow-sm"
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
      class="absolute inset-0 rounded-md bg-violet-500/40 dark:bg-violet-500/50"
      style={`width: ${progress}%;`}
    ></div>
    <!-- Project name overlay -->
    <span class="flex relative z-10 gap-1.5 items-center truncate">
      {#if hasWarnings}
        <span class="text-sm text-amber-400 shrink-0">⚠️</span>
      {/if}
      {project.projectName}
    </span>
  </div>
</div>

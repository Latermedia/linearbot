<script lang="ts">
  import { browser } from "$app/environment";
  import html2canvas from "html2canvas";
  import Modal from "./Modal.svelte";
  import Button from "./Button.svelte";
  import Badge from "./Badge.svelte";
  import { cn } from "$lib/utils";
  import type {
    ProjectSummary,
    TeamSummary,
    DomainSummary,
  } from "../project-data";
  import { X, Copy, Loader2 } from "lucide-svelte";
  import {
    getProgressPercent,
    hasDiscrepancies,
  } from "$lib/utils/project-helpers";

  let {
    team,
    domain,
    groupBy,
    onclose,
  }: {
    team?: TeamSummary;
    domain?: DomainSummary;
    groupBy: "team" | "domain";
    onclose: () => void;
  } = $props();

  let previewContainer: HTMLDivElement | undefined = $state();
  let isCopying = $state(false);
  let copyStatus: "idle" | "success" | "error" = $state("idle");
  let copyMessage = $state("");
  let showTodayIndicator = $state(false);
  let showWarnings = $state(false);
  let endDateMode = $state<"predicted" | "target">("predicted");

  // Calculate current quarter start date (same as GanttChart)
  function getQuarterStart(): Date {
    const now = new Date();
    const currentMonth = now.getMonth();
    const quarterStartMonth = Math.floor(currentMonth / 3) * 3;
    const quarterStart = new Date(now.getFullYear(), quarterStartMonth, 1);
    quarterStart.setHours(0, 0, 0, 0);
    return quarterStart;
  }

  // Generate 90 days starting from quarter start
  function generateDays() {
    const days: Date[] = [];
    const quarterStart = getQuarterStart();

    for (let i = 0; i < 90; i++) {
      const day = new Date(quarterStart);
      day.setDate(quarterStart.getDate() + i);
      days.push(day);
    }

    return days;
  }

  const days = generateDays();
  const quarterStart = getQuarterStart();

  // Get month labels with positions (same as GanttChart)
  function getMonthLabels(): {
    month: string;
    startDate: Date;
    startPercent: number;
    endPercent: number;
  }[] {
    const months: {
      month: string;
      startDate: Date;
      startPercent: number;
      endPercent: number;
    }[] = [];
    const seenMonths = new Set<string>();

    const monthStarts: { date: Date; index: number }[] = [];
    const firstDay = days[0];
    const lastDay = days[days.length - 1];

    let currentMonth = new Date(firstDay.getFullYear(), firstDay.getMonth(), 1);

    while (currentMonth <= lastDay) {
      const monthKey = `${currentMonth.getFullYear()}-${currentMonth.getMonth()}`;

      if (!seenMonths.has(monthKey)) {
        seenMonths.add(monthKey);

        let index = days.findIndex(
          (d) =>
            d.getFullYear() === currentMonth.getFullYear() &&
            d.getMonth() === currentMonth.getMonth() &&
            d.getDate() === 1
        );

        if (index === -1 && currentMonth < firstDay) {
          index = 0;
        }

        if (index >= 0 || currentMonth >= firstDay) {
          monthStarts.push({
            date: new Date(currentMonth),
            index: index >= 0 ? index : 0,
          });
        }
      }

      currentMonth = new Date(
        currentMonth.getFullYear(),
        currentMonth.getMonth() + 1,
        1
      );
    }

    monthStarts.sort((a, b) => a.index - b.index);

    for (let i = 0; i < monthStarts.length; i++) {
      const monthStart = monthStarts[i];
      const nextMonthStart = monthStarts[i + 1];

      const startPercent = (monthStart.index / 90) * 100;
      const endPercent = nextMonthStart
        ? (nextMonthStart.index / 90) * 100
        : 100;

      months.push({
        month: monthStart.date.toLocaleDateString("en-US", { month: "short" }),
        startDate: monthStart.date,
        startPercent: startPercent,
        endPercent: endPercent,
      });
    }

    return months;
  }

  const monthLabels = getMonthLabels();

  function getProjectPosition(project: ProjectSummary): {
    startCol: number;
    endCol: number;
    width: number;
    startPercent: number;
    widthPercent: number;
    extendsBefore: boolean;
    extendsAfter: boolean;
  } {
    const startDate = project.startDate
      ? new Date(project.startDate)
      : quarterStart;

    // Choose end date based on mode: target date or velocity-predicted date
    const selectedEndDate =
      endDateMode === "target" && project.targetDate
        ? project.targetDate
        : project.estimatedEndDate;

    const endDate = selectedEndDate
      ? new Date(selectedEndDate)
      : new Date(quarterStart.getTime() + 90 * 24 * 60 * 60 * 1000);

    const startDays =
      Math.floor(
        (startDate.getTime() - quarterStart.getTime()) / (1000 * 60 * 60 * 24)
      ) || 0;
    const endDays = Math.floor(
      (endDate.getTime() - quarterStart.getTime()) / (1000 * 60 * 60 * 24)
    );

    const extendsBefore = startDays < 0;
    const extendsAfter = endDays > 89;

    const clampedStart = Math.max(0, Math.min(startDays, 89));
    const clampedEnd = Math.max(0, Math.min(endDays, 89));

    const startCol = clampedStart;
    const endCol = clampedEnd;
    const width = Math.max(1, endCol - startCol + 1);

    const startPercent = (clampedStart / 90) * 100;
    const widthPercent = (width / 90) * 100;

    return {
      startCol,
      endCol,
      width,
      startPercent,
      widthPercent,
      extendsBefore,
      extendsAfter,
    };
  }

  // Calculate target date position as percentage (for showing marker in predicted mode)
  function getTargetDatePercent(project: ProjectSummary): number | null {
    if (!project.targetDate) return null;

    const targetDate = new Date(project.targetDate);
    const targetDays = Math.floor(
      (targetDate.getTime() - quarterStart.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Clamp to visible range
    const clampedTarget = Math.max(0, Math.min(targetDays, 89));
    return (clampedTarget / 90) * 100;
  }

  // Calculate target marker position relative to bar (as percentage of bar width)
  function getTargetMarkerRelativePercent(
    project: ProjectSummary,
    position: { startPercent: number; widthPercent: number }
  ): number | null {
    if (endDateMode !== "predicted" || !project.targetDate) return null;

    const targetDatePercent = getTargetDatePercent(project);
    if (targetDatePercent === null) return null;

    const barStart = position.startPercent;
    const barEnd = position.startPercent + position.widthPercent;

    // Only show if target is within or near the bar
    if (targetDatePercent < barStart - 5 || targetDatePercent > barEnd + 5)
      return null;

    // Calculate as percentage of bar width
    const relativePercent =
      ((targetDatePercent - barStart) / position.widthPercent) * 100;
    return Math.max(0, Math.min(100, relativePercent));
  }

  function getCurrentDayPosition(): number | null {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    if (now < quarterStart || now > days[days.length - 1]) {
      return null;
    }

    const dayIndex = days.findIndex((d) => d.getTime() === now.getTime());

    if (dayIndex === -1) return null;

    return (dayIndex / 90) * 100;
  }

  const currentDayPercent = getCurrentDayPosition();
  const displayName = groupBy === "team" ? team?.teamName : domain?.domainName;
  const projects =
    groupBy === "team" ? team?.projects || [] : domain?.projects || [];

  async function copyToPNG() {
    if (!browser || !previewContainer || isCopying) return;

    // Check for Clipboard API support
    if (!navigator.clipboard || !window.ClipboardItem) {
      copyStatus = "error";
      copyMessage = "Clipboard API not supported in this browser";
      setTimeout(() => {
        copyStatus = "idle";
        copyMessage = "";
      }, 3000);
      return;
    }

    isCopying = true;
    copyStatus = "idle";
    copyMessage = "";

    try {
      // Wait a bit for any pending renders
      await new Promise((resolve) => setTimeout(resolve, 100));

      const canvas = await html2canvas(previewContainer, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
        logging: false,
        allowTaint: false,
      });

      canvas.toBlob(async (blob) => {
        if (!blob) {
          throw new Error("Failed to create image blob");
        }

        try {
          await navigator.clipboard.write([
            new ClipboardItem({
              "image/png": blob,
            }),
          ]);

          copyStatus = "success";
          copyMessage = "Copied to clipboard!";
          setTimeout(() => {
            copyStatus = "idle";
            copyMessage = "";
          }, 3000);
        } finally {
          isCopying = false;
        }
      }, "image/png");
    } catch (error) {
      console.error("Failed to copy image:", error);
      copyStatus = "error";
      copyMessage =
        error instanceof Error ? error.message : "Failed to copy image";
      setTimeout(() => {
        copyStatus = "idle";
        copyMessage = "";
      }, 3000);
      isCopying = false;
    }
  }
</script>

<Modal
  {onclose}
  size="full"
  maxHeight="100vh"
  scrollable={true}
  background="bg-white dark:bg-neutral-900"
  header={headerSnippet}
  children={childrenSnippet}
>
  {#snippet headerSnippet()}
    <div
      class="flex justify-between items-center p-6 border-b border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-900"
    >
      <div class="flex-1">
        <h2
          id="modal-title"
          class="mb-1 text-xl font-semibold text-neutral-900 dark:text-white"
        >
          Export: {displayName}
        </h2>
        <div class="text-sm text-neutral-600 dark:text-neutral-400">
          {projects.length}
          {projects.length === 1 ? "project" : "projects"}
        </div>
      </div>

      <!-- Export Controls -->
      <div class="flex gap-4 items-center mr-4">
        <div class="flex gap-2 items-center">
          <span class="text-sm text-neutral-600 dark:text-neutral-400">
            End date:
          </span>
          <select
            bind:value={endDateMode}
            class="px-2 py-1 text-sm rounded border bg-white dark:bg-neutral-800 border-neutral-300 dark:border-white/20 text-neutral-700 dark:text-neutral-300 focus:ring-violet-500 focus:ring-2 focus:outline-none"
          >
            <option value="predicted">Predicted</option>
            <option value="target">Target</option>
          </select>
        </div>
        <label class="flex gap-2 items-center cursor-pointer">
          <input
            type="checkbox"
            bind:checked={showTodayIndicator}
            class="w-4 h-4 text-violet-600 rounded border-neutral-300 dark:border-white/20 focus:ring-violet-500 focus:ring-2 dark:bg-neutral-800 dark:checked:bg-violet-600"
          />
          <span class="text-sm text-neutral-700 dark:text-neutral-300">
            Show today
          </span>
        </label>
        <label class="flex gap-2 items-center cursor-pointer">
          <input
            type="checkbox"
            bind:checked={showWarnings}
            class="w-4 h-4 text-violet-600 rounded border-neutral-300 dark:border-white/20 focus:ring-violet-500 focus:ring-2 dark:bg-neutral-800 dark:checked:bg-violet-600"
          />
          <span class="text-sm text-neutral-700 dark:text-neutral-300">
            Show warnings
          </span>
        </label>
      </div>

      <button
        class="inline-flex justify-center items-center p-1.5 rounded transition-colors duration-150 cursor-pointer text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-white/10 dark:hover:bg-white/10"
        onclick={onclose}
        aria-label="Close modal"
      >
        <X class="w-5 h-5" />
      </button>
    </div>
  {/snippet}

  {#snippet childrenSnippet()}
    <!-- Preview Area -->
    <div class="overflow-auto flex-1 p-6 bg-neutral-50 dark:bg-neutral-950">
      <div
        bind:this={previewContainer}
        data-export-preview
        style="background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 0.375rem; padding: 1.5rem; box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);"
      >
        <!-- Timeline header -->
        <div style="margin-bottom: 1.5rem;">
          <div style="position: relative; height: 2rem;">
            <!-- Month labels -->
            <div style="position: absolute; inset: 0;">
              {#each monthLabels as month}
                <div
                  style="display: flex; position: absolute; top: 0; bottom: 0; align-items: center; font-size: 0.75rem; font-weight: 500; color: #525252; left: {month.startPercent}%; width: {month.endPercent -
                    month.startPercent}%;"
                >
                  <div style="padding: 0 0.5rem;">{month.month}</div>
                </div>
              {/each}
            </div>
            <!-- Month start markers -->
            <div style="position: absolute; inset: 0;">
              {#each monthLabels as month}
                <div
                  style="position: absolute; top: 0; bottom: 0; width: 1px; background-color: #d4d4d4; left: {month.startPercent}%;"
                ></div>
              {/each}
            </div>
            <!-- Current day indicator -->
            {#if showTodayIndicator && currentDayPercent !== null}
              <div
                style="position: absolute; top: 0; bottom: 0; z-index: 20; width: 2px; background-color: #8b5cf6; left: {currentDayPercent}%;"
              >
                <div
                  style="position: absolute; top: -4px; left: 50%; width: 8px; height: 8px; background-color: #8b5cf6; border-radius: 50%; transform: translateX(-50%);"
                ></div>
              </div>
            {/if}
          </div>
        </div>

        <!-- Projects -->
        <div style="display: flex; flex-direction: column; gap: 0.375rem;">
          {#if groupBy === "team" && team}
            <h3
              style="margin-bottom: 0.75rem; font-size: 1.125rem; font-weight: 500; color: #171717;"
            >
              {team.teamName}
            </h3>
          {:else if domain}
            <h3
              style="display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.75rem; font-size: 1.125rem; font-weight: 500; color: #171717;"
            >
              {domain.domainName}
              <Badge variant="outline">{domain.projects.length} projects</Badge>
            </h3>
          {/if}

          {#each projects as project}
            {@const position = getProjectPosition(project)}
            {@const progress = getProgressPercent(project)}
            {@const hasWarnings =
              showWarnings &&
              (hasDiscrepancies(project) || project.hasViolations)}
            {@const targetMarkerPercent = getTargetMarkerRelativePercent(
              project,
              position
            )}

            <!-- Timeline bar -->
            <div style="position: relative; height: 3rem;">
              <div
                style="position: absolute; height: 2.5rem; border-radius: 0.375rem; display: flex; align-items: center; padding: 0 1.5rem; font-size: 0.75rem; font-weight: 500; overflow: hidden; background-color: #525252; color: #ffffff; left: {position.startPercent}%; width: {position.widthPercent}%; ${position.extendsBefore &&
                position.extendsAfter
                  ? 'mask-image: linear-gradient(to right, transparent 0px, black 24px, black calc(100% - 24px), transparent 100%); -webkit-mask-image: linear-gradient(to right, transparent 0px, black 24px, black calc(100% - 24px), transparent 100%);'
                  : ''} ${position.extendsBefore && !position.extendsAfter
                  ? 'mask-image: linear-gradient(to right, transparent 0px, black 24px); -webkit-mask-image: linear-gradient(to right, transparent 0px, black 24px);'
                  : ''} ${!position.extendsBefore && position.extendsAfter
                  ? 'mask-image: linear-gradient(to left, transparent 0px, black 24px); -webkit-mask-image: linear-gradient(to left, transparent 0px, black 24px);'
                  : ''}"
              >
                <!-- Progress fill background -->
                <div
                  style="position: absolute; inset: 0; border-radius: 0.375rem; background-color: rgba(139, 92, 246, 0.4); width: {progress}%;"
                ></div>
                <!-- Target date marker (shows when in predicted mode) -->
                {#if targetMarkerPercent !== null}
                  <div
                    style="position: absolute; top: 0; bottom: 0; z-index: 20; display: flex; flex-direction: column; align-items: center; justify-content: center; left: {targetMarkerPercent}%;"
                  >
                    <!-- Vertical line -->
                    <div
                      style="width: 2px; height: 100%; background-color: rgba(251, 191, 36, 0.8);"
                    ></div>
                    <!-- Diamond marker at top -->
                    <div
                      style="position: absolute; top: -4px; width: 10px; height: 10px; background-color: #fbbf24; transform: rotate(45deg); border: 1px solid #f59e0b;"
                    ></div>
                  </div>
                {/if}
                <!-- Project name overlay -->
                <span
                  style="position: relative; z-index: 10; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: flex; align-items: center; gap: 0.375rem;"
                >
                  {#if hasWarnings}
                    <span
                      style="color: #fbbf24; font-size: 0.875rem; flex-shrink: 0;"
                      >⚠️</span
                    >
                  {/if}
                  {project.projectName}
                </span>
              </div>
            </div>
          {/each}
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div
      class="flex justify-between items-center p-6 border-t border-neutral-200 dark:border-white/10"
    >
      <div class="flex-1">
        {#if copyStatus === "success"}
          <div class="text-sm text-green-600 dark:text-green-400">
            {copyMessage}
          </div>
        {:else if copyStatus === "error"}
          <div class="text-sm text-red-600 dark:text-red-400">
            {copyMessage}
          </div>
        {/if}
      </div>
      <div class="flex gap-3 items-center">
        <Button variant="outline" onclick={onclose} disabled={isCopying}>
          Cancel
        </Button>
        <Button variant="default" onclick={copyToPNG} disabled={isCopying}>
          {#if isCopying}
            <Loader2 class="w-4 h-4 animate-spin" />
            Copying...
          {:else}
            <Copy class="w-4 h-4" />
            Copy to Clipboard
          {/if}
        </Button>
      </div>
    </div>
  {/snippet}
</Modal>

<style>
  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  :global(.animate-spin) {
    animation: spin 1s linear infinite;
  }
</style>

<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import html2canvas from "html2canvas";
  import Button from "./ui/button.svelte";
  import Badge from "./ui/badge.svelte";
  import { cn } from "$lib/utils";
  import type {
    ProjectSummary,
    TeamSummary,
    DomainSummary,
  } from "../project-data";
  import { X, Copy, Loader2 } from "lucide-svelte";

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

  let previewContainer: HTMLDivElement = $state();
  let isCopying = $state(false);
  let copyStatus: "idle" | "success" | "error" = $state("idle");
  let copyMessage = $state("");
  let showTodayIndicator = $state(false);
  let showWarnings = $state(false);

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
    const endDate = project.estimatedEndDate
      ? new Date(project.estimatedEndDate)
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

  function getProgressPercent(project: ProjectSummary): number {
    if (project.totalIssues === 0) return 0;
    return Math.round((project.completedIssues / project.totalIssues) * 100);
  }

  function hasDiscrepancies(project: ProjectSummary): boolean {
    return (
      project.hasStatusMismatch || project.isStaleUpdate || project.missingLead
    );
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
  const projects = groupBy === "team" ? team?.projects || [] : domain?.projects || [];

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
        } catch (error) {
          throw error;
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

  function handleBackdropKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const target = event.target as HTMLElement;
      if (target.classList.contains("modal-backdrop")) {
        onclose();
      }
    }
  }

  onMount(() => {
    if (browser) {
      document.addEventListener("keydown", handleKeydown);
      document.body.style.overflow = "hidden";
      return () => {
        document.removeEventListener("keydown", handleKeydown);
        document.body.style.overflow = "";
      };
    }
  });
</script>

<div
  class="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/60"
  onclick={handleBackdropClick}
  onkeydown={handleBackdropKeydown}
  role="dialog"
  aria-modal="true"
  aria-labelledby="modal-title"
  tabindex="-1"
>
  <div
    class="w-full h-full max-h-screen overflow-hidden flex flex-col rounded-md border shadow-2xl bg-white dark:bg-neutral-900 border-neutral-200 dark:border-white/10 shadow-black/50 m-4"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => e.stopPropagation()}
    role="document"
  >
    <!-- Header -->
    <div class="flex items-center justify-between p-6 border-b border-neutral-200 dark:border-white/10">
      <div class="flex-1">
        <h2
          id="modal-title"
          class="text-xl font-semibold text-neutral-900 dark:text-white mb-1"
        >
          Export: {displayName}
        </h2>
        <div class="text-sm text-neutral-600 dark:text-neutral-400">
          {projects.length} {projects.length === 1 ? "project" : "projects"}
        </div>
      </div>

      <!-- Export Controls -->
      <div class="flex items-center gap-4 mr-4">
        <label class="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            bind:checked={showTodayIndicator}
            class="w-4 h-4 rounded border-neutral-300 dark:border-white/20 text-violet-600 focus:ring-violet-500 focus:ring-2 dark:bg-neutral-800 dark:checked:bg-violet-600"
          />
          <span class="text-sm text-neutral-700 dark:text-neutral-300">
            Show today's date
          </span>
        </label>
        <label class="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            bind:checked={showWarnings}
            class="w-4 h-4 rounded border-neutral-300 dark:border-white/20 text-violet-600 focus:ring-violet-500 focus:ring-2 dark:bg-neutral-800 dark:checked:bg-violet-600"
          />
          <span class="text-sm text-neutral-700 dark:text-neutral-300">
            Show warnings
          </span>
        </label>
      </div>

      <button
        class="text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors duration-150"
        onclick={onclose}
        aria-label="Close modal"
      >
        <X class="w-5 h-5" />
      </button>
    </div>

    <!-- Preview Area -->
    <div class="flex-1 overflow-auto bg-neutral-50 dark:bg-neutral-950 p-6">
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
                  style="display: flex; position: absolute; top: 0; bottom: 0; align-items: center; font-size: 0.75rem; font-weight: 500; color: #525252; left: {month.startPercent}%; width: {month.endPercent - month.startPercent}%;"
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
            <h3 style="margin-bottom: 0.75rem; font-size: 1.125rem; font-weight: 500; color: #171717;">
              {team.teamName}
            </h3>
          {:else if domain}
            <h3 style="display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.75rem; font-size: 1.125rem; font-weight: 500; color: #171717;">
              {domain.domainName}
              <Badge variant="outline">{domain.projects.length} projects</Badge>
            </h3>
          {/if}

          {#each projects as project}
            {@const position = getProjectPosition(project)}
            {@const progress = getProgressPercent(project)}
            {@const hasWarnings = showWarnings && hasDiscrepancies(project)}

            <!-- Timeline bar -->
            <div style="position: relative; height: 3rem;">
              <div
                style="position: absolute; height: 2.5rem; border-radius: 0.375rem; display: flex; align-items: center; padding: 0 1.5rem; font-size: 0.75rem; font-weight: 500; overflow: hidden; background-color: #525252; color: #ffffff; left: {position.startPercent}%; width: {position.widthPercent}%; ${position.extendsBefore && position.extendsAfter ? "mask-image: linear-gradient(to right, transparent 0px, black 24px, black calc(100% - 24px), transparent 100%); -webkit-mask-image: linear-gradient(to right, transparent 0px, black 24px, black calc(100% - 24px), transparent 100%);" : ""} ${position.extendsBefore && !position.extendsAfter ? "mask-image: linear-gradient(to right, transparent 0px, black 24px); -webkit-mask-image: linear-gradient(to right, transparent 0px, black 24px);" : ""} ${!position.extendsBefore && position.extendsAfter ? "mask-image: linear-gradient(to left, transparent 0px, black 24px); -webkit-mask-image: linear-gradient(to left, transparent 0px, black 24px);" : ""}"
              >
                <!-- Progress fill background -->
                <div
                  style="position: absolute; inset: 0; border-radius: 0.375rem; background-color: rgba(139, 92, 246, 0.4); width: {progress}%;"
                ></div>
                <!-- Project name overlay -->
                <span style="position: relative; z-index: 10; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: flex; align-items: center; gap: 0.375rem;">
                  {#if hasWarnings}
                    <span style="color: #fbbf24; font-size: 0.875rem; flex-shrink: 0;">⚠️</span>
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
    <div class="flex items-center justify-between p-6 border-t border-neutral-200 dark:border-white/10">
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
      <div class="flex items-center gap-3">
        <Button variant="outline" onclick={onclose} disabled={isCopying}>
          Cancel
        </Button>
        <Button
          variant="default"
          onclick={copyToPNG}
          disabled={isCopying}
        >
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
  </div>
</div>

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


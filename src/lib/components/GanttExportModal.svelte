<script lang="ts">
  import { browser } from "$app/environment";
  import html2canvas from "html2canvas";
  import Modal from "./Modal.svelte";
  import Button from "./Button.svelte";
  import Badge from "./Badge.svelte";
  import { cn as _cn } from "$lib/utils";
  import type {
    ProjectSummary,
    TeamSummary,
    DomainSummary,
  } from "../project-data";
  import { X, Copy, Loader2, ChevronDown, RotateCcw } from "lucide-svelte";
  import {
    getProgressPercent,
    hasDiscrepancies,
  } from "$lib/utils/project-helpers";

  let {
    team,
    domain,
    groupBy,
    viewMode = "quarters" as "quarter" | "quarters",
    onclose,
  }: {
    team?: TeamSummary;
    domain?: DomainSummary;
    groupBy: "team" | "domain";
    viewMode?: "quarter" | "quarters";
    onclose: () => void;
  } = $props();

  let previewContainer: HTMLDivElement | undefined = $state();
  let isCopying = $state(false);
  let copyStatus: "idle" | "success" | "error" = $state("idle");
  let copyMessage = $state("");
  let showTodayIndicator = $state(false);
  let showWarnings = $state(false);
  let endDateMode = $state<"predicted" | "target">("target");
  let projectDropdownOpen = $state(false);

  // Get all projects from team or domain
  const allProjects =
    groupBy === "team" ? team?.projects || [] : domain?.projects || [];

  // Initialize selected project IDs with all projects selected
  let selectedProjectIds = $state<Set<string>>(
    new Set(allProjects.map((p) => p.projectId))
  );

  // Filtered projects based on selection
  const filteredProjects = $derived(
    allProjects.filter((p) => selectedProjectIds.has(p.projectId))
  );

  // Toggle individual project selection
  function toggleProject(projectId: string) {
    const newSet = new Set(selectedProjectIds);
    if (newSet.has(projectId)) {
      newSet.delete(projectId);
    } else {
      newSet.add(projectId);
    }
    selectedProjectIds = newSet;
  }

  // Select all projects
  function selectAllProjects() {
    selectedProjectIds = new Set(allProjects.map((p) => p.projectId));
  }

  // Deselect all projects
  function deselectAllProjects() {
    selectedProjectIds = new Set();
  }

  // Reset all display options to defaults
  function resetDisplayOptions() {
    endDateMode = "target";
    showTodayIndicator = false;
    showWarnings = false;
    selectedProjectIds = new Set(allProjects.map((p) => p.projectId));
  }

  // Close dropdown when clicking outside
  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest("[data-project-dropdown]")) {
      projectDropdownOpen = false;
    }
  }

  // Calculate quarter start date based on view mode (same as GanttChart)
  function getQuarterStart(): Date {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentQuarterStartMonth = Math.floor(currentMonth / 3) * 3;

    if (viewMode === "quarter") {
      // Current quarter only
      const quarterStart = new Date(
        now.getFullYear(),
        currentQuarterStartMonth,
        1
      );
      quarterStart.setHours(0, 0, 0, 0);
      return quarterStart;
    } else {
      // 5 quarters: 2 before + current + 2 after
      // Go back 2 quarters (6 months)
      const quarterStartMonth = currentQuarterStartMonth - 6;
      let year = now.getFullYear();
      let month = quarterStartMonth;
      // Handle year rollover
      if (month < 0) {
        month += 12;
        year -= 1;
      }
      const quarterStart = new Date(year, month, 1);
      quarterStart.setHours(0, 0, 0, 0);
      return quarterStart;
    }
  }

  // Generate days based on view mode
  function generateDays() {
    const days: Date[] = [];
    const quarterStart = getQuarterStart();
    const totalDays = viewMode === "quarter" ? 90 : 450; // 1 quarter or 5 quarters

    for (let i = 0; i < totalDays; i++) {
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

      const totalDays = viewMode === "quarter" ? 90 : 450;
      const startPercent = (monthStart.index / totalDays) * 100;
      const endPercent = nextMonthStart
        ? (nextMonthStart.index / totalDays) * 100
        : 100;

      // Format month label with year for 5-quarter view
      let monthLabel: string;
      if (viewMode === "quarters") {
        // For 5-quarter view, include year: "Nov 25"
        const monthName = monthStart.date.toLocaleDateString("en-US", {
          month: "short",
        });
        const year = monthStart.date.getFullYear();
        const yearShort = year.toString().slice(-2);
        monthLabel = `${monthName} ${yearShort}`;
      } else {
        // For single quarter view, just show month
        monthLabel = monthStart.date.toLocaleDateString("en-US", {
          month: "short",
        });
      }

      months.push({
        month: monthLabel,
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

    const totalDays = viewMode === "quarter" ? 90 : 450;
    const endDate = selectedEndDate
      ? new Date(selectedEndDate)
      : new Date(quarterStart.getTime() + totalDays * 24 * 60 * 60 * 1000);

    const startDays =
      Math.floor(
        (startDate.getTime() - quarterStart.getTime()) / (1000 * 60 * 60 * 24)
      ) || 0;
    const endDays = Math.floor(
      (endDate.getTime() - quarterStart.getTime()) / (1000 * 60 * 60 * 24)
    );

    const maxDay = totalDays - 1;
    const extendsAfterThreshold = totalDays + 2;

    const extendsBefore = startDays < 0;
    const extendsAfter = endDays > extendsAfterThreshold;

    const clampedStart = Math.max(0, Math.min(startDays, maxDay));
    const clampedEnd = Math.max(0, Math.min(endDays, maxDay));

    const startCol = clampedStart;
    const endCol = clampedEnd;
    const width = Math.max(1, endCol - startCol + 1);

    const startPercent = (clampedStart / totalDays) * 100;
    const widthPercent = (width / totalDays) * 100;

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

    const totalDays = viewMode === "quarter" ? 90 : 450;
    const maxDay = totalDays - 1;
    const clampedTarget = Math.max(0, Math.min(targetDays, maxDay));
    return (clampedTarget / totalDays) * 100;
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

    const totalDays = viewMode === "quarter" ? 90 : 450;
    const dayIndex = days.findIndex((d) => d.getTime() === now.getTime());

    if (dayIndex === -1) return null;

    return (dayIndex / totalDays) * 100;
  }

  const currentDayPercent = getCurrentDayPosition();
  const displayName = groupBy === "team" ? team?.teamName : domain?.domainName;

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

{#snippet headerSnippet()}
  <div
    class="flex justify-between items-center p-6 bg-white border-b border-neutral-200 dark:border-white/10 dark:bg-neutral-900"
    onclick={handleClickOutside}
    role="presentation"
  >
    <div class="flex-1">
      <h2
        id="modal-title"
        class="mb-1 text-xl font-semibold text-neutral-900 dark:text-white"
      >
        Export: {displayName}
      </h2>
      <div class="text-sm text-neutral-600 dark:text-neutral-400">
        {filteredProjects.length} of {allProjects.length}
        {allProjects.length === 1 ? "project" : "projects"} selected
      </div>
    </div>

    <!-- Export Controls -->
    <div class="flex gap-3 items-center mr-4">
      <!-- Project Selection Dropdown -->
      <div class="relative" data-project-dropdown>
        <button
          type="button"
          onclick={(e) => {
            e.stopPropagation();
            projectDropdownOpen = !projectDropdownOpen;
          }}
          class="flex gap-2 items-center px-3 py-1.5 text-sm bg-white rounded border dark:bg-neutral-800 border-neutral-300 dark:border-white/20 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors cursor-pointer min-w-[140px]"
        >
          <span class="flex-1 text-left truncate">
            {selectedProjectIds.size === allProjects.length
              ? "All projects"
              : selectedProjectIds.size === 0
                ? "No projects"
                : `${selectedProjectIds.size} projects`}
          </span>
          <ChevronDown
            class="w-4 h-4 flex-shrink-0 transition-transform {projectDropdownOpen
              ? 'rotate-180'
              : ''}"
          />
        </button>

        {#if projectDropdownOpen}
          <div
            class="overflow-hidden absolute left-0 top-full z-50 mt-1 w-72 max-h-80 bg-white rounded-md border shadow-xl dark:bg-neutral-800 border-neutral-200 dark:border-white/10"
          >
            <!-- Quick actions -->
            <div
              class="flex gap-2 p-2 border-b border-neutral-200 dark:border-white/10"
            >
              <button
                type="button"
                onclick={(e) => {
                  e.stopPropagation();
                  selectAllProjects();
                }}
                class="flex-1 px-2 py-1 text-xs font-medium rounded transition-colors bg-neutral-100 dark:bg-white/10 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-white/20"
              >
                Select All
              </button>
              <button
                type="button"
                onclick={(e) => {
                  e.stopPropagation();
                  deselectAllProjects();
                }}
                class="flex-1 px-2 py-1 text-xs font-medium rounded transition-colors bg-neutral-100 dark:bg-white/10 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-white/20"
              >
                Deselect All
              </button>
            </div>

            <!-- Project list -->
            <div class="overflow-y-auto p-1 max-h-60">
              {#each allProjects as project (project.projectId)}
                <label
                  class="flex gap-2 items-center px-2 py-1.5 rounded transition-colors cursor-pointer hover:bg-neutral-100 dark:hover:bg-white/5"
                >
                  <input
                    type="checkbox"
                    checked={selectedProjectIds.has(project.projectId)}
                    onchange={() => toggleProject(project.projectId)}
                    onclick={(e) => e.stopPropagation()}
                    class="w-4 h-4 text-violet-600 rounded border-neutral-300 dark:border-white/20 focus:ring-violet-500 focus:ring-2 dark:bg-neutral-700 dark:checked:bg-violet-600"
                  />
                  <span
                    class="text-sm truncate text-neutral-700 dark:text-neutral-300"
                    title={project.projectName}
                  >
                    {project.projectName}
                  </span>
                </label>
              {/each}
            </div>
          </div>
        {/if}
      </div>

      <!-- End date mode -->
      <div class="flex gap-2 items-center">
        <span class="text-sm text-neutral-600 dark:text-neutral-400">
          End date:
        </span>
        <select
          bind:value={endDateMode}
          class="px-2 py-1 text-sm bg-white rounded border dark:bg-neutral-800 border-neutral-300 dark:border-white/20 text-neutral-700 dark:text-neutral-300 focus:ring-violet-500 focus:ring-2 focus:outline-none"
        >
          <option value="target">Target</option>
          <option value="predicted">Predicted</option>
        </select>
      </div>

      <!-- Show today checkbox -->
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

      <!-- Show warnings checkbox -->
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

      <!-- Reset button -->
      <button
        type="button"
        onclick={resetDisplayOptions}
        class="flex gap-1.5 items-center px-2 py-1.5 text-sm bg-transparent rounded border transition-colors cursor-pointer hover:bg-neutral-100 dark:hover:bg-white/10 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white border-neutral-300 dark:border-white/20"
        title="Reset display options"
      >
        <RotateCcw class="w-4 h-4" />
        <span>Reset</span>
      </button>
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
            <Badge variant="outline">{filteredProjects.length} projects</Badge>
          </h3>
        {/if}

        {#each filteredProjects as project}
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

<Modal
  {onclose}
  size="full"
  maxHeight="90vh"
  scrollable={true}
  topAligned={true}
  background="bg-white dark:bg-neutral-900"
  header={headerSnippet}
  children={childrenSnippet}
/>

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

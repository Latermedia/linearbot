<script lang="ts">
  import Badge from "$lib/components/ui/badge.svelte";
  import Card from "$lib/components/ui/card.svelte";
  import { cn } from "$lib/utils";
  import type {
    ProjectSummary,
    TeamSummary,
    DomainSummary,
  } from "../project-data";
  import ProjectDetailModal from "./ProjectDetailModal.svelte";

  let {
    teams = [],
    domains = [],
    groupBy = "team" as "team" | "domain",
    showScale = true,
  }: {
    teams?: TeamSummary[];
    domains?: DomainSummary[];
    groupBy?: "team" | "domain";
    showScale?: boolean;
  } = $props();

  let selectedProject: ProjectSummary | null = $state(null);
  let hoveredProject: ProjectSummary | null = $state(null);
  let tooltipPosition = $state({ x: 0, y: 0 });

  // Calculate current quarter start date
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

  // Get month labels with positions
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

    // Get all unique months in the range
    const monthStarts: { date: Date; index: number }[] = [];

    // Find all months that appear in the range
    const firstDay = days[0];
    const lastDay = days[days.length - 1];

    // Start from the first day of the first month in range
    let currentMonth = new Date(firstDay.getFullYear(), firstDay.getMonth(), 1);

    // Continue until we've covered all months in the range
    while (currentMonth <= lastDay) {
      const monthKey = `${currentMonth.getFullYear()}-${currentMonth.getMonth()}`;

      if (!seenMonths.has(monthKey)) {
        seenMonths.add(monthKey);

        // Find where this month start falls in our days array
        let index = days.findIndex(
          (d) =>
            d.getFullYear() === currentMonth.getFullYear() &&
            d.getMonth() === currentMonth.getMonth() &&
            d.getDate() === 1
        );

        // If month start is before our range, use index 0
        if (index === -1 && currentMonth < firstDay) {
          index = 0;
        }

        // Only add if this month appears in our range
        if (index >= 0 || currentMonth >= firstDay) {
          monthStarts.push({
            date: new Date(currentMonth),
            index: index >= 0 ? index : 0,
          });
        }
      }

      // Move to next month
      currentMonth = new Date(
        currentMonth.getFullYear(),
        currentMonth.getMonth() + 1,
        1
      );
    }

    // Sort by index
    monthStarts.sort((a, b) => a.index - b.index);

    // Create month labels
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

    // Calculate days from quarter start
    const startDays =
      Math.floor(
        (startDate.getTime() - quarterStart.getTime()) / (1000 * 60 * 60 * 24)
      ) || 0;
    const endDays = Math.floor(
      (endDate.getTime() - quarterStart.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Check if dates extend beyond visible range
    const extendsBefore = startDays < 0;
    const extendsAfter = endDays > 89;

    // Clamp to visible range (0-89 days)
    const clampedStart = Math.max(0, Math.min(startDays, 89));
    const clampedEnd = Math.max(0, Math.min(endDays, 89));

    const startCol = clampedStart;
    const endCol = clampedEnd;
    const width = Math.max(1, endCol - startCol + 1);

    // Calculate percentages for positioning
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

  function formatDate(date: Date | string | null): string {
    if (!date) return "N/A";
    const d = typeof date === "string" ? new Date(date) : date;
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function handleBarMouseEnter(
    event: MouseEvent,
    project: ProjectSummary
  ): void {
    hoveredProject = project;
    tooltipPosition = { x: event.clientX, y: event.clientY };
  }

  function handleBarMouseMove(event: MouseEvent): void {
    if (hoveredProject) {
      tooltipPosition = { x: event.clientX, y: event.clientY };
    }
  }

  function handleBarMouseLeave(): void {
    hoveredProject = null;
  }

  function handleBarClick(project: ProjectSummary): void {
    selectedProject = project;
  }

  function closeModal(): void {
    selectedProject = null;
  }

  // Get current day position
  function getCurrentDayPosition(): number | null {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    // Check if current day is within the visible range
    if (now < quarterStart || now > days[days.length - 1]) {
      return null;
    }

    const dayIndex = days.findIndex((d) => d.getTime() === now.getTime());

    if (dayIndex === -1) return null;

    return (dayIndex / 90) * 100;
  }

  const currentDayPercent = getCurrentDayPosition();
</script>

<div class="space-y-6">
  <!-- Timeline header -->
  {#if showScale}
    <div
      class="sticky top-[116px] z-20 px-4 pb-2 -mx-4 sm:-mx-6 lg:-mx-8 sm:px-6 lg:px-8 backdrop-blur-sm bg-white/95 dark:bg-neutral-950/95 pt-1 -mt-1"
    >
      <div class="relative h-8">
        <!-- Month labels -->
        <div class="absolute inset-0">
          {#each monthLabels as month, i}
            <div
              class="flex absolute top-0 bottom-0 items-center text-xs font-medium text-neutral-600 dark:text-neutral-400"
              style="left: {month.startPercent}%; width: {month.endPercent -
                month.startPercent}%;"
            >
              <div class="px-2">{month.month}</div>
            </div>
          {/each}
        </div>
        <!-- Month start markers -->
        <div class="absolute inset-0">
          {#each monthLabels as month}
            <div
              class="absolute top-0 bottom-0 w-px bg-neutral-300 dark:bg-white/20"
              style="left: {month.startPercent}%;"
            ></div>
          {/each}
        </div>
        <!-- Current day indicator -->
        {#if currentDayPercent !== null}
          <div
            class="absolute top-0 bottom-0 z-20 w-0.5 bg-violet-500 dark:bg-violet-500"
            style="left: {currentDayPercent}%;"
          >
            <div
              class="absolute -top-1 left-1/2 w-2 h-2 bg-violet-500 rounded-full -translate-x-1/2 dark:bg-violet-500"
            ></div>
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Projects grouped by team or domain -->
  {#if groupBy === "team"}
    {#each teams as team}
      <div class="mb-6 space-y-3">
        <h3 class="mb-4 text-lg font-medium text-neutral-900 dark:text-white">
          {team.teamName}
        </h3>
        {#each team.projects as project}
          {@const position = getProjectPosition(project)}
          {@const progress = getProgressPercent(project)}
          {@const hasWarnings = hasDiscrepancies(project)}

          <!-- Timeline bar -->
          <div class="relative h-8">
            <div
              class={cn(
                "absolute h-6 rounded-md flex items-center px-6 cursor-pointer transition-all duration-150",
                "bg-neutral-600 dark:bg-neutral-700 text-white text-xs font-medium overflow-hidden",
                "hover:bg-neutral-500 dark:hover:bg-neutral-600 hover:shadow-sm"
              )}
              style={`
                left: ${position.startPercent}%; 
                width: ${position.widthPercent}%;
                ${position.extendsBefore ? "mask-image: linear-gradient(to right, transparent 0px, black 32px); -webkit-mask-image: linear-gradient(to right, transparent 0px, black 32px);" : ""}
                ${position.extendsAfter ? (position.extendsBefore ? "mask-image: linear-gradient(to right, transparent 0px, black 32px, black calc(100% - 32px), transparent 100%); -webkit-mask-image: linear-gradient(to right, transparent 0px, black 32px, black calc(100% - 32px), transparent 100%);" : "mask-image: linear-gradient(to left, transparent 0px, black 32px); -webkit-mask-image: linear-gradient(to left, transparent 0px, black 32px);") : ""}
              `}
              onmouseenter={(e) => handleBarMouseEnter(e, project)}
              onmousemove={(e) => handleBarMouseMove(e)}
              onmouseleave={handleBarMouseLeave}
              onclick={() => handleBarClick(project)}
              role="button"
              tabindex="0"
            >
              <!-- Progress fill background -->
              <div
                class="absolute inset-0 rounded-md bg-violet-500/40 dark:bg-violet-500/50"
                style={`width: ${progress}%;`}
              ></div>
              <!-- Project name overlay -->
              <span class="relative z-10 truncate">{project.projectName}</span>
            </div>
          </div>
        {/each}
      </div>
    {/each}
  {:else}
    {#each domains as domain}
      <div class="mb-6 space-y-3">
        <h3
          class="flex gap-2 items-center mb-4 text-lg font-medium text-neutral-900 dark:text-white"
        >
          {domain.domainName}
          <Badge variant="outline">{domain.projects.length} projects</Badge>
        </h3>
        {#each domain.projects as project}
          {@const position = getProjectPosition(project)}
          {@const progress = getProgressPercent(project)}
          {@const hasWarnings = hasDiscrepancies(project)}

          <!-- Timeline bar -->
          <div class="relative h-8">
            <div
              class={cn(
                "absolute h-6 rounded-md flex items-center px-6 cursor-pointer transition-all duration-150",
                "bg-neutral-600 dark:bg-neutral-700 text-white text-xs font-medium overflow-hidden",
                "hover:bg-neutral-500 dark:hover:bg-neutral-600 hover:shadow-sm"
              )}
              style={`
                left: ${position.startPercent}%; 
                width: ${position.widthPercent}%;
                ${position.extendsBefore ? "mask-image: linear-gradient(to right, transparent 0px, black 32px); -webkit-mask-image: linear-gradient(to right, transparent 0px, black 32px);" : ""}
                ${position.extendsAfter ? (position.extendsBefore ? "mask-image: linear-gradient(to right, transparent 0px, black 32px, black calc(100% - 32px), transparent 100%); -webkit-mask-image: linear-gradient(to right, transparent 0px, black 32px, black calc(100% - 32px), transparent 100%);" : "mask-image: linear-gradient(to left, transparent 0px, black 32px); -webkit-mask-image: linear-gradient(to left, transparent 0px, black 32px);") : ""}
              `}
              onmouseenter={(e) => handleBarMouseEnter(e, project)}
              onmousemove={(e) => handleBarMouseMove(e)}
              onmouseleave={handleBarMouseLeave}
              onclick={() => handleBarClick(project)}
              role="button"
              tabindex="0"
            >
              <!-- Progress fill background -->
              <div
                class="absolute inset-0 rounded-md bg-violet-500/40 dark:bg-violet-500/50"
                style={`width: ${progress}%;`}
              ></div>
              <!-- Project name overlay -->
              <span class="relative z-10 truncate">{project.projectName}</span>
            </div>
          </div>
        {/each}
      </div>
    {/each}
  {/if}

  <!-- Hover tooltip -->
  {#if hoveredProject}
    {@const progress = getProgressPercent(hoveredProject)}
    {@const hasWarnings = hasDiscrepancies(hoveredProject)}
    <div
      class="fixed z-50 px-3 py-2 text-xs text-white rounded border shadow-lg pointer-events-none bg-neutral-800 border-white/10"
      style={`left: ${tooltipPosition.x + 10}px; top: ${tooltipPosition.y + 10}px; max-width: 200px;`}
    >
      <div class="mb-1 font-medium">{hoveredProject.projectName}</div>
      <div class="space-y-0.5 text-neutral-300">
        <div>Progress: {progress}%</div>
        <div>
          Start: {formatDate(hoveredProject.startDate)}
        </div>
        <div>
          End: {formatDate(hoveredProject.estimatedEndDate)}
        </div>
        {#if hasWarnings}
          <div class="mt-1 text-amber-400">⚠️ Has discrepancies</div>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Modal -->
  {#if selectedProject}
    <ProjectDetailModal project={selectedProject} onclose={closeModal} />
  {/if}
</div>

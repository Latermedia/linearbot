<script lang="ts">
  import type {
    ProjectSummary,
    TeamSummary,
    DomainSummary,
  } from "../project-data";
  import ProjectDetailModal from "./ProjectDetailModal.svelte";
  import ProjectHoverTooltip from "./ProjectHoverTooltip.svelte";
  import GanttExportModal from "./GanttExportModal.svelte";
  import GanttProjectBar from "./GanttProjectBar.svelte";
  import GanttSectionHeader from "./GanttSectionHeader.svelte";

  let {
    teams = [],
    domains = [],
    groupBy = "team" as "team" | "domain",
    showScale = true,
    hideWarnings = false,
    hideHeader = false,
    embedded = false,
    endDateMode = "predicted" as "predicted" | "target",
    viewMode = "quarters" as "quarter" | "quarters",
  }: {
    teams?: TeamSummary[];
    domains?: DomainSummary[];
    groupBy?: "team" | "domain";
    showScale?: boolean;
    hideWarnings?: boolean;
    /** Hide the group header (useful when parent already shows group info) */
    hideHeader?: boolean;
    /** Embedded mode: skip header (for use inside parent Card) */
    embedded?: boolean;
    endDateMode?: "predicted" | "target";
    viewMode?: "quarter" | "quarters";
  } = $props();

  // Embedded mode implies hideHeader
  const shouldHideHeader = $derived(hideHeader || embedded);

  let selectedProject: ProjectSummary | null = $state(null);
  let hoveredProject: ProjectSummary | null = $state(null);
  let tooltipPosition = $state({ x: 0, y: 0 });
  let hoveredSection: string | null = $state(null);
  let exportTeam: TeamSummary | null = $state(null);
  let exportDomain: DomainSummary | null = $state(null);

  // Calculate quarter start date based on view mode
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

  // Make these reactive to viewMode changes
  const quarterStart = $derived.by(() => getQuarterStart());
  const days = $derived.by(() => generateDays());

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

      const totalDays = viewMode === "quarter" ? 90 : 450;
      const startPercent = (monthStart.index / totalDays) * 100;
      const endPercent = nextMonthStart
        ? (nextMonthStart.index / totalDays) * 100
        : 100;

      // Format month label with year for 5-quarter view
      let monthLabel: string;
      if (viewMode === "quarters") {
        // For 5-quarter view, include year: "Nov 25" or show quarter demarcations
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

  const monthLabels = $derived.by(() => getMonthLabels());

  // Get quarter boundaries for 5-quarter view
  function getQuarterBoundaries(): Array<{
    quarter: string;
    startPercent: number;
    endPercent: number;
  }> {
    if (viewMode === "quarter") return [];

    const boundaries: Array<{
      quarter: string;
      startPercent: number;
      endPercent: number;
    }> = [];

    const totalDays = 450;
    const quarterDays = 90;

    for (let i = 0; i < 5; i++) {
      const startDay = i * quarterDays;
      const endDay = (i + 1) * quarterDays;
      const startPercent = (startDay / totalDays) * 100;
      const endPercent = (endDay / totalDays) * 100;

      // Calculate which quarter this is
      const quarterStartDate = new Date(quarterStart);
      quarterStartDate.setDate(quarterStartDate.getDate() + startDay);
      const quarter = Math.floor(quarterStartDate.getMonth() / 3) + 1; // 1-4
      const year = quarterStartDate.getFullYear();
      const quarterLabel = `Q${quarter} ${year}`;

      boundaries.push({
        quarter: quarterLabel,
        startPercent,
        endPercent,
      });
    }

    return boundaries;
  }

  const quarterBoundaries = $derived.by(() => getQuarterBoundaries());

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

    // Calculate days from quarter start (now 2 quarters before current)
    const startDays =
      Math.floor(
        (startDate.getTime() - quarterStart.getTime()) / (1000 * 60 * 60 * 24)
      ) || 0;
    const endDays = Math.floor(
      (endDate.getTime() - quarterStart.getTime()) / (1000 * 60 * 60 * 24)
    );

    const maxDay = totalDays - 1;
    const extendsAfterThreshold = totalDays + 2;

    // Check if dates extend beyond visible range
    // Don't fade if within 2 days of the range boundaries (directionally accurate)
    const extendsBefore = startDays < -2;
    const extendsAfter = endDays > extendsAfterThreshold;

    // Clamp to visible range
    const clampedStart = Math.max(0, Math.min(startDays, maxDay));
    const clampedEnd = Math.max(0, Math.min(endDays, maxDay));

    const startCol = clampedStart;
    const endCol = clampedEnd;
    const width = Math.max(1, endCol - startCol + 1);

    // Calculate percentages for positioning
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

  const groups = $derived.by(() => {
    // Explicitly reference teams and domains to ensure reactivity
    const teamsList = teams;
    const domainsList = domains;
    const grouping = groupBy;
    return grouping === "team" ? teamsList : domainsList;
  });

  // Log sections when displaying
  $effect(() => {
    console.log("[GanttChart] groupBy changed:", groupBy);
    console.log("[GanttChart] teams.length:", teams.length);
    console.log("[GanttChart] domains.length:", domains.length);
    console.log("[GanttChart] groups.length:", groups.length);

    if (groups.length > 0) {
      if (groupBy === "team") {
        const sections = teams.map((team) => ({
          title: team.teamName,
          projects: team.projects.map((p) => ({
            projectId: p.projectId,
            projectName: p.projectName,
          })),
        }));
        console.log("[GanttChart] Sections (by team):", sections);
      } else {
        // Domain grouping format: [{ domain: "Domain Name", projects: [...] }, ...]
        const sections = domains.map((domain) => ({
          domain: domain.domainName,
          projects: domain.projects.map((p) => ({
            projectId: p.projectId,
            projectName: p.projectName,
          })),
        }));
        console.log("[GanttChart] Sections (by domain):", sections);
        // Also log with generic "title" abstraction
        const sectionsWithTitle = domains.map((domain) => ({
          title: domain.domainName,
          projects: domain.projects.map((p) => ({
            projectId: p.projectId,
            projectName: p.projectName,
          })),
        }));
        console.log(
          "[GanttChart] Sections (by domain, abstracted with title):",
          sectionsWithTitle
        );
      }
    } else {
      console.warn("[GanttChart] groups is empty! groupBy:", groupBy);
    }
  });

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

  function openExportModal(team?: TeamSummary, domain?: DomainSummary): void {
    exportTeam = team || null;
    exportDomain = domain || null;
  }

  function closeExportModal(): void {
    exportTeam = null;
    exportDomain = null;
  }

  function getSectionKey(group: TeamSummary | DomainSummary): string {
    if ("teamId" in group) return `team-${group.teamId}`;
    return `domain-${group.domainName}`;
  }

  // Get current day position
  function getCurrentDayPosition(): number | null {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const totalDays = viewMode === "quarter" ? 90 : 450;

    // Check if current day is within the visible range
    if (now < quarterStart || now > days[days.length - 1]) {
      return null;
    }

    const dayIndex = days.findIndex((d) => d.getTime() === now.getTime());

    if (dayIndex === -1) return null;

    return (dayIndex / totalDays) * 100;
  }

  const currentDayPercent = getCurrentDayPosition();
</script>

<div class="space-y-6">
  <!-- Timeline header (sticky, outside scroll container) -->
  {#if showScale}
    <div
      class="sticky top-[116px] z-30 px-4 pb-2 -mx-4 sm:-mx-6 lg:-mx-8 sm:px-6 lg:px-8 backdrop-blur-sm bg-white/95 dark:bg-neutral-950/95 border-b border-neutral-200 dark:border-white/10 pt-1 -mt-1"
    >
      <div class="overflow-x-auto px-4 -mx-4 sm:-mx-6 lg:-mx-8 sm:px-6 lg:px-8">
        <div style="min-width: {viewMode === 'quarters' ? '1400px' : '100%'};">
          <div class="relative h-8">
            <!-- Quarter boundaries (for 5-quarter view) -->
            {#if viewMode === "quarters"}
              <div class="absolute inset-0">
                {#each quarterBoundaries as boundary}
                  <div
                    class="absolute top-0 bottom-0 z-30 border-l border-white/10 dark:border-white/5"
                    style="left: {boundary.startPercent}%;"
                    title={boundary.quarter}
                  ></div>
                {/each}
              </div>
            {/if}
            <!-- Month labels -->
            <div class="absolute inset-0 z-30">
              {#each monthLabels as month, _i}
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
            <div class="absolute inset-0 z-30">
              {#each monthLabels as month}
                <div
                  class="absolute top-0 bottom-0 w-px border-l border-neutral-300 dark:border-white/20"
                  style="left: {month.startPercent}%;"
                ></div>
              {/each}
            </div>
            <!-- Current day indicator -->
            {#if currentDayPercent !== null}
              <div
                class="absolute top-0 bottom-0 z-30 w-0.5 bg-violet-500 dark:bg-violet-500"
                style="left: {currentDayPercent}%;"
              >
                <div
                  class="absolute -top-1 left-1/2 w-2 h-2 bg-violet-500 rounded-full -translate-x-1/2 dark:bg-violet-500"
                ></div>
              </div>
            {/if}
          </div>
        </div>
      </div>
    </div>
  {/if}

  <!-- Projects grouped by team or domain -->
  <div
    class="overflow-x-auto overflow-y-visible px-4 -mx-4 sm:-mx-6 lg:-mx-8 sm:px-6 lg:px-8"
  >
    <div
      style="min-width: {viewMode === 'quarters' ? '1400px' : '100%'};"
      class="overflow-visible"
    >
      <div class="relative overflow-visible">
        <!-- Quarter boundaries (for 5-quarter view) -->
        {#if viewMode === "quarters"}
          <div class="absolute inset-0 pointer-events-none z-0">
            {#each quarterBoundaries as boundary}
              <div
                class="absolute top-0 bottom-0 border-l border-white/10 dark:border-white/5"
                style="left: {boundary.startPercent}%;"
              ></div>
            {/each}
          </div>
        {/if}
        <!-- Current date background indicator -->
        {#if currentDayPercent !== null}
          <div
            class="absolute -top-32 bottom-0 z-0 pointer-events-none w-0.5 bg-violet-500/30 dark:bg-violet-500/40"
            style="left: {currentDayPercent}%;"
          ></div>
        {/if}
        {#each groups as group (getSectionKey(group))}
          {@const sectionKey = getSectionKey(group)}
          <div
            class="mb-5 space-y-1.5 group"
            role="group"
            onmouseenter={() => (hoveredSection = sectionKey)}
            onmouseleave={() => (hoveredSection = null)}
          >
            {#if !shouldHideHeader}
              <GanttSectionHeader
                {group}
                {hoveredSection}
                {sectionKey}
                onExport={() => {
                  if ("teamId" in group) {
                    openExportModal(group);
                  } else {
                    openExportModal(undefined, group);
                  }
                }}
              />
            {/if}
            {#each group.projects as project}
              {@const position = getProjectPosition(project)}
              {@const targetDatePercent = getTargetDatePercent(project)}
              <GanttProjectBar
                {project}
                {position}
                {hideWarnings}
                {endDateMode}
                {targetDatePercent}
                onmouseenter={(e) => handleBarMouseEnter(e, project)}
                onmousemove={handleBarMouseMove}
                onmouseleave={handleBarMouseLeave}
                onclick={() => handleBarClick(project)}
              />
            {/each}
          </div>
        {/each}
      </div>
    </div>
  </div>

  <!-- Hover tooltip -->
  {#if hoveredProject}
    <ProjectHoverTooltip
      project={hoveredProject}
      {hideWarnings}
      position={tooltipPosition}
    />
  {/if}

  <!-- Project Detail Modal -->
  {#if selectedProject}
    <ProjectDetailModal
      project={selectedProject}
      onclose={closeModal}
      {hideWarnings}
    />
  {/if}

  <!-- Export Modal -->
  {#if exportTeam || exportDomain}
    <GanttExportModal
      team={exportTeam || undefined}
      domain={exportDomain || undefined}
      {groupBy}
      {viewMode}
      onclose={closeExportModal}
    />
  {/if}
</div>

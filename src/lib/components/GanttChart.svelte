<script lang="ts">
  import type {
    ProjectSummary,
    TeamSummary,
    DomainSummary,
  } from "../project-data";
  import ProjectDetailModal from "./ProjectDetailModal.svelte";
  import GanttExportModal from "./GanttExportModal.svelte";
  import GanttProjectBar from "./GanttProjectBar.svelte";
  import GanttSectionHeader from "./GanttSectionHeader.svelte";
  import ProjectHoverTooltip from "./ProjectHoverTooltip.svelte";

  let {
    teams = [],
    domains = [],
    groupBy = "team" as "team" | "domain",
    showScale = true,
    hideWarnings = false,
  }: {
    teams?: TeamSummary[];
    domains?: DomainSummary[];
    groupBy?: "team" | "domain";
    showScale?: boolean;
    hideWarnings?: boolean;
  } = $props();

  let selectedProject: ProjectSummary | null = $state(null);
  let hoveredProject: ProjectSummary | null = $state(null);
  let tooltipPosition = $state({ x: 0, y: 0 });
  let hoveredSection: string | null = $state(null);
  let exportTeam: TeamSummary | null = $state(null);
  let exportDomain: DomainSummary | null = $state(null);

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
    // Don't fade if within 2 days of the range boundaries (directionally accurate)
    const extendsBefore = startDays < -2;
    const extendsAfter = endDays > 92;

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

  const groups = $derived.by(() => {
    return groupBy === "team" ? teams : domains;
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
  {#each groups as group (getSectionKey(group))}
    {@const sectionKey = getSectionKey(group)}
    <div
      class="mb-5 space-y-1.5 group"
      role="group"
      onmouseenter={() => (hoveredSection = sectionKey)}
      onmouseleave={() => (hoveredSection = null)}
    >
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
      {#each group.projects as project}
        {@const position = getProjectPosition(project)}
        <GanttProjectBar
          {project}
          {position}
          {hideWarnings}
          onmouseenter={(e) => handleBarMouseEnter(e, project)}
          onmousemove={handleBarMouseMove}
          onmouseleave={handleBarMouseLeave}
          onclick={() => handleBarClick(project)}
        />
      {/each}
    </div>
  {/each}

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
    <ProjectDetailModal project={selectedProject} onclose={closeModal} {hideWarnings} />
  {/if}

  <!-- Export Modal -->
  {#if exportTeam || exportDomain}
    <GanttExportModal
      team={exportTeam || undefined}
      domain={exportDomain || undefined}
      {groupBy}
      onclose={closeExportModal}
    />
  {/if}
</div>

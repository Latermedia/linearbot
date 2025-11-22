<script lang="ts">
  import Badge from "$lib/components/ui/badge.svelte";
  import Card from "$lib/components/ui/card.svelte";
  import { cn } from "$lib/utils";
  import type {
    ProjectSummary,
    TeamSummary,
    DomainSummary,
  } from "../project-data";

  let {
    teams = [],
    domains = [],
    groupBy = "team" as "team" | "domain",
  }: {
    teams?: TeamSummary[];
    domains?: DomainSummary[];
    groupBy?: "team" | "domain";
  } = $props();

  // Generate months for the timeline (next 12 months)
  function generateMonths() {
    const months: Date[] = [];
    const now = new Date();
    now.setDate(1); // Start of month

    for (let i = 0; i < 12; i++) {
      const month = new Date(now);
      month.setMonth(now.getMonth() + i);
      months.push(month);
    }

    return months;
  }

  const months = generateMonths();

  function formatMonth(date: Date): string {
    return date.toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
    });
  }

  function getProjectPosition(project: ProjectSummary): {
    startCol: number;
    endCol: number;
    width: number;
  } {
    const now = new Date();
    const startDate = project.startDate ? new Date(project.startDate) : now;
    const endDate = project.estimatedEndDate
      ? new Date(project.estimatedEndDate)
      : now;

    // Find which month column the project starts and ends in
    let startCol = 0;
    let endCol = 11;

    for (let i = 0; i < months.length; i++) {
      const monthStart = new Date(months[i]);
      const monthEnd = new Date(monthStart);
      monthEnd.setMonth(monthEnd.getMonth() + 1);

      if (startDate >= monthStart && startDate < monthEnd) {
        startCol = i;
      }
      if (endDate >= monthStart && endDate < monthEnd) {
        endCol = i;
      }
    }

    // If project started before visible range, start at 0
    if (startDate < months[0]) {
      startCol = 0;
    }

    // If project ends after visible range, end at last column
    if (endDate > months[11]) {
      endCol = 11;
    }

    const width = Math.max(1, endCol - startCol + 1);

    return { startCol, endCol, width };
  }

  function getProjectColor(project: ProjectSummary): string {
    if (project.hasStatusMismatch) return "bg-amber-500";
    if (project.isStaleUpdate) return "bg-red-500";
    if (project.missingLead) return "bg-orange-500";
    if (project.completedIssues / project.totalIssues > 0.7)
      return "bg-emerald-500";
    return "bg-violet-500";
  }

  function getProgressPercent(project: ProjectSummary): number {
    return Math.round((project.completedIssues / project.totalIssues) * 100);
  }
</script>

<div class="space-y-6">
  <!-- Timeline header -->
  <div
    class="sticky top-0 z-10 border-b border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-950 pb-2"
  >
    <div class="grid grid-cols-[200px_1fr] gap-4">
      <div class="text-sm font-medium text-neutral-900 dark:text-white">
        {groupBy === "team" ? "Team / Project" : "Domain / Project"}
      </div>
      <div class="grid grid-cols-12 gap-1">
        {#each months as month}
          <div
            class="text-xs font-medium text-center text-neutral-600 dark:text-neutral-400"
          >
            {formatMonth(month)}
          </div>
        {/each}
      </div>
    </div>
  </div>

  <!-- Projects grouped by team or domain -->
  {#if groupBy === "team"}
    {#each teams as team}
      <div class="space-y-2">
        <h3 class="text-lg font-medium text-neutral-900 dark:text-white">
          {team.teamName}
        </h3>
        {#each team.projects as project}
          {@const position = getProjectPosition(project)}
          {@const color = getProjectColor(project)}
          {@const progress = getProgressPercent(project)}

          <div class="grid grid-cols-[200px_1fr] gap-4 items-center">
            <!-- Project name -->
            <div class="text-sm truncate" title={project.projectName}>
              <span class="font-medium text-neutral-900 dark:text-white"
                >{project.projectName}</span
              >
              <span class="text-neutral-500 dark:text-neutral-500 text-xs ml-2"
                >{progress}%</span
              >
            </div>

            <!-- Timeline bar -->
            <div class="relative grid grid-cols-12 gap-1 h-8">
              <div
                class={cn(
                  "absolute h-6 rounded flex items-center px-2",
                  color,
                  "text-white text-xs font-medium"
                )}
                style={`grid-column: ${position.startCol + 1} / span ${position.width}; width: calc(${position.width * 8.33}% + ${(position.width - 1) * 4}px);`}
              >
                <span class="truncate">{project.projectName}</span>
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/each}
  {:else}
    {#each domains as domain}
      <div class="space-y-2">
        <h3 class="text-lg font-medium text-neutral-900 dark:text-white flex items-center gap-2">
          {domain.domainName}
          <Badge variant="outline">{domain.projects.length} projects</Badge>
        </h3>
        {#each domain.projects as project}
          {@const position = getProjectPosition(project)}
          {@const color = getProjectColor(project)}
          {@const progress = getProgressPercent(project)}

          <div class="grid grid-cols-[200px_1fr] gap-4 items-center">
            <!-- Project name -->
            <div class="text-sm truncate" title={project.projectName}>
              <span class="font-medium text-neutral-900 dark:text-white"
                >{project.projectName}</span
              >
              <span class="text-neutral-500 dark:text-neutral-500 text-xs ml-2"
                >{progress}%</span
              >
            </div>

            <!-- Timeline bar -->
            <div class="relative grid grid-cols-12 gap-1 h-8">
              <div
                class={cn(
                  "absolute h-6 rounded flex items-center px-2",
                  color,
                  "text-white text-xs font-medium"
                )}
                style={`grid-column: ${position.startCol + 1} / span ${position.width}; width: calc(${position.width * 8.33}% + ${(position.width - 1) * 4}px);`}
              >
                <span class="truncate">{project.projectName}</span>
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/each}
  {/if}

  <!-- Legend -->
  <Card class="mt-6">
    <div class="px-4 pt-4">
      <div class="text-sm font-medium text-neutral-900 dark:text-white mb-3">
        Legend
      </div>
    </div>
    <div class="px-4 pb-4">
      <div class="flex flex-wrap gap-4 text-xs text-neutral-400">
        <div class="flex items-center gap-2">
          <div class="w-4 h-4 bg-violet-500 rounded"></div>
          <span>On Track</span>
        </div>
        <div class="flex items-center gap-2">
          <div class="w-4 h-4 bg-emerald-500 rounded"></div>
          <span>Near Completion (70%+)</span>
        </div>
        <div class="flex items-center gap-2">
          <div class="w-4 h-4 bg-amber-500 rounded"></div>
          <span>Status Mismatch</span>
        </div>
        <div class="flex items-center gap-2">
          <div class="w-4 h-4 bg-orange-500 rounded"></div>
          <span>Missing Lead</span>
        </div>
        <div class="flex items-center gap-2">
          <div class="w-4 h-4 bg-red-500 rounded"></div>
          <span>Stale (7+ days)</span>
        </div>
      </div>
    </div>
  </Card>
</div>

<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { databaseStore, projectsStore } from "$lib/stores/database";
  import { presentationMode } from "$lib/stores/presentation";
  import ProjectsTable from "$lib/components/ProjectsTable.svelte";
  import GanttChart from "$lib/components/GanttChart.svelte";
  import ToggleGroupRoot from "$lib/components/ToggleGroupRoot.svelte";
  import ToggleGroupItem from "$lib/components/ToggleGroupItem.svelte";
  import Card from "$lib/components/Card.svelte";
  import Skeleton from "$lib/components/Skeleton.svelte";
  import {
    filterProjectsByMode,
    groupProjectsByTeams,
    groupProjectsByDomains,
  } from "$lib/project-data";
  import TeamFilter from "$lib/components/TeamFilter.svelte";
  import { teamFilterStore, teamsMatchFilter } from "$lib/stores/team-filter";

  let groupBy = $state<"team" | "domain">("team");
  let viewType = $state<"table" | "gantt">("table");
  let endDateMode = $state<"predicted" | "target">("predicted");
  let projectFilter = $state<"planning" | "wip" | "planning-wip" | "all">(
    "wip"
  );
  let ganttViewMode = $state<"quarter" | "quarters">("quarters");

  // Load data on mount
  onMount(() => {
    databaseStore.load();
  });

  // Secret executive view shortcut: Ctrl+Shift+E (Windows/Linux) or Cmd+Shift+E (Mac)
  $effect(() => {
    if (!browser) return;

    function handleKeydown(event: KeyboardEvent) {
      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const keyLower = event.key.toLowerCase();

      // Check for shortcut: Cmd+Shift+E (Mac) or Ctrl+Shift+E (Windows/Linux)
      const modifierPressed = isMac
        ? event.metaKey && event.shiftKey && !event.altKey && !event.ctrlKey
        : event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey;

      if (modifierPressed && keyLower === "e") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        presentationMode.set(true);
        goto("/executive");
        return false;
      }
    }

    document.addEventListener("keydown", handleKeydown, {
      capture: true,
      passive: false,
    });

    return () => {
      document.removeEventListener("keydown", handleKeydown, {
        capture: true,
      } as any);
    };
  });

  // Subscribe to stores (stores handle browser checks internally)
  // In runes mode, access stores in reactive contexts
  // Use $derived to create reactive values from stores
  const loading = $derived($databaseStore.loading);
  const error = $derived($databaseStore.error);

  // Create reactive derived values from stores
  // This ensures they update when stores change
  const projects = $derived.by(() => {
    const p = $projectsStore;
    console.log("[+page.svelte] projects derived - size:", p.size);
    return p;
  });

  // Get current team filter
  const selectedTeamKey = $derived($teamFilterStore);

  // Filter projects based on selected mode and team filter
  const filteredProjects = $derived.by(() => {
    const issues = $databaseStore.issues;
    const filter = projectFilter; // Explicitly track projectFilter
    const teamFilter = selectedTeamKey; // Explicitly track team filter
    const filtered = filterProjectsByMode(projects, issues, filter);

    // Apply team filter if a team is selected
    if (teamFilter !== null) {
      // Filter to only projects matching the team

      return new Map(
        Array.from(filtered).filter(([_, project]) =>
          teamsMatchFilter(project.teams, teamFilter)
        )
      );
    }

    return filtered;
  });

  // Group filtered projects by teams
  // Use issues from store - the grouping function will fallback to project.teams
  // when a project has no issues in the current filter
  const teams = $derived.by(() => {
    const issues = $databaseStore.issues;
    const filter = projectFilter; // Explicitly track projectFilter
    const teamFilter = selectedTeamKey; // Explicitly track team filter
    const filtered = filteredProjects;
    let grouped = groupProjectsByTeams(filtered, issues);

    // When a team filter is selected, only show that team's section
    if (teamFilter !== null) {
      grouped = grouped.filter((team) => team.teamKey === teamFilter);
    }

    console.log(
      "[+page.svelte] teams derived - length:",
      grouped.length,
      "filter:",
      filter,
      "teamFilter:",
      teamFilter,
      "filteredProjects.size:",
      filtered.size,
      "teams:",
      grouped.map((team) => ({
        name: team.teamName,
        projects: team.projects.length,
      }))
    );
    return grouped;
  });

  // Group filtered projects by domains
  const domains = $derived.by(() => {
    const filter = projectFilter; // Explicitly track projectFilter
    const grouped = groupProjectsByDomains(teams);
    console.log(
      "[+page.svelte] domains derived - length:",
      grouped.length,
      "filter:",
      filter,
      "teams.length:",
      teams.length
    );
    return grouped;
  });

  // Calculate health metrics based on filtered projects
  const staleProjectsCount = $derived(
    filteredProjects.size > 0
      ? Array.from(filteredProjects.values()).filter((p) => p.isStaleUpdate)
          .length
      : 0
  );
  const mismatchedStatusCount = $derived(
    filteredProjects.size > 0
      ? Array.from(filteredProjects.values()).filter((p) => p.hasStatusMismatch)
          .length
      : 0
  );
  const missingLeadCount = $derived(
    filteredProjects.size > 0
      ? Array.from(filteredProjects.values()).filter((p) => p.missingLead)
          .length
      : 0
  );
</script>

<div class="space-y-6">
  <!-- Stats summary -->
  {#if !loading && !error && teams.length > 0}
    <div class="flex flex-wrap gap-4">
      <Card class="max-w-[200px]">
        <div class="mb-1 text-xs text-neutral-500 dark:text-neutral-300">
          Teams
        </div>
        <div class="text-2xl font-semibold text-neutral-900 dark:text-white">
          {teams.length}
        </div>
      </Card>
      <Card class="max-w-[200px]">
        <div class="mb-1 text-xs text-neutral-500 dark:text-neutral-300">
          Projects
        </div>
        <div class="text-2xl font-semibold text-neutral-900 dark:text-white">
          {filteredProjects.size}
        </div>
      </Card>
      <Card class="max-w-[200px]">
        <div class="mb-1 text-xs text-neutral-500 dark:text-neutral-300">
          Average Projects/Team
        </div>
        <div class="text-2xl font-semibold text-neutral-900 dark:text-white">
          {teams.length > 0
            ? (filteredProjects.size / teams.length).toFixed(2)
            : "0.00"}
        </div>
      </Card>
      <Card class="max-w-[200px]">
        <div class="mb-1 text-xs text-neutral-500 dark:text-neutral-300">
          Missing Updates
        </div>
        <div class="text-2xl font-semibold text-neutral-900 dark:text-white">
          {staleProjectsCount}
        </div>
      </Card>
      <Card class="max-w-[200px]">
        <div class="mb-1 text-xs text-neutral-500 dark:text-neutral-300">
          Status Mismatches
        </div>
        <div class="text-2xl font-semibold text-neutral-900 dark:text-white">
          {mismatchedStatusCount}
        </div>
      </Card>
      <Card class="max-w-[200px]">
        <div class="mb-1 text-xs text-neutral-500 dark:text-neutral-300">
          Missing Leads
        </div>
        <div class="text-2xl font-semibold text-neutral-900 dark:text-white">
          {missingLeadCount}
        </div>
      </Card>
    </div>
  {/if}

  <!-- Sticky controls wrapper -->
  <div
    class="sticky top-[60px] z-30 backdrop-blur-sm bg-white/95 dark:bg-neutral-950/95 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pt-1 -mt-1"
  >
    <!-- View controls -->
    <div
      class="flex flex-col gap-4 items-start py-2 sm:flex-row sm:items-center"
    >
      <!-- View type toggle -->
      <ToggleGroupRoot bind:value={viewType} variant="outline" type="single">
        <ToggleGroupItem value="table" aria-label="Table view">
          Table
        </ToggleGroupItem>
        <ToggleGroupItem value="gantt" aria-label="Gantt view">
          Gantt
        </ToggleGroupItem>
      </ToggleGroupRoot>

      <!-- Group by toggle -->
      <ToggleGroupRoot bind:value={groupBy} variant="outline" type="single">
        <ToggleGroupItem value="team" aria-label="Group by teams">
          Teams
        </ToggleGroupItem>
        <ToggleGroupItem value="domain" aria-label="Group by domains">
          Domains
        </ToggleGroupItem>
      </ToggleGroupRoot>

      <!-- Team filter dropdown -->
      <TeamFilter />

      <!-- Project filter toggle -->
      <ToggleGroupRoot
        bind:value={projectFilter}
        variant="outline"
        type="single"
        class="min-w-fit"
      >
        <ToggleGroupItem
          value="wip"
          aria-label="Show WIP projects"
          class="!flex-none"
        >
          WIP
        </ToggleGroupItem>
        <ToggleGroupItem
          value="planning"
          aria-label="Show planned projects"
          class="!flex-none"
        >
          Plan
        </ToggleGroupItem>
        <ToggleGroupItem
          value="planning-wip"
          aria-label="Show planned and WIP projects"
          class="!flex-none"
        >
          Plan & WIP
        </ToggleGroupItem>
        <ToggleGroupItem
          value="all"
          aria-label="Show all projects"
          class="!flex-none"
        >
          All
        </ToggleGroupItem>
      </ToggleGroupRoot>

      <!-- End date mode toggle (only for Gantt view) -->
      {#if viewType === "gantt"}
        <ToggleGroupRoot
          bind:value={endDateMode}
          variant="outline"
          type="single"
        >
          <ToggleGroupItem
            value="predicted"
            aria-label="Use predicted end dates"
          >
            Predicted
          </ToggleGroupItem>
          <ToggleGroupItem value="target" aria-label="Use target end dates">
            Target
          </ToggleGroupItem>
        </ToggleGroupRoot>
        <!-- Gantt view mode toggle -->
        <ToggleGroupRoot
          bind:value={ganttViewMode}
          variant="outline"
          type="single"
        >
          <ToggleGroupItem
            value="quarter"
            aria-label="Show current quarter view"
          >
            Quarter
          </ToggleGroupItem>
          <ToggleGroupItem value="quarters" aria-label="Show 5 quarter view">
            5 Quarters
          </ToggleGroupItem>
        </ToggleGroupRoot>
      {/if}
    </div>
  </div>

  <!-- Main content -->
  {#if loading}
    <div class="space-y-4">
      <Card>
        <Skeleton class="mb-4 w-48 h-8" />
        <div class="space-y-3">
          <Skeleton class="w-full h-12" />
          <Skeleton class="w-full h-12" />
          <Skeleton class="w-full h-12" />
          <Skeleton class="w-full h-12" />
        </div>
      </Card>
    </div>
  {:else if error}
    <Card class="border-red-500/50">
      <div class="mb-3 text-sm font-medium text-red-600 dark:text-red-400">
        Error Loading Data
      </div>
      <p class="mb-3 text-neutral-700 dark:text-neutral-400">{error}</p>
      <p class="text-sm text-neutral-600 dark:text-neutral-500">
        Make sure the database is synced. Run: <code
          class="px-2 py-1 font-mono text-xs rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300"
          >bun run sync</code
        >
      </p>
      <p class="mt-2 text-sm text-neutral-500 dark:text-neutral-500">
        No Linear API key? Mock data will be generated automatically.
      </p>
    </Card>
  {:else if viewType === "table"}
    {#key `${projectFilter}-${groupBy}-${selectedTeamKey}`}
      <ProjectsTable {teams} {domains} {groupBy} />
    {/key}
  {:else}
    {#key `${projectFilter}-${groupBy}-${endDateMode}-${ganttViewMode}-${selectedTeamKey}`}
      <GanttChart
        {teams}
        {domains}
        {groupBy}
        {endDateMode}
        viewMode={ganttViewMode}
      />
    {/key}
  {/if}
</div>

<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { databaseStore, projectsStore } from "$lib/stores/database";
  import { presentationMode } from "$lib/stores/presentation";
  import ProjectsTable from "$lib/components/ProjectsTable.svelte";
  import GanttChart from "$lib/components/GanttChart.svelte";
  import IssueTable from "$lib/components/IssueTable.svelte";
  import EngineersTable from "$lib/components/EngineersTable.svelte";
  import EngineerDetailModal from "$lib/components/EngineerDetailModal.svelte";
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
  import type { Issue, Engineer } from "../db/schema";
  import {
    hasMissingEstimate,
    hasMissingPriority,
    hasNoRecentComment,
    hasWIPAgeViolation,
  } from "../utils/issue-validators";
  import { getGapsColorClass } from "$lib/utils/gaps-helpers";

  // Engineer detail modal state (uses Engineer type which is compatible with EngineersTable's EngineerData)
  let selectedEngineer = $state<Engineer | null>(null);

  function handleEngineerClick(engineer: Engineer): void {
    selectedEngineer = engineer;
  }

  function closeEngineerModal(): void {
    selectedEngineer = null;
  }

  // Type adapter for EngineersTable callback (it uses a subset of Engineer fields)
  const onEngineerTableClick = (engineer: any) =>
    handleEngineerClick(engineer as Engineer);

  // Page data from server load function
  let { data } = $props();

  let groupBy = $state<"team" | "domain">("team");
  let viewType = $state<"table" | "gantt">("table");
  let endDateMode = $state<"predicted" | "target">("predicted");
  let projectFilter = $state<"planning" | "wip" | "planning-wip" | "all">(
    "wip"
  );
  let ganttViewMode = $state<"quarter" | "quarters">("quarters");

  // Non-project WIP issues for filtered team
  let nonProjectWipIssues = $state<Issue[]>([]);
  let loadingNonProjectWip = $state(false);

  // Engineer data for filtered team (global WIP stats)
  let teamProjectEngineers = $state<Engineer[]>([]);
  let loadingEngineers = $state(false);

  // Load data on mount
  onMount(() => {
    databaseStore.load();
  });

  // Fetch non-project WIP issues and engineer stats when team filter changes
  $effect(() => {
    const teamKey = $teamFilterStore;
    if (!browser || teamKey === null) {
      nonProjectWipIssues = [];
      teamProjectEngineers = [];
      return;
    }

    loadingNonProjectWip = true;
    loadingEngineers = true;

    // Fetch non-project WIP issues
    fetch(`/api/issues/non-project-wip/${encodeURIComponent(teamKey)}`)
      .then((res) => res.json())
      .then((data) => {
        nonProjectWipIssues = data.issues || [];
      })
      .catch((err) => {
        console.error("Failed to fetch non-project WIP issues:", err);
        nonProjectWipIssues = [];
      })
      .finally(() => {
        loadingNonProjectWip = false;
      });

    // Fetch engineers working on this team's projects (with global WIP stats)
    fetch(`/api/engineers/wip-stats/${encodeURIComponent(teamKey)}`)
      .then((res) => res.json())
      .then((data) => {
        teamProjectEngineers = data.engineers || [];
      })
      .catch((err) => {
        console.error("Failed to fetch engineer data:", err);
        teamProjectEngineers = [];
      })
      .finally(() => {
        loadingEngineers = false;
      });
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

  // Engineer-to-team mapping for filtering IC metrics by team
  // Configured via ENGINEER_TEAM_MAPPING environment variable (engineer:teamKey pairs)
  const engineerTeamMapping = $derived(data.engineerTeamMapping);
  const hasEngineerMapping = $derived(
    Object.keys(engineerTeamMapping).length > 0
  );

  // Calculate project-level violations count across all filtered projects
  // Includes: missingLead, isStaleUpdate, hasStatusMismatch, missingHealth, hasDateDiscrepancy
  const projectViolationsCount = $derived.by(() => {
    if (filteredProjects.size === 0) return 0;

    let count = 0;
    for (const project of filteredProjects.values()) {
      if (project.missingLead) count++;
      if (project.isStaleUpdate) count++;
      if (project.hasStatusMismatch) count++;
      if (project.missingHealth) count++;
      if (project.hasDateDiscrepancy) count++;
    }
    return count;
  });

  // Calculate issue-level (IC) violations count across all filtered projects
  // When filtering by team, only count violations from issues assigned to that team's engineers
  // Includes: missingEstimate, missingPriority, noRecentComment, wipAgeViolation, missingDescription
  const icViolationsCount = $derived.by(() => {
    if (filteredProjects.size === 0) return 0;

    const issues = $databaseStore.issues;
    const currentTeamFilter = $teamFilterStore;

    // Get project IDs for filtered projects
    const filteredProjectIds = new Set(
      Array.from(filteredProjects.values()).map((p) => p.projectId)
    );

    // Filter issues to those in filtered projects
    let relevantIssues = issues.filter(
      (issue) => issue.project_id && filteredProjectIds.has(issue.project_id)
    );

    // When filtering by team with engineer mapping, only count violations
    // from issues assigned to engineers belonging to the selected team
    if (currentTeamFilter !== null && hasEngineerMapping) {
      relevantIssues = relevantIssues.filter(
        (issue) =>
          issue.assignee_name &&
          engineerTeamMapping[issue.assignee_name] === currentTeamFilter
      );
    }

    // Count violations using the same validators used elsewhere
    let count = 0;
    for (const issue of relevantIssues) {
      if (hasMissingEstimate(issue)) count++;
      if (hasMissingPriority(issue)) count++;
      if (hasNoRecentComment(issue)) count++;
      if (hasWIPAgeViolation(issue)) count++;
    }
    return count;
  });

  // Calculate GLOBAL project counts per engineer (across all WIP projects, not filtered)
  const globalEngineerProjectCounts = $derived.by(() => {
    const counts = new Map<string, number>();
    // Use unfiltered projects but only count WIP projects
    for (const project of projects.values()) {
      if (project.inProgressIssues > 0) {
        for (const engineer of project.engineers) {
          counts.set(engineer, (counts.get(engineer) || 0) + 1);
        }
      }
    }
    return counts;
  });

  type EngineerStats = {
    name: string;
    projectCount: number;
    globalProjectCount: number;
  };

  // Calculate unique ICs and average projects per IC with WIP
  const icMetrics = $derived.by(() => {
    const emptyResult = {
      uniqueICCount: 0,
      avgProjectsPerIC: 0,
      coreEngineers: [] as EngineerStats[],
      additionalICs: [] as EngineerStats[],
    };

    if (filteredProjects.size === 0) {
      return emptyResult;
    }

    const currentTeamFilter = $teamFilterStore;

    // Build maps for core engineers (count towards metrics) and additional ICs (display only)
    const coreEngineerCounts = new Map<string, number>();
    const additionalICCounts = new Map<string, number>();

    for (const project of filteredProjects.values()) {
      for (const engineer of project.engineers) {
        const isCoreEngineer =
          !hasEngineerMapping ||
          currentTeamFilter === null ||
          engineerTeamMapping[engineer] === currentTeamFilter;

        if (isCoreEngineer) {
          coreEngineerCounts.set(
            engineer,
            (coreEngineerCounts.get(engineer) || 0) + 1
          );
        } else {
          additionalICCounts.set(
            engineer,
            (additionalICCounts.get(engineer) || 0) + 1
          );
        }
      }
    }

    const uniqueICCount = coreEngineerCounts.size;
    if (uniqueICCount === 0) {
      return emptyResult;
    }

    // Sum up all project counts and divide by unique IC count (core engineers only)
    const totalProjectAssignments = Array.from(
      coreEngineerCounts.values()
    ).reduce((sum, count) => sum + count, 0);

    // Helper to create sorted engineer list
    const toSortedList = (counts: Map<string, number>): EngineerStats[] =>
      Array.from(counts.entries())
        .map(([name, projectCount]) => ({
          name,
          projectCount,
          globalProjectCount:
            globalEngineerProjectCounts.get(name) || projectCount,
        }))
        .sort(
          (a, b) =>
            b.globalProjectCount - a.globalProjectCount ||
            a.name.localeCompare(b.name)
        );

    return {
      uniqueICCount,
      avgProjectsPerIC: totalProjectAssignments / uniqueICCount,
      coreEngineers: toSortedList(coreEngineerCounts),
      additionalICs: toSortedList(additionalICCounts),
    };
  });

  const uniqueICCount = $derived(icMetrics.uniqueICCount);
  const avgProjectsPerIC = $derived(icMetrics.avgProjectsPerIC);
  const _coreEngineers = $derived(icMetrics.coreEngineers);
  const _additionalICs = $derived(icMetrics.additionalICs);
  const projectTarget = $derived(Math.floor(uniqueICCount / 2));
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
      <Card class="relative max-w-[200px]">
        <span
          class="absolute top-2 right-2 inline-flex justify-center items-center w-3.5 h-3.5 text-[10px] rounded-full cursor-help bg-neutral-200 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400"
          title="Number of active projects with work in progress. Target is based on having at least 2 ICs per project."
          >i</span
        >
        <div class="pr-6 mb-1 text-xs text-neutral-500 dark:text-neutral-300">
          Projects
        </div>
        <div
          class="text-2xl font-semibold {filteredProjects.size <= projectTarget
            ? 'text-green-600 dark:text-green-400'
            : 'text-red-600 dark:text-red-400'}"
        >
          {filteredProjects.size}
        </div>
        <div class="text-xs text-neutral-400 dark:text-neutral-500">
          target: ≤{projectTarget}
        </div>
      </Card>
      <Card class="relative max-w-[200px]">
        <span
          class="absolute top-2 right-2 inline-flex justify-center items-center w-3.5 h-3.5 text-[10px] rounded-full cursor-help bg-neutral-200 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400"
          title="Average number of projects each engineer is working on. Lower is better — engineers working on fewer projects can focus and deliver faster."
          >i</span
        >
        <div class="pr-6 mb-1 text-xs text-neutral-500 dark:text-neutral-300">
          Avg Projects per IC
        </div>
        <div
          class="text-2xl font-semibold {avgProjectsPerIC <= 1.5
            ? 'text-green-600 dark:text-green-400'
            : 'text-red-600 dark:text-red-400'}"
        >
          {avgProjectsPerIC.toFixed(2)}
        </div>
        <div class="text-xs text-neutral-400 dark:text-neutral-500">
          target: ≤1.5
        </div>
      </Card>
      <Card class="relative max-w-[200px]">
        <span
          class="absolute top-2 right-2 inline-flex justify-center items-center w-3.5 h-3.5 text-[10px] rounded-full cursor-help bg-neutral-200 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400"
          title="Total issues with missing data: missing estimates, missing priority, no recent comments (14+ days), or stale WIP (14+ days in progress)."
          >i</span
        >
        <div class="pr-6 mb-1 text-xs text-neutral-500 dark:text-neutral-300">
          Gaps
        </div>
        <div
          class="text-2xl font-semibold {getGapsColorClass(
            projectViolationsCount + icViolationsCount
          )}"
        >
          {projectViolationsCount + icViolationsCount}
        </div>
        <div class="text-xs text-neutral-400 dark:text-neutral-500">
          target: 0
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

  <!-- Non-project WIP issues (shown when filtering by team) -->
  {#if selectedTeamKey !== null && !loading && !error}
    <Card class="px-4 py-4 mt-8">
      <div class="mb-4 text-sm font-medium text-neutral-300">
        Non-Project Work
        {#if loadingNonProjectWip}
          <span class="ml-2 text-neutral-500">(loading...)</span>
        {:else}
          <span class="ml-2 text-neutral-500"
            >({nonProjectWipIssues.length} issues)</span
          >
        {/if}
      </div>
      {#if loadingNonProjectWip}
        <div class="text-sm text-neutral-400">Loading...</div>
      {:else}
        <IssueTable
          issues={nonProjectWipIssues}
          showAssignee={true}
          showTeam={false}
        />
      {/if}
    </Card>
  {/if}

  <!-- Engineers WIP Stats Tables (shown when filtering by team) -->
  {#if selectedTeamKey !== null && teamProjectEngineers.length > 0 && !loading && !error}
    {@const teamName = teams[0]?.teamName || selectedTeamKey}
    {@const coreTeamEngineers = teamProjectEngineers.filter((e) =>
      hasEngineerMapping
        ? engineerTeamMapping[e.assignee_name] === selectedTeamKey
        : true
    )}
    {@const crossTeamContributors = teamProjectEngineers.filter(
      (e) =>
        hasEngineerMapping &&
        engineerTeamMapping[e.assignee_name] !== selectedTeamKey
    )}

    <!-- Team Engineers Table -->
    {#if coreTeamEngineers.length > 0}
      <Card class="px-4 py-4 mt-8">
        <div class="mb-4 text-sm font-medium text-neutral-300">
          {teamName} Engineers
          <span class="ml-2 text-neutral-500">({coreTeamEngineers.length})</span
          >
        </div>
        <EngineersTable
          engineers={coreTeamEngineers}
          onEngineerClick={onEngineerTableClick}
        />
      </Card>
    {/if}

    <!-- Cross-Team Contributors Table -->
    {#if crossTeamContributors.length > 0}
      <Card class="px-4 py-4 mt-8">
        <div class="mb-4 text-sm font-medium text-neutral-300">
          Cross-team Contributors
          <span class="ml-2 text-neutral-500"
            >({crossTeamContributors.length})</span
          >
        </div>
        <EngineersTable
          engineers={crossTeamContributors}
          onEngineerClick={onEngineerTableClick}
        />
      </Card>
    {/if}
  {/if}

  {#if loadingEngineers && selectedTeamKey !== null}
    <Card class="px-4 py-4 mt-8">
      <div class="text-sm text-neutral-400">Loading engineer data...</div>
    </Card>
  {/if}
</div>

<!-- Engineer Detail Modal -->
{#if selectedEngineer}
  <EngineerDetailModal
    engineer={selectedEngineer}
    onclose={closeEngineerModal}
  />
{/if}

<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import { databaseStore, projectsStore } from "$lib/stores/database";
  import ProjectsTable from "$lib/components/ProjectsTable.svelte";
  import GanttChart from "$lib/components/GanttChart.svelte";
  import IssueTable from "$lib/components/IssueTable.svelte";
  import EngineersTable from "$lib/components/EngineersTable.svelte";
  import EngineerDetailModal from "$lib/components/EngineerDetailModal.svelte";
  import ToggleGroupRoot from "$lib/components/ToggleGroupRoot.svelte";
  import ToggleGroupItem from "$lib/components/ToggleGroupItem.svelte";
  import Card from "$lib/components/Card.svelte";
  import {
    filterProjectsByMode,
    groupProjectsByTeams,
    groupProjectsByDomains,
  } from "$lib/project-data";
  import {
    teamFilterStore,
    teamsMatchFullFilter,
  } from "$lib/stores/team-filter";
  import type { Issue, Engineer } from "../../../db/schema";
  import {
    hasMissingEstimate,
    hasMissingPriority,
    hasNoRecentComment,
    hasWIPAgeViolation,
  } from "../../../utils/issue-validators";
  import {
    getGapsCountStatus,
    getStatusTextColor,
  } from "$lib/utils/status-colors";

  // Props
  interface Props {
    engineerTeamMapping?: Record<string, string>;
  }

  let { engineerTeamMapping = {} }: Props = $props();

  // Engineer detail modal state
  let selectedEngineer = $state<Engineer | null>(null);

  function handleEngineerClick(engineer: Engineer): void {
    selectedEngineer = engineer;
  }

  function closeEngineerModal(): void {
    selectedEngineer = null;
  }

  const onEngineerTableClick = (engineer: any) =>
    handleEngineerClick(engineer as Engineer);

  // View state
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

  // Engineer data for filtered team
  let teamProjectEngineers = $state<Engineer[]>([]);
  let loadingEngineers = $state(false);

  // Load data on mount
  onMount(() => {
    databaseStore.load();
  });

  // Fetch non-project WIP issues and engineer stats when team filter changes
  $effect(() => {
    const filter = $teamFilterStore;
    // Only fetch per-team data when a specific team is selected
    if (!browser || filter.teamKey === null) {
      nonProjectWipIssues = [];
      teamProjectEngineers = [];
      return;
    }

    loadingNonProjectWip = true;
    loadingEngineers = true;

    fetch(`/api/issues/non-project-wip/${encodeURIComponent(filter.teamKey)}`)
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

    fetch(`/api/engineers/wip-stats/${encodeURIComponent(filter.teamKey)}`)
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

  // Derived values from stores
  const loading = $derived($databaseStore.loading);
  const error = $derived($databaseStore.error);
  const projects = $derived($projectsStore);
  const filter = $derived($teamFilterStore);
  const selectedTeamKey = $derived(filter.teamKey);

  const hasEngineerMapping = $derived(
    Object.keys(engineerTeamMapping).length > 0
  );

  // Filter projects based on selected mode and team filter
  const filteredProjects = $derived.by(() => {
    const issues = $databaseStore.issues;
    let filtered = filterProjectsByMode(projects, issues, projectFilter);

    // Apply domain/team filter (uses full filter state for both domain and team filtering)
    if (filter.domain !== null || filter.teamKey !== null) {
      filtered = new Map(
        Array.from(filtered).filter(([_, project]) =>
          teamsMatchFullFilter(project.teams, filter)
        )
      );
    }

    return filtered;
  });

  // Group filtered projects by teams
  const teams = $derived.by(() => {
    const issues = $databaseStore.issues;
    let grouped = groupProjectsByTeams(filteredProjects, issues);

    // Filter to specific team if team filter is set
    if (filter.teamKey !== null) {
      grouped = grouped.filter((team) => team.teamKey === filter.teamKey);
    }
    // Filter to domain's teams if only domain filter is set
    else if (filter.domain !== null) {
      grouped = grouped.filter((team) => team.domain === filter.domain);
    }

    return grouped;
  });

  // Group filtered projects by domains
  const domains = $derived(groupProjectsByDomains(teams));

  // Calculate violations counts
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

  const icViolationsCount = $derived.by(() => {
    if (filteredProjects.size === 0) return 0;
    const issues = $databaseStore.issues;
    const filteredProjectIds = new Set(
      Array.from(filteredProjects.values()).map((p) => p.projectId)
    );

    let relevantIssues = issues.filter(
      (issue) => issue.project_id && filteredProjectIds.has(issue.project_id)
    );

    if (selectedTeamKey !== null && hasEngineerMapping) {
      relevantIssues = relevantIssues.filter(
        (issue) =>
          issue.assignee_name &&
          engineerTeamMapping[issue.assignee_name] === selectedTeamKey
      );
    }

    let count = 0;
    for (const issue of relevantIssues) {
      if (hasMissingEstimate(issue)) count++;
      if (hasMissingPriority(issue)) count++;
      if (hasNoRecentComment(issue)) count++;
      if (hasWIPAgeViolation(issue)) count++;
    }
    return count;
  });

  // IC metrics
  const globalEngineerProjectCounts = $derived.by(() => {
    const counts = new Map<string, number>();
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

  const icMetrics = $derived.by(() => {
    const emptyResult = {
      uniqueICCount: 0,
      avgProjectsPerIC: 0,
      coreEngineers: [] as EngineerStats[],
      additionalICs: [] as EngineerStats[],
    };

    if (filteredProjects.size === 0) return emptyResult;

    const coreEngineerCounts = new Map<string, number>();
    const additionalICCounts = new Map<string, number>();

    for (const project of filteredProjects.values()) {
      for (const engineer of project.engineers) {
        const isCoreEngineer =
          !hasEngineerMapping ||
          selectedTeamKey === null ||
          engineerTeamMapping[engineer] === selectedTeamKey;

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
    if (uniqueICCount === 0) return emptyResult;

    const totalProjectAssignments = Array.from(
      coreEngineerCounts.values()
    ).reduce((sum, count) => sum + count, 0);

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
  const projectTarget = $derived(Math.floor(uniqueICCount / 2));
</script>

<div class="space-y-6">
  <!-- Stats summary -->
  {#if !loading && !error && teams.length > 0}
    <div class="flex flex-wrap gap-4">
      <Card class="max-w-[200px]">
        <div class="mb-1 text-xs text-black-500 dark:text-black-300">Teams</div>
        <div
          class="text-2xl font-semibold text-black-900 dark:text-black-900 dark:text-white"
        >
          {teams.length}
        </div>
      </Card>
      <Card class="relative max-w-[200px]">
        <span
          class="absolute top-2 right-2 inline-flex justify-center items-center w-3.5 h-3.5 text-[10px] rounded-full cursor-help bg-black-200 dark:bg-black-700 text-black-500 dark:text-black-400"
          title="Number of active projects. Target is based on having at least 2 ICs per project."
          >i</span
        >
        <div class="pr-6 mb-1 text-xs text-black-500 dark:text-black-300">
          Projects
        </div>
        <div
          class="text-2xl font-semibold {filteredProjects.size <= projectTarget
            ? 'text-success-600 dark:text-success-400'
            : 'text-danger-600 dark:text-danger-400'}"
        >
          {filteredProjects.size}
        </div>
        <div class="text-xs text-black-400 dark:text-black-500">
          target: ≤{projectTarget}
        </div>
      </Card>
      <Card class="relative max-w-[200px]">
        <span
          class="absolute top-2 right-2 inline-flex justify-center items-center w-3.5 h-3.5 text-[10px] rounded-full cursor-help bg-black-200 dark:bg-black-700 text-black-500 dark:text-black-400"
          title="Average number of projects each engineer is working on."
          >i</span
        >
        <div class="pr-6 mb-1 text-xs text-black-500 dark:text-black-300">
          Avg Projects per IC
        </div>
        <div
          class="text-2xl font-semibold {avgProjectsPerIC <= 1.5
            ? 'text-success-600 dark:text-success-400'
            : 'text-danger-600 dark:text-danger-400'}"
        >
          {avgProjectsPerIC.toFixed(2)}
        </div>
        <div class="text-xs text-black-400 dark:text-black-500">
          target: ≤1.5
        </div>
      </Card>
      <Card class="relative max-w-[200px]">
        <span
          class="absolute top-2 right-2 inline-flex justify-center items-center w-3.5 h-3.5 text-[10px] rounded-full cursor-help bg-black-200 dark:bg-black-700 text-black-500 dark:text-black-400"
          title="Total issues with missing data or violations.">i</span
        >
        <div class="pr-6 mb-1 text-xs text-black-500 dark:text-black-300">
          Gaps
        </div>
        <div
          class="text-2xl font-semibold {getStatusTextColor(
            getGapsCountStatus(projectViolationsCount + icViolationsCount)
          )}"
        >
          {projectViolationsCount + icViolationsCount}
        </div>
        <div class="text-xs text-black-400 dark:text-black-500">target: 0</div>
      </Card>
    </div>
  {/if}

  <!-- View controls -->
  <div class="flex flex-wrap gap-3 items-center py-2">
    <!-- View type toggle -->
    <ToggleGroupRoot bind:value={viewType} variant="outline" type="single">
      <ToggleGroupItem value="table" aria-label="Table view"
        >Table</ToggleGroupItem
      >
      <ToggleGroupItem value="gantt" aria-label="Gantt view"
        >Gantt</ToggleGroupItem
      >
    </ToggleGroupRoot>

    <!-- Group by toggle -->
    <ToggleGroupRoot bind:value={groupBy} variant="outline" type="single">
      <ToggleGroupItem value="team" aria-label="Group by teams"
        >Teams</ToggleGroupItem
      >
      <ToggleGroupItem value="domain" aria-label="Group by domains"
        >Domains</ToggleGroupItem
      >
    </ToggleGroupRoot>

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
        class="flex-none!">WIP</ToggleGroupItem
      >
      <ToggleGroupItem
        value="planning"
        aria-label="Show planned projects"
        class="flex-none!">Plan</ToggleGroupItem
      >
      <ToggleGroupItem
        value="planning-wip"
        aria-label="Show planned and WIP projects"
        class="flex-none!">Plan & WIP</ToggleGroupItem
      >
      <ToggleGroupItem
        value="all"
        aria-label="Show all projects"
        class="flex-none!">All</ToggleGroupItem
      >
    </ToggleGroupRoot>

    <!-- Gantt-specific controls -->
    {#if viewType === "gantt"}
      <ToggleGroupRoot bind:value={endDateMode} variant="outline" type="single">
        <ToggleGroupItem value="predicted" aria-label="Use predicted end dates"
          >Predicted</ToggleGroupItem
        >
        <ToggleGroupItem value="target" aria-label="Use target end dates"
          >Target</ToggleGroupItem
        >
      </ToggleGroupRoot>
      <ToggleGroupRoot
        bind:value={ganttViewMode}
        variant="outline"
        type="single"
      >
        <ToggleGroupItem value="quarter" aria-label="Show current quarter view"
          >Quarter</ToggleGroupItem
        >
        <ToggleGroupItem value="quarters" aria-label="Show 5 quarter view"
          >5 Quarters</ToggleGroupItem
        >
      </ToggleGroupRoot>
    {/if}
  </div>

  <!-- Main content -->
  {#if loading}
    <div class="py-24"></div>
  {:else if error}
    <Card class="border-danger-500/50">
      <div
        class="mb-3 text-sm font-medium text-danger-600 dark:text-danger-400"
      >
        Error Loading Data
      </div>
      <p class="mb-3 text-black-700 dark:text-black-400">{error}</p>
      <p class="text-sm text-black-600 dark:text-black-500">
        Make sure the database is synced. Run: <code
          class="px-2 py-1 font-mono text-xs rounded bg-ambient-700 dark:bg-black-800 text-black-700 dark:text-black-300"
          >bun run sync</code
        >
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

  <!-- Non-project WIP issues (when team filter active) -->
  {#if selectedTeamKey !== null && !loading && !error}
    <Card class="px-4 py-4 mt-8">
      <div class="mb-4 text-sm font-medium text-black-700 dark:text-black-300">
        Non-Project Work
        {#if loadingNonProjectWip}
          <span class="ml-2 text-black-500">(loading...)</span>
        {:else}
          <span class="ml-2 text-black-500"
            >({nonProjectWipIssues.length} issues)</span
          >
        {/if}
      </div>
      {#if loadingNonProjectWip}
        <div class="text-sm text-black-600 dark:text-black-400">Loading...</div>
      {:else}
        <IssueTable
          issues={nonProjectWipIssues}
          showAssignee={true}
          showTeam={false}
        />
      {/if}
    </Card>
  {/if}

  <!-- Engineers WIP Stats Tables (when team filter active) -->
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

    {#if coreTeamEngineers.length > 0}
      <Card class="px-4 py-4 mt-8">
        <div
          class="mb-4 text-sm font-medium text-black-700 dark:text-black-300"
        >
          {teamName} Engineers
          <span class="ml-2 text-black-500">({coreTeamEngineers.length})</span>
        </div>
        <EngineersTable
          engineers={coreTeamEngineers}
          onEngineerClick={onEngineerTableClick}
        />
      </Card>
    {/if}

    {#if crossTeamContributors.length > 0}
      <Card class="px-4 py-4 mt-8">
        <div
          class="mb-4 text-sm font-medium text-black-700 dark:text-black-300"
        >
          Cross-team Contributors
          <span class="ml-2 text-black-500"
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
      <div class="text-sm text-black-600 dark:text-black-400">
        Loading engineer data...
      </div>
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

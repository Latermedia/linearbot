<script lang="ts">
  import { onMount } from "svelte";
  import { slide, fade } from "svelte/transition";
  import { quartOut } from "svelte/easing";
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import Card from "$lib/components/Card.svelte";
  import Skeleton from "$lib/components/Skeleton.svelte";
  import Badge from "$lib/components/Badge.svelte";
  import ProjectsTable from "$lib/components/ProjectsTable.svelte";
  import GanttChart from "$lib/components/GanttChart.svelte";
  import ToggleGroupRoot from "$lib/components/ToggleGroupRoot.svelte";
  import ToggleGroupItem from "$lib/components/ToggleGroupItem.svelte";
  import MetricsHeader from "$lib/components/metrics/MetricsHeader.svelte";
  import PillarCardGrid from "$lib/components/metrics/PillarCardGrid.svelte";
  import TrendsSection from "$lib/components/metrics/TrendsSection.svelte";
  import MiniPillarRow from "$lib/components/metrics/MiniPillarRow.svelte";
  import EngineerDetailModal from "$lib/components/EngineerDetailModal.svelte";
  import { databaseStore, projectsStore } from "$lib/stores/database";
  import { executiveFocus } from "$lib/stores/dashboard";
  import { teamFilterStore, teamsMatchFilter } from "$lib/stores/team-filter";
  import {
    filterProjectsByMode,
    groupProjectsByTeams,
    groupProjectsByDomains,
  } from "$lib/project-data";
  import { Star } from "lucide-svelte";
  import type { MetricsSnapshotV1 } from "../../../types/metrics-snapshot";
  import type { LatestMetricsResponse } from "../../../routes/api/metrics/latest/+server";
  import type {
    TrendDataPoint,
    TrendsResponse,
  } from "../../../routes/api/metrics/trends/+server";
  import type { Issue } from "../../../db/schema";
  import type { Engineer } from "../../../db/schema";
  import IssueTable from "$lib/components/IssueTable.svelte";
  import EngineersTable from "$lib/components/EngineersTable.svelte";

  // Engineer data type for modal
  interface EngineerData {
    assignee_id: string;
    assignee_name: string;
    avatar_url: string | null;
    team_ids: string;
    team_names: string;
    wip_issue_count: number;
    wip_total_points: number;
    wip_limit_violation: number;
    oldest_wip_age_days: number | null;
    last_activity_at: string | null;
    missing_estimate_count: number;
    missing_priority_count: number;
    no_recent_comment_count: number;
    wip_age_violation_count: number;
    active_issues: string;
  }

  // Props
  interface Props {
    engineerTeamMapping?: Record<string, string>;
  }

  let { engineerTeamMapping = {} }: Props = $props();

  // Metrics state
  let metricsLoading = $state(true);
  let metricsError = $state<string | null>(null);
  let orgSnapshot = $state<MetricsSnapshotV1 | null>(null);
  let allSnapshots = $state<
    Array<{
      level: string;
      levelId: string | null;
      snapshot: MetricsSnapshotV1;
      capturedAt: string;
    }>
  >([]);
  let teamNames = $state<Record<string, string>>({});

  // Trend data state
  let trendDataPoints = $state<TrendDataPoint[]>([]);
  let trendLoading = $state(true);
  let showTrends = $state(false);

  // Engineer modal state
  let allEngineers = $state<EngineerData[]>([]);
  let selectedEngineer = $state<EngineerData | null>(null);

  // Pillar click handler - navigate to dedicated metric pages
  function handlePillarClick(
    pillar: "wipHealth" | "projectHealth" | "productivity" | "quality"
  ) {
    const routes: Record<string, string> = {
      wipHealth: "/wip-health",
      projectHealth: "/project-health",
      productivity: "/productivity",
      quality: "/quality",
    };
    goto(routes[pillar]);
  }

  // Non-project WIP issues state
  let nonProjectWipIssues = $state<Issue[]>([]);
  let nonProjectWipLoading = $state(false);

  // Team engineers state (engineers from ENGINEER_TEAM_MAPPING working on team projects)
  let teamProjectEngineers = $state<Engineer[]>([]);

  // Fetch engineers for modal
  async function fetchEngineers() {
    if (!browser) return;
    try {
      const response = await fetch("/api/engineers");
      const data = await response.json();
      allEngineers = data.engineers || [];
    } catch (e) {
      console.error("Failed to fetch engineers:", e);
    }
  }

  // Fetch non-project WIP issues for a team
  async function fetchNonProjectWipIssues(teamKey: string) {
    if (!browser) return;
    nonProjectWipLoading = true;
    try {
      const response = await fetch(`/api/issues/non-project-wip/${teamKey}`);
      const data = await response.json();
      nonProjectWipIssues = data.issues || [];
    } catch (e) {
      console.error("Failed to fetch non-project WIP issues:", e);
      nonProjectWipIssues = [];
    } finally {
      nonProjectWipLoading = false;
    }
  }

  // Fetch engineers working on team projects
  async function fetchTeamProjectEngineers(teamKey: string) {
    if (!browser) return;
    try {
      const response = await fetch(`/api/engineers/wip-stats/${teamKey}`);
      const data = await response.json();
      teamProjectEngineers = data.engineers || [];
    } catch (e) {
      console.error("Failed to fetch team project engineers:", e);
      teamProjectEngineers = [];
    }
  }

  // Handle engineer click from PillarCardGrid
  function handleEngineerClick(engineerId: string) {
    const engineer = allEngineers.find((e) => e.assignee_id === engineerId);
    if (engineer) {
      selectedEngineer = engineer;
    }
  }

  function closeEngineerModal() {
    selectedEngineer = null;
  }

  // View state
  let groupBy = $state<"team" | "domain">("team");
  let viewType = $state<"table" | "gantt">("table");
  let endDateMode = $state<"predicted" | "target">("predicted");
  let projectFilter = $state<"planning" | "wip" | "planning-wip" | "all">(
    "wip"
  );
  let ganttViewMode = $state<"quarter" | "quarters">("quarters");

  // Fetch metrics data
  async function fetchMetrics() {
    if (!browser) return;

    metricsLoading = true;
    metricsError = null;

    try {
      // Fetch all latest snapshots
      const response = await fetch("/api/metrics/latest?all=true");
      const data = (await response.json()) as LatestMetricsResponse;

      if (!data.success) {
        metricsError = data.error || "Failed to fetch metrics";
        return;
      }

      allSnapshots = data.snapshots || [];
      teamNames = data.teamNames || {};

      // Extract org snapshot
      const org = allSnapshots.find((s) => s.level === "org");
      orgSnapshot = org?.snapshot || null;
    } catch (e) {
      metricsError = e instanceof Error ? e.message : "Failed to fetch metrics";
    } finally {
      metricsLoading = false;
    }
  }

  // Fetch trend data for all-time view
  async function fetchTrendData() {
    if (!browser) return;

    trendLoading = true;

    try {
      // Fetch all available trend data (high limit to get all-time data)
      const response = await fetch("/api/metrics/trends?level=org&limit=10000");
      const data = (await response.json()) as TrendsResponse;

      if (data.success && data.dataPoints) {
        // Sort by capturedAt ascending (oldest first, time flows left to right)
        trendDataPoints = data.dataPoints.sort(
          (a, b) =>
            new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime()
        );
      }
    } catch (e) {
      console.error("Failed to fetch trend data:", e);
    } finally {
      trendLoading = false;
    }
  }

  // Load on mount
  onMount(() => {
    fetchMetrics();
    fetchTrendData();
    fetchEngineers();
    databaseStore.load();
  });

  // Fetch team-specific data when team filter changes
  $effect(() => {
    if (selectedTeamKey) {
      fetchNonProjectWipIssues(selectedTeamKey);
      fetchTeamProjectEngineers(selectedTeamKey);
    } else {
      nonProjectWipIssues = [];
      teamProjectEngineers = [];
    }
  });

  // Derived values from stores
  const loading = $derived($databaseStore.loading);
  const error = $derived($databaseStore.error);
  const projects = $derived($projectsStore);
  const selectedTeamKey = $derived($teamFilterStore);
  const isExecutiveFocus = $derived($executiveFocus);

  // Display snapshot: use team filter snapshot or org snapshot
  const displaySnapshot = $derived.by((): MetricsSnapshotV1 | null => {
    // If team filter is active, show team snapshot
    if (selectedTeamKey) {
      const teamSnapshot = allSnapshots.find(
        (s) => s.level === "team" && s.levelId === selectedTeamKey
      );
      if (teamSnapshot) {
        return teamSnapshot.snapshot;
      }
    }

    return orgSnapshot;
  });

  // Get team snapshots map for quick lookup
  const teamSnapshotsMap = $derived.by(() => {
    const map = new Map<string, MetricsSnapshotV1>();
    for (const s of allSnapshots) {
      if (s.level === "team" && s.levelId) {
        map.set(s.levelId, s.snapshot);
      }
    }
    return map;
  });

  // Get domain snapshots map
  const domainSnapshotsMap = $derived.by(() => {
    const map = new Map<string, MetricsSnapshotV1>();
    for (const s of allSnapshots) {
      if (s.level === "domain" && s.levelId) {
        map.set(s.levelId, s.snapshot);
      }
    }
    return map;
  });

  // Build project health map from org snapshot's projectStatuses
  const projectHealthMap = $derived.by(() => {
    const map = new Map<
      string,
      {
        effectiveHealth: string;
        healthSource: "human" | "velocity";
        linearHealth: string | null;
        calculatedHealth: string;
      }
    >();

    if (orgSnapshot?.velocityHealth?.projectStatuses) {
      for (const ps of orgSnapshot.velocityHealth.projectStatuses) {
        map.set(ps.projectId, {
          effectiveHealth: ps.effectiveHealth,
          healthSource: ps.healthSource,
          linearHealth: ps.linearHealth,
          calculatedHealth: ps.calculatedHealth,
        });
      }
    }

    return map;
  });

  // Filter projects based on selected mode, team filter, and executive focus
  const filteredProjects = $derived.by(() => {
    const issues = $databaseStore.issues;
    let filtered = filterProjectsByMode(projects, issues, projectFilter);

    // Apply executive focus filter
    if (isExecutiveFocus) {
      filtered = new Map(
        Array.from(filtered).filter(([_, project]) =>
          project.labels.includes("Executive Visibility")
        )
      );
    }

    // Apply team filter
    if (selectedTeamKey !== null) {
      filtered = new Map(
        Array.from(filtered).filter(([_, project]) =>
          teamsMatchFilter(project.teams, selectedTeamKey)
        )
      );
    }

    return filtered;
  });

  // Group filtered projects by teams
  const teams = $derived.by(() => {
    const issues = $databaseStore.issues;
    let grouped = groupProjectsByTeams(filteredProjects, issues);

    if (selectedTeamKey !== null) {
      grouped = grouped.filter((team) => team.teamKey === selectedTeamKey);
    }

    return grouped;
  });

  // Group filtered projects by domains
  const domains = $derived(groupProjectsByDomains(teams));

  // Get team display name
  function getTeamDisplayName(teamKey: string): string {
    const fullName = teamNames[teamKey];
    if (fullName) {
      return `${fullName} (${teamKey})`;
    }
    return teamKey;
  }

  // Get engineers from ENGINEER_TEAM_MAPPING for the selected team
  const teamMappedEngineers = $derived.by((): EngineerData[] => {
    if (!selectedTeamKey || Object.keys(engineerTeamMapping).length === 0) {
      return [];
    }

    // Get engineer names mapped to the selected team
    const mappedNames = new Set<string>();
    for (const [name, teamKey] of Object.entries(engineerTeamMapping)) {
      if (teamKey === selectedTeamKey) {
        mappedNames.add(name);
      }
    }

    // Filter allEngineers to only those mapped to this team
    return allEngineers.filter((e) => mappedNames.has(e.assignee_name));
  });

  // Get cross-team collaborators (engineers NOT in team mapping but working on team's projects)
  const crossTeamCollaborators = $derived.by((): EngineerData[] => {
    if (!selectedTeamKey || Object.keys(engineerTeamMapping).length === 0) {
      return [];
    }

    // Get engineer names mapped to the selected team
    const mappedNames = new Set<string>();
    for (const [name, teamKey] of Object.entries(engineerTeamMapping)) {
      if (teamKey === selectedTeamKey) {
        mappedNames.add(name);
      }
    }

    // Filter teamProjectEngineers to only those NOT in the team mapping
    // Cast to EngineerData since Engineer has compatible fields
    return teamProjectEngineers
      .filter((e) => !mappedNames.has(e.assignee_name))
      .map(
        (e) =>
          ({
            assignee_id: e.assignee_id,
            assignee_name: e.assignee_name,
            avatar_url: e.avatar_url,
            team_ids: e.team_ids,
            team_names: e.team_names,
            wip_issue_count: e.wip_issue_count,
            wip_total_points: e.wip_total_points,
            wip_limit_violation: e.wip_limit_violation,
            oldest_wip_age_days: e.oldest_wip_age_days,
            last_activity_at: e.last_activity_at,
            missing_estimate_count: e.missing_estimate_count,
            missing_priority_count: e.missing_priority_count,
            no_recent_comment_count: e.no_recent_comment_count,
            wip_age_violation_count: e.wip_age_violation_count,
            active_issues: e.active_issues,
          }) as EngineerData
      );
  });
</script>

<div class="space-y-6">
  <!-- Header with rotating principles -->
  <MetricsHeader
    title="Overview"
    {showTrends}
    onToggleTrends={() => (showTrends = !showTrends)}
  />

  <!-- Org-Level Health Metrics + Trends (grouped to avoid space-y-6 affecting animation) -->
  <div>
    <PillarCardGrid
      snapshot={displaySnapshot}
      loading={metricsLoading && !orgSnapshot}
      error={metricsError}
      productivityUnderConstruction={selectedTeamKey !== null}
      onPillarClick={handlePillarClick}
      onEngineerClick={handleEngineerClick}
      {engineerTeamMapping}
      {selectedTeamKey}
    />

    {#if showTrends}
      <div
        class="mt-6 overflow-hidden"
        transition:slide={{ duration: 300, easing: quartOut }}
      >
        <div transition:fade={{ duration: 200, easing: quartOut }}>
          <TrendsSection
            dataPoints={trendDataPoints}
            loading={trendLoading}
            title=""
            noMargin
          />
        </div>
      </div>
    {/if}
  </div>

  <!-- View controls -->
  <div
    class="flex flex-wrap gap-3 items-center py-2 mt-8 border-t border-white/10 pt-6"
  >
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

    <!-- Executive Focus indicator -->
    {#if isExecutiveFocus}
      <div
        class="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 rounded"
      >
        <Star class="w-3.5 h-3.5" />
        <span>Executive Focus</span>
      </div>
    {/if}
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
    </Card>
  {:else if groupBy === "domain"}
    <!-- Domain View -->
    {#each domains as domain (domain.domainName)}
      <Card class="p-0 overflow-hidden">
        <!-- Domain Header with Mini Pillars -->
        <div
          class="flex flex-wrap items-center justify-between gap-4 px-4 py-3 border-b border-white/10 bg-white/5"
        >
          <div class="flex items-center gap-3">
            <h2 class="text-lg font-semibold text-white">
              {domain.domainName}
            </h2>
            <Badge variant="outline">{domain.teams.length} teams</Badge>
          </div>
          <MiniPillarRow
            snapshot={domainSnapshotsMap.get(domain.domainName) || null}
            productivityUnderConstruction={false}
            loading={metricsLoading}
          />
        </div>

        <!-- Projects -->
        <div class="p-4">
          {#if viewType === "table"}
            {#key `${projectFilter}-${domain.domainName}`}
              <ProjectsTable
                teams={domain.teams}
                domains={[domain]}
                groupBy="team"
                {projectHealthMap}
              />
            {/key}
          {:else}
            {#key `${projectFilter}-${endDateMode}-${ganttViewMode}-${domain.domainName}`}
              <GanttChart
                teams={domain.teams}
                domains={[domain]}
                groupBy="team"
                {endDateMode}
                viewMode={ganttViewMode}
              />
            {/key}
          {/if}
        </div>
      </Card>
    {/each}

    {#if domains.length === 0}
      <Card>
        <div class="py-8 text-center">
          <div class="mb-2 text-neutral-400">No domains found</div>
          <p class="text-sm text-neutral-500">
            {selectedTeamKey
              ? "No projects match the current team filter."
              : "No projects found with the current filters."}
          </p>
        </div>
      </Card>
    {/if}
  {:else}
    <!-- Team View -->
    {#each teams as team (team.teamKey)}
      <Card class="p-0 overflow-hidden">
        <!-- Team Header with Mini Pillars -->
        <div
          class="flex flex-wrap items-center justify-between gap-4 px-4 py-3 border-b border-white/10 bg-white/5"
        >
          <div class="flex items-center gap-3">
            <h2 class="text-lg font-semibold text-white">
              {getTeamDisplayName(team.teamKey)}
            </h2>
            <Badge variant="outline">{team.projects.length} projects</Badge>
          </div>
          <MiniPillarRow
            snapshot={teamSnapshotsMap.get(team.teamKey) || null}
            productivityUnderConstruction={true}
            loading={metricsLoading}
          />
        </div>

        <!-- Projects -->
        <div class="p-4">
          {#if viewType === "table"}
            {#key `${projectFilter}-${team.teamKey}`}
              <ProjectsTable
                teams={[team]}
                domains={[]}
                groupBy="team"
                embedded={true}
                {projectHealthMap}
              />
            {/key}
          {:else}
            {#key `${projectFilter}-${endDateMode}-${ganttViewMode}-${team.teamKey}`}
              <GanttChart
                teams={[team]}
                domains={[]}
                groupBy="team"
                embedded={true}
                {endDateMode}
                viewMode={ganttViewMode}
              />
            {/key}
          {/if}
        </div>
      </Card>
    {/each}

    {#if teams.length === 0}
      <Card>
        <div class="py-8 text-center">
          <div class="mb-2 text-neutral-400">No teams found</div>
          <p class="text-sm text-neutral-500">
            {selectedTeamKey
              ? "No projects match the current team filter."
              : "No projects found with the current filters."}
          </p>
        </div>
      </Card>
    {/if}
  {/if}

  <!-- Team-specific sections (only shown when a team is selected) -->
  {#if selectedTeamKey}
    <!-- Non-Project WIP Issues Section -->
    {#if nonProjectWipIssues.length > 0 || nonProjectWipLoading}
      <Card class="p-0 overflow-hidden mt-6">
        <div
          class="flex flex-wrap items-center justify-between gap-4 px-4 py-3 border-b border-white/10 bg-white/5"
        >
          <div class="flex items-center gap-3">
            <h2 class="text-lg font-semibold text-white">
              Non-Project WIP Issues
            </h2>
            <Badge variant="outline">{nonProjectWipIssues.length} issues</Badge>
          </div>
        </div>
        <div class="p-4">
          {#if nonProjectWipLoading}
            <div class="py-4 text-center text-neutral-400">Loading...</div>
          {:else}
            <IssueTable
              issues={nonProjectWipIssues}
              showAssignee={true}
              showTeam={false}
              groupByState={false}
              noMaxHeight={true}
            />
          {/if}
        </div>
      </Card>
    {/if}

    <!-- Team Engineers Section (from ENGINEER_TEAM_MAPPING) -->
    {#if teamMappedEngineers.length > 0}
      <Card class="p-0 overflow-hidden mt-6">
        <div
          class="flex flex-wrap items-center justify-between gap-4 px-4 py-3 border-b border-white/10 bg-white/5"
        >
          <div class="flex items-center gap-3">
            <h2 class="text-lg font-semibold text-white">
              {getTeamDisplayName(selectedTeamKey)} Engineers
            </h2>
            <Badge variant="outline"
              >{teamMappedEngineers.length} engineers</Badge
            >
          </div>
        </div>
        <div class="p-4">
          <EngineersTable
            engineers={teamMappedEngineers}
            onEngineerClick={(engineer) => {
              selectedEngineer = engineer;
            }}
          />
        </div>
      </Card>
    {/if}

    <!-- Cross-Team Collaborators Section -->
    {#if crossTeamCollaborators.length > 0}
      <Card class="p-0 overflow-hidden mt-6">
        <div
          class="flex flex-wrap items-center justify-between gap-4 px-4 py-3 border-b border-white/10 bg-white/5"
        >
          <div class="flex items-center gap-3">
            <h2 class="text-lg font-semibold text-white">
              Cross-Team Collaborators
            </h2>
            <Badge variant="outline"
              >{crossTeamCollaborators.length} engineers</Badge
            >
          </div>
          <span class="text-xs text-neutral-400">
            Engineers from other teams working on {getTeamDisplayName(
              selectedTeamKey
            )} projects
          </span>
        </div>
        <div class="p-4">
          <EngineersTable
            engineers={crossTeamCollaborators}
            onEngineerClick={(engineer) => {
              selectedEngineer = engineer;
            }}
          />
        </div>
      </Card>
    {/if}
  {/if}
</div>

<!-- Engineer Detail Modal -->
{#if selectedEngineer}
  <EngineerDetailModal
    engineer={selectedEngineer}
    onclose={closeEngineerModal}
  />
{/if}

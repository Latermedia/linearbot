<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import Card from "$lib/components/Card.svelte";
  import Badge from "$lib/components/Badge.svelte";
  import { pageLoading } from "$lib/stores/page-loading";
  import TeamFilterNotice from "$lib/components/TeamFilterNotice.svelte";
  import ProjectsTable from "$lib/components/ProjectsTable.svelte";
  import GanttChart from "$lib/components/GanttChart.svelte";
  import ToggleGroupRoot from "$lib/components/ToggleGroupRoot.svelte";
  import ToggleGroupItem from "$lib/components/ToggleGroupItem.svelte";
  import MiniPillarRow from "$lib/components/metrics/MiniPillarRow.svelte";
  import TrendChip from "$lib/components/metrics/TrendChip.svelte";
  import { projectsStore, databaseStore } from "$lib/stores/database";
  import {
    teamFilterStore,
    teamsMatchFullFilter,
  } from "$lib/stores/team-filter";
  import {
    filterProjectsByMode,
    groupProjectsByTeams,
    groupProjectsByDomains,
  } from "$lib/project-data";
  import { getDomainForTeam } from "../../utils/domain-mapping";
  import {
    calculateMetricTrends,
    metricExtractors,
  } from "$lib/utils/trend-calculation";
  import type {
    VelocityHealthV1,
    MetricsSnapshotV1,
  } from "../../types/metrics-snapshot";
  import type { LatestMetricsResponse } from "../api/metrics/latest/+server";
  import type {
    TrendDataPoint,
    TrendsResponse,
  } from "../api/metrics/trends/+server";

  // Domain project health data for table
  interface DomainProjectHealth {
    domainName: string;
    onTrackPercent: number;
    atRiskPercent: number;
    offTrackPercent: number;
    totalProjects: number;
    onTrackCount: number;
    atRiskCount: number;
    offTrackCount: number;
    status: string;
  }

  // Data state
  let loading = $state(true);
  let error = $state<string | null>(null);
  let velocityHealth = $state<VelocityHealthV1 | null>(null);
  let allSnapshots = $state<
    Array<{
      level: string;
      levelId: string | null;
      snapshot: MetricsSnapshotV1;
      capturedAt: string;
    }>
  >([]);

  // Trend data state
  let trendDataPoints = $state<TrendDataPoint[]>([]);

  // View state for project list
  let groupBy = $state<"team" | "domain">("team");
  let viewType = $state<"table" | "gantt">("table");
  let endDateMode = $state<"predicted" | "target">("predicted");
  let projectFilter = $state<"planning" | "wip" | "planning-wip" | "all">(
    "wip"
  );
  let ganttViewMode = $state<"quarter" | "quarters">("quarters");

  // Get team names for display
  let teamNames = $state<Record<string, string>>({});

  // KaTeX for rendering math formulas
  let katex: typeof import("katex") | null = null;
  let formulaHtml = $state("");

  // Fetch trend data based on current filter
  async function fetchTrendData(level: string, levelId: string | null) {
    if (!browser) return;
    try {
      const params = new URLSearchParams({ level, limit: "10000" });
      if (levelId) params.set("levelId", levelId);

      const res = await fetch(`/api/metrics/trends?${params}`);
      const data = (await res.json()) as TrendsResponse;

      if (data.success && data.dataPoints) {
        trendDataPoints = data.dataPoints.sort(
          (a, b) =>
            new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime()
        );
      } else {
        trendDataPoints = [];
      }
    } catch (e) {
      console.error("Failed to fetch trend data:", e);
      trendDataPoints = [];
    }
  }

  // Initial setup
  onMount(async () => {
    if (!browser) return;

    // Signal loading to sidebar
    pageLoading.startLoading("/project-health");

    // Load database store for project details modal and project list
    databaseStore.load();

    // Load KaTeX
    katex = await import("katex");
    if (katex) {
      formulaHtml = katex.default.renderToString(
        "\\text{Project Health} = \\frac{\\text{On-Track Projects}}{\\text{Total Projects}} \\times 100",
        { throwOnError: false, displayMode: true }
      );
    }

    // Fetch all metrics snapshots (including domain-level)
    try {
      const metricsRes = await fetch("/api/metrics/latest?all=true");
      const metricsData = (await metricsRes.json()) as LatestMetricsResponse;

      if (!metricsData.success) {
        error = metricsData.error || "Failed to fetch metrics";
        return;
      }

      allSnapshots = metricsData.snapshots || [];
      teamNames = metricsData.teamNames || {};

      // Extract org-level velocity health
      const orgSnapshot = allSnapshots.find((s) => s.level === "org");
      velocityHealth = orgSnapshot?.snapshot?.velocityHealth || null;

      // Fetch initial org-level trends
      await fetchTrendData("org", null);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load data";
    } finally {
      loading = false;
      pageLoading.stopLoading("/project-health");
    }
  });

  // Re-fetch trends when filter changes
  $effect(() => {
    if (!browser || loading) return;

    // Team filter takes precedence for trend data
    if (activeTeamFilter) {
      fetchTrendData("team", activeTeamFilter);
    } else if (activeDomainFilter) {
      fetchTrendData("domain", activeDomainFilter);
    } else {
      fetchTrendData("org", null);
    }
  });

  // Calculate WoW and MoM trends
  const projectHealthTrends = $derived(
    calculateMetricTrends(trendDataPoints, metricExtractors.projectHealth)
  );

  // Check if any trend data is limited (actual days < expected)
  const hasLimitedTrendData = $derived.by(() => {
    const weekLimited =
      projectHealthTrends.week.hasEnoughData &&
      (projectHealthTrends.week.actualDays ?? 7) < 7;
    const monthLimited =
      projectHealthTrends.month.hasEnoughData &&
      (projectHealthTrends.month.actualDays ?? 30) < 30;
    return weekLimited || monthLimited;
  });

  // Get current filter state
  const filter = $derived($teamFilterStore);

  // Active team filter (direct team selection)
  const activeTeamFilter = $derived(filter.teamKey);

  // Determine active domain filter (from domain selection or derived from team)
  const activeDomainFilter = $derived.by(() => {
    if (filter.teamKey) {
      return getDomainForTeam(filter.teamKey);
    }
    return filter.domain;
  });

  // Get filtered team snapshot for hero metrics (when team filter is active)
  const filteredTeamVelocity = $derived.by((): VelocityHealthV1 | null => {
    if (!activeTeamFilter) return null;
    const teamSnapshot = allSnapshots.find(
      (s) =>
        s.level === "team" &&
        s.levelId?.toUpperCase() === activeTeamFilter.toUpperCase()
    );
    return teamSnapshot?.snapshot?.velocityHealth || null;
  });

  // Get filtered domain snapshot for hero metrics (when domain filter is active but no team filter)
  const filteredDomainVelocity = $derived.by((): VelocityHealthV1 | null => {
    // Team filter takes precedence
    if (activeTeamFilter) return null;
    if (!activeDomainFilter) return null;
    const domainSnapshot = allSnapshots.find(
      (s) => s.level === "domain" && s.levelId === activeDomainFilter
    );
    return domainSnapshot?.snapshot?.velocityHealth || null;
  });

  // Use filtered team health if team filter is active, then domain, then org-level
  const displayVelocity = $derived(
    filteredTeamVelocity || filteredDomainVelocity || velocityHealth
  );

  // Derived counts (from display velocity, which respects filter)
  const projectStatuses = $derived(displayVelocity?.projectStatuses || []);
  const totalProjects = $derived(projectStatuses.length);
  const onTrackCount = $derived(
    projectStatuses.filter((p) => p.effectiveHealth === "onTrack").length
  );
  const atRiskCount = $derived(
    projectStatuses.filter((p) => p.effectiveHealth === "atRisk").length
  );
  const offTrackCount = $derived(
    projectStatuses.filter((p) => p.effectiveHealth === "offTrack").length
  );

  // Breakdown by source
  const atRiskHuman = $derived(
    projectStatuses.filter(
      (p) => p.effectiveHealth === "atRisk" && p.healthSource === "human"
    ).length
  );
  const atRiskVelocity = $derived(
    projectStatuses.filter(
      (p) => p.effectiveHealth === "atRisk" && p.healthSource === "velocity"
    ).length
  );
  const offTrackHuman = $derived(
    projectStatuses.filter(
      (p) => p.effectiveHealth === "offTrack" && p.healthSource === "human"
    ).length
  );
  const offTrackVelocity = $derived(
    projectStatuses.filter(
      (p) => p.effectiveHealth === "offTrack" && p.healthSource === "velocity"
    ).length
  );

  // Computed status (uses displayVelocity to respect team filter)
  const computedStatus = $derived.by(
    ():
      | "peakFlow"
      | "strongRhythm"
      | "steadyProgress"
      | "earlyTraction"
      | "lowTraction" => {
      const pct = displayVelocity?.onTrackPercent ?? 0;
      if (pct > 80) return "peakFlow";
      if (pct > 60) return "strongRhythm";
      if (pct > 40) return "steadyProgress";
      if (pct > 20) return "earlyTraction";
      return "lowTraction";
    }
  );

  // Status text colors for the large metric
  const statusTextColors: Record<string, string> = {
    peakFlow: "text-success-400",
    strongRhythm: "text-success-500",
    steadyProgress: "text-warning-500",
    earlyTraction: "text-danger-500",
    lowTraction: "text-danger-600",
    unknown: "text-black-600 dark:text-black-400",
  };

  // Extract domain-level project health data for overview table (only shown when no team filter)
  const domainProjectHealthData = $derived.by((): DomainProjectHealth[] => {
    // Don't show domain breakdown when team filter is active
    if (activeTeamFilter) return [];

    const domainList: DomainProjectHealth[] = [];

    for (const snapshot of allSnapshots) {
      if (snapshot.level !== "domain" || !snapshot.levelId) continue;

      // Filter by active domain if set
      if (activeDomainFilter && snapshot.levelId !== activeDomainFilter)
        continue;

      const velocity = snapshot.snapshot.velocityHealth;
      if (!velocity) continue;

      const total = velocity.projectStatuses.length;
      const onTrack = velocity.projectStatuses.filter(
        (p) => p.effectiveHealth === "onTrack"
      ).length;
      const atRisk = velocity.projectStatuses.filter(
        (p) => p.effectiveHealth === "atRisk"
      ).length;
      const offTrack = velocity.projectStatuses.filter(
        (p) => p.effectiveHealth === "offTrack"
      ).length;

      domainList.push({
        domainName: snapshot.levelId,
        onTrackPercent: velocity.onTrackPercent,
        atRiskPercent: velocity.atRiskPercent,
        offTrackPercent: velocity.offTrackPercent,
        totalProjects: total,
        onTrackCount: onTrack,
        atRiskCount: atRisk,
        offTrackCount: offTrack,
        status: velocity.status,
      });
    }

    // Sort by on-track percent (ascending - domains needing attention first)
    return domainList.sort((a, b) => a.onTrackPercent - b.onTrackPercent);
  });

  // Derived values from stores for project list
  const projects = $derived($projectsStore);
  const selectedTeamKey = $derived(filter.teamKey);

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

    const orgSnapshot = allSnapshots.find((s) => s.level === "org");
    if (orgSnapshot?.snapshot?.velocityHealth?.projectStatuses) {
      for (const ps of orgSnapshot.snapshot.velocityHealth.projectStatuses) {
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

  // Get team display name
  function getTeamDisplayName(teamKey: string): string {
    const fullName = teamNames[teamKey];
    if (fullName) {
      return `${fullName} (${teamKey})`;
    }
    return teamKey;
  }
</script>

<div class="space-y-6">
  <!-- Page Title -->
  <div class="flex flex-wrap items-center justify-between gap-4">
    <h1 class="text-2xl font-semibold text-black-900 dark:text-white">
      Project Health
    </h1>
    <TeamFilterNotice showLevelNotice={false} />
  </div>

  {#if loading}
    <!-- Loading handled by sidebar icon animation -->
    <div class="py-24"></div>
  {:else if error}
    <!-- Error state -->
    <Card class="border-danger-500/50">
      <div
        class="mb-3 text-sm font-medium text-danger-600 dark:text-danger-400"
      >
        Error Loading Data
      </div>
      <p class="text-black-700 dark:text-black-400">{error}</p>
    </Card>
  {:else if displayVelocity}
    <!-- Marquee Hero Section -->
    <div class="py-8 border-b border-black-200 dark:border-white/10">
      <!-- Large metric -->
      <div class="flex items-baseline justify-center gap-4 mb-3">
        <span
          class="text-8xl lg:text-9xl font-bold tracking-tight drop-shadow-sm dark:drop-shadow-none {statusTextColors[
            computedStatus
          ]}"
        >
          {displayVelocity.onTrackPercent.toFixed(0)}<span
            class="text-5xl lg:text-6xl font-normal text-black-600 dark:text-black-400"
            >%</span
          >
        </span>
      </div>

      <!-- 7d/30d Trend Chips -->
      <div class="flex items-center justify-center gap-2 mb-2">
        {#if projectHealthTrends.week.hasEnoughData}
          {@const actualDays = projectHealthTrends.week.actualDays ?? 7}
          {@const isLimited = actualDays < 7}
          <TrendChip
            direction={projectHealthTrends.week.direction}
            percentChange={projectHealthTrends.week.percentChange}
            period="7d"
            higherIsBetter={true}
            {isLimited}
            tooltip={isLimited
              ? `Based on ${actualDays} days of data`
              : undefined}
          />
        {/if}
        {#if projectHealthTrends.month.hasEnoughData}
          {@const actualDays = projectHealthTrends.month.actualDays ?? 30}
          {@const isLimited = actualDays < 30}
          <TrendChip
            direction={projectHealthTrends.month.direction}
            percentChange={projectHealthTrends.month.percentChange}
            period="30d"
            higherIsBetter={true}
            {isLimited}
            tooltip={isLimited
              ? `Based on ${actualDays} days of data`
              : undefined}
          />
        {/if}
      </div>
      {#if hasLimitedTrendData}
        <p class="text-center text-[10px] text-black-500 mb-2">
          * Based on available historical data
        </p>
      {/if}

      <!-- Subtitle -->
      <p class="text-center text-xl text-black-600 dark:text-black-400 mb-2">
        Projects on track to meet their target dates
      </p>
      <p class="text-center text-sm text-black-500">
        {onTrackCount} of {totalProjects} projects
        <Badge status={computedStatus} class="ml-2" />
      </p>

      <!-- Breakdown row -->
      <div class="flex items-center justify-center gap-8 lg:gap-16 mt-8">
        <!-- At Risk total -->
        <div class="text-center">
          <div
            class="text-4xl lg:text-5xl font-bold text-black-900 dark:text-white"
          >
            {atRiskCount}
          </div>
          <div class="text-sm text-black-600 dark:text-black-400 mt-1">
            At Risk
          </div>
          <div class="text-xs text-black-500">need monitoring</div>
        </div>

        <!-- Divider -->
        <div class="h-12 w-px bg-ambient-700 dark:bg-white/10"></div>

        <!-- Off Track total -->
        <div class="text-center">
          <div
            class="text-4xl lg:text-5xl font-bold text-black-900 dark:text-white"
          >
            {offTrackCount}
          </div>
          <div class="text-sm text-black-600 dark:text-black-400 mt-1">
            Off Track
          </div>
          <div class="text-xs text-black-500">need intervention</div>
        </div>

        <!-- Divider -->
        <div class="h-12 w-px bg-ambient-700 dark:bg-white/10"></div>

        <!-- Self-reported breakdown -->
        <div class="text-center opacity-70">
          <div
            class="text-3xl lg:text-4xl font-bold text-black-900 dark:text-white"
          >
            {atRiskHuman + offTrackHuman}
          </div>
          <div class="text-sm text-black-600 dark:text-black-400 mt-1">
            Self-reported
          </div>
        </div>

        <!-- Divider -->
        <div class="h-12 w-px bg-ambient-700 dark:bg-white/10"></div>

        <!-- Trajectory Alert breakdown -->
        <div class="text-center opacity-70">
          <div
            class="text-3xl lg:text-4xl font-bold text-black-900 dark:text-white"
          >
            {atRiskVelocity + offTrackVelocity}
          </div>
          <div class="text-sm text-black-600 dark:text-black-400 mt-1">
            Trajectory Alert
          </div>
        </div>
      </div>
    </div>

    <!-- Why & How row -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-6">
      <!-- Why this matters -->
      <div class="space-y-2">
        <h3 class="text-xs font-medium text-black-500 uppercase tracking-wider">
          Why this matters
        </h3>
        <p class="text-sm text-black-600 dark:text-black-400 leading-relaxed">
          Early detection of at-risk projects enables proactive intervention
          before deadlines slip. Combining self-reported status with
          velocity-based trajectory alerts catches blind spots that either
          source alone would miss.
        </p>
      </div>

      <!-- How it's calculated -->
      <div class="space-y-2">
        <h3 class="text-xs font-medium text-black-500 uppercase tracking-wider">
          How it's calculated
        </h3>
        <p class="text-sm text-black-600 dark:text-black-400">
          A project is "on track" when both <strong
            class="text-black-700 dark:text-black-300"
            >self-reported status</strong
          >
          is healthy AND the
          <strong class="text-black-700 dark:text-black-300"
            >velocity trajectory</strong
          > predicts completion within 14 days of the target date.
        </p>

        <!-- Formula -->
        {#if formulaHtml}
          <div
            class="py-3 px-4 rounded-md bg-ambient-700 dark:bg-black-800/50 border border-black-200 dark:border-white/5 formula-container overflow-x-auto mt-3"
          >
            <!-- eslint-disable-next-line svelte/no-at-html-tags -->
            {@html formulaHtml}
          </div>
        {/if}
      </div>
    </div>

    <!-- Domain Project Health Table -->
    {#if domainProjectHealthData.length > 0}
      <Card class="p-0 overflow-hidden">
        <div
          class="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-ambient-600 dark:bg-white/5"
        >
          <h3 class="text-sm font-medium text-black-900 dark:text-white">
            Domain Overview ({domainProjectHealthData.length})
          </h3>
          <span class="text-xs text-black-500">Project health by domain</span>
        </div>
        <div class="p-4">
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead>
                <tr
                  class="text-left text-xs font-medium text-black-500 uppercase tracking-wider border-b border-black-200 dark:border-white/10"
                >
                  <th class="pb-3 pr-4">Domain</th>
                  <th class="pb-3 pr-4">Status</th>
                  <th class="pb-3 pr-4 text-right">On Track</th>
                  <th class="pb-3 pr-4 text-right">At Risk</th>
                  <th class="pb-3 pr-4 text-right">Off Track</th>
                  <th class="pb-3 pr-4 text-right">Total</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-black-200 dark:divide-white/5">
                {#each domainProjectHealthData as domain}
                  <tr
                    class="hover:bg-ambient-600 dark:hover:bg-white/5 transition-colors"
                  >
                    <td class="py-3 pr-4">
                      <span
                        class="text-sm text-black-900 dark:text-white font-medium"
                      >
                        {domain.domainName}
                      </span>
                    </td>
                    <td class="py-3 pr-4">
                      <Badge status={domain.status} />
                    </td>
                    <td class="py-3 pr-4 text-right">
                      <span
                        class="text-sm font-semibold text-black-900 dark:text-white"
                      >
                        {domain.onTrackPercent.toFixed(0)}%
                      </span>
                      <span class="text-xs text-black-500 ml-1">
                        ({domain.onTrackCount})
                      </span>
                    </td>
                    <td class="py-3 pr-4 text-right">
                      <span class="text-sm text-black-600 dark:text-black-300">
                        {domain.atRiskCount}
                      </span>
                    </td>
                    <td class="py-3 pr-4 text-right">
                      <span class="text-sm text-black-600 dark:text-black-300">
                        {domain.offTrackCount}
                      </span>
                    </td>
                    <td class="py-3 pr-4 text-right">
                      <span class="text-sm text-black-500 dark:text-black-400">
                        {domain.totalProjects}
                      </span>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      </Card>
    {/if}

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
        <ToggleGroupRoot
          bind:value={endDateMode}
          variant="outline"
          type="single"
        >
          <ToggleGroupItem
            value="predicted"
            aria-label="Use predicted end dates">Predicted</ToggleGroupItem
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
          <ToggleGroupItem
            value="quarter"
            aria-label="Show current quarter view">Quarter</ToggleGroupItem
          >
          <ToggleGroupItem value="quarters" aria-label="Show 5 quarter view"
            >5 Quarters</ToggleGroupItem
          >
        </ToggleGroupRoot>
      {/if}
    </div>

    <!-- Project List -->
    {#if $databaseStore.loading}
      <!-- Loading handled by sidebar icon animation -->
      <div class="py-12"></div>
    {:else if $databaseStore.error}
      <Card class="border-danger-500/50">
        <div
          class="mb-3 text-sm font-medium text-danger-600 dark:text-danger-400"
        >
          Error Loading Data
        </div>
        <p class="mb-3 text-black-700 dark:text-black-400">
          {$databaseStore.error}
        </p>
        <p class="text-sm text-black-600 dark:text-black-500">
          Make sure the database is synced. Run: <code
            class="px-2 py-1 font-mono text-xs rounded bg-ambient-700 dark:bg-black-800 text-black-700 dark:text-black-300"
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
            class="flex flex-wrap items-center justify-between gap-4 px-4 py-3 border-b border-white/10 bg-ambient-600 dark:bg-white/5"
          >
            <div class="flex items-center gap-3">
              <h2 class="text-lg font-semibold text-black-900 dark:text-white">
                {domain.domainName}
              </h2>
              <Badge variant="outline">{domain.teams.length} teams</Badge>
            </div>
            <MiniPillarRow
              snapshot={domainSnapshotsMap.get(domain.domainName) || null}
              productivityUnderConstruction={false}
              {loading}
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
            <div class="mb-2 text-black-600 dark:text-black-400">
              No domains found
            </div>
            <p class="text-sm text-black-500">
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
            class="flex flex-wrap items-center justify-between gap-4 px-4 py-3 border-b border-white/10 bg-ambient-600 dark:bg-white/5"
          >
            <div class="flex items-center gap-3">
              <h2 class="text-lg font-semibold text-black-900 dark:text-white">
                {getTeamDisplayName(team.teamKey)}
              </h2>
              <Badge variant="outline">{team.projects.length} projects</Badge>
            </div>
            <MiniPillarRow
              snapshot={teamSnapshotsMap.get(team.teamKey) || null}
              productivityUnderConstruction={true}
              {loading}
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
            <div class="mb-2 text-black-600 dark:text-black-400">
              No teams found
            </div>
            <p class="text-sm text-black-500">
              {selectedTeamKey
                ? "No projects match the current team filter."
                : "No projects found with the current filters."}
            </p>
          </div>
        </Card>
      {/if}
    {/if}
  {:else}
    <!-- No data state -->
    <Card>
      <div class="py-8 text-center">
        <div class="mb-2 text-black-600 dark:text-black-400">
          No metrics data available
        </div>
        <p class="text-sm text-black-500">
          Run a sync to capture metrics data.
        </p>
      </div>
    </Card>
  {/if}
</div>

<style>
  /* KaTeX formula styling */
  .formula-container :global(.katex) {
    font-size: 1em;
    color: #1a1a1a;
  }
  :global(.dark) .formula-container :global(.katex) {
    color: #e5e5e5;
  }
  .formula-container :global(.katex-display) {
    margin: 0;
  }
</style>

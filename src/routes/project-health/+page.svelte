<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import Card from "$lib/components/Card.svelte";
  import Skeleton from "$lib/components/Skeleton.svelte";
  import Badge from "$lib/components/Badge.svelte";
  import TeamFilterNotice from "$lib/components/TeamFilterNotice.svelte";
  import ProjectsTable from "$lib/components/ProjectsTable.svelte";
  import GanttChart from "$lib/components/GanttChart.svelte";
  import ToggleGroupRoot from "$lib/components/ToggleGroupRoot.svelte";
  import ToggleGroupItem from "$lib/components/ToggleGroupItem.svelte";
  import MiniPillarRow from "$lib/components/metrics/MiniPillarRow.svelte";
  import { projectsStore, databaseStore } from "$lib/stores/database";
  import {
    teamFilterStore,
    teamsMatchFullFilter,
  } from "$lib/stores/team-filter";
  import { executiveFocus } from "$lib/stores/dashboard";
  import {
    filterProjectsByMode,
    groupProjectsByTeams,
    groupProjectsByDomains,
  } from "$lib/project-data";
  import { getDomainForTeam } from "../../utils/domain-mapping";
  import { Star } from "lucide-svelte";
  import type {
    VelocityHealthV1,
    MetricsSnapshotV1,
  } from "../../types/metrics-snapshot";
  import type { LatestMetricsResponse } from "../api/metrics/latest/+server";

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

  // Initial setup
  onMount(async () => {
    if (!browser) return;

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
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load data";
    } finally {
      loading = false;
    }
  });

  // Status labels for computed status badge
  const statusLabels: Record<string, string> = {
    healthy: "Healthy",
    warning: "Warning",
    critical: "Critical",
    unknown: "Unknown",
  };

  // Get current filter state
  const filter = $derived($teamFilterStore);

  // Determine active domain filter (from domain selection or derived from team)
  const activeDomainFilter = $derived.by(() => {
    if (filter.teamKey) {
      return getDomainForTeam(filter.teamKey);
    }
    return filter.domain;
  });

  // Get filtered domain snapshot for hero metrics
  const filteredDomainVelocity = $derived.by((): VelocityHealthV1 | null => {
    if (!activeDomainFilter) return null;
    const domainSnapshot = allSnapshots.find(
      (s) => s.level === "domain" && s.levelId === activeDomainFilter
    );
    return domainSnapshot?.snapshot?.velocityHealth || null;
  });

  // Use filtered domain health if filter is active, otherwise org-level
  const displayVelocity = $derived(filteredDomainVelocity || velocityHealth);

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

  // Computed status
  const computedStatus = $derived.by((): "healthy" | "warning" | "critical" => {
    const pct = velocityHealth?.onTrackPercent ?? 0;
    if (pct >= 80) return "healthy";
    if (pct >= 60) return "warning";
    return "critical";
  });

  // Status indicator colors for domain table
  const statusColors: Record<string, string> = {
    healthy: "bg-emerald-500",
    warning: "bg-amber-500",
    critical: "bg-red-500",
    unknown: "bg-neutral-500",
  };

  // Extract domain-level project health data for overview table
  const domainProjectHealthData = $derived.by((): DomainProjectHealth[] => {
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
  const isExecutiveFocus = $derived($executiveFocus);
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
    <h1 class="text-2xl font-semibold text-white">Project Health</h1>
    <TeamFilterNotice level="domain" />
  </div>

  {#if loading}
    <!-- Loading state -->
    <Card class="p-6">
      <div class="space-y-6">
        <div class="text-center py-4">
          <Skeleton class="w-32 h-12 mx-auto mb-2" />
          <Skeleton class="w-48 h-4 mx-auto" />
        </div>
        <Skeleton class="w-full h-24" />
        <Skeleton class="w-full h-32" />
        <div class="grid grid-cols-3 gap-4">
          <Skeleton class="h-24" />
          <Skeleton class="h-24" />
          <Skeleton class="h-24" />
        </div>
      </div>
    </Card>
  {:else if error}
    <!-- Error state -->
    <Card class="border-red-500/50">
      <div class="mb-3 text-sm font-medium text-red-600 dark:text-red-400">
        Error Loading Data
      </div>
      <p class="text-neutral-700 dark:text-neutral-400">{error}</p>
    </Card>
  {:else if displayVelocity}
    <!-- Marquee Hero Section -->
    <div class="py-8 border-b border-white/10">
      <!-- Large metric -->
      <div class="flex items-baseline justify-center gap-4 mb-3">
        <span class="text-8xl lg:text-9xl font-bold text-white tracking-tight">
          {displayVelocity.onTrackPercent.toFixed(0)}%
        </span>
      </div>

      <!-- Subtitle -->
      <p class="text-center text-xl text-neutral-400 mb-2">
        Projects on track to meet their target dates
      </p>
      <p class="text-center text-sm text-neutral-500">
        {onTrackCount} of {totalProjects} projects
        <span
          class="ml-2 inline-block text-xs font-medium px-2 py-0.5 rounded {computedStatus ===
          'healthy'
            ? 'bg-emerald-500/20 text-emerald-400'
            : computedStatus === 'warning'
              ? 'bg-amber-500/20 text-amber-400'
              : 'bg-red-500/20 text-red-400'}"
        >
          {statusLabels[computedStatus]}
        </span>
      </p>

      <!-- Breakdown row -->
      <div class="flex items-center justify-center gap-8 lg:gap-16 mt-8">
        <!-- At Risk total -->
        <div class="text-center">
          <div class="text-4xl lg:text-5xl font-bold text-white">
            {atRiskCount}
          </div>
          <div class="text-sm text-neutral-400 mt-1">At Risk</div>
          <div class="text-xs text-neutral-500">need monitoring</div>
        </div>

        <!-- Divider -->
        <div class="h-12 w-px bg-white/10"></div>

        <!-- Off Track total -->
        <div class="text-center">
          <div class="text-4xl lg:text-5xl font-bold text-white">
            {offTrackCount}
          </div>
          <div class="text-sm text-neutral-400 mt-1">Off Track</div>
          <div class="text-xs text-neutral-500">need intervention</div>
        </div>

        <!-- Divider -->
        <div class="h-12 w-px bg-white/10"></div>

        <!-- Self-reported breakdown -->
        <div class="text-center opacity-70">
          <div class="text-3xl lg:text-4xl font-bold text-white">
            {atRiskHuman + offTrackHuman}
          </div>
          <div class="text-sm text-neutral-400 mt-1">Self-reported</div>
        </div>

        <!-- Divider -->
        <div class="h-12 w-px bg-white/10"></div>

        <!-- Trajectory Alert breakdown -->
        <div class="text-center opacity-70">
          <div class="text-3xl lg:text-4xl font-bold text-white">
            {atRiskVelocity + offTrackVelocity}
          </div>
          <div class="text-sm text-neutral-400 mt-1">Trajectory Alert</div>
        </div>
      </div>
    </div>

    <!-- Why & How row -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-6">
      <!-- Why this matters -->
      <div class="space-y-2">
        <h3
          class="text-xs font-medium text-neutral-500 uppercase tracking-wider"
        >
          Why this matters
        </h3>
        <p class="text-sm text-neutral-400 leading-relaxed">
          Early detection of at-risk projects enables proactive intervention
          before deadlines slip. Combining self-reported status with
          velocity-based trajectory alerts catches blind spots that either
          source alone would miss.
        </p>
      </div>

      <!-- How it's calculated -->
      <div class="space-y-2">
        <h3
          class="text-xs font-medium text-neutral-500 uppercase tracking-wider"
        >
          How it's calculated
        </h3>
        <p class="text-sm text-neutral-400">
          A project is "on track" when both <strong class="text-neutral-300"
            >self-reported status</strong
          >
          is healthy AND the
          <strong class="text-neutral-300">velocity trajectory</strong> predicts completion
          within 14 days of the target date.
        </p>

        <!-- Formula -->
        {#if formulaHtml}
          <div
            class="py-3 px-4 rounded-md bg-neutral-800/50 border border-white/5 formula-container overflow-x-auto mt-3"
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
          class="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/5"
        >
          <h3 class="text-sm font-medium text-white">
            Domain Overview ({domainProjectHealthData.length})
          </h3>
          <span class="text-xs text-neutral-500">Project health by domain</span>
        </div>
        <div class="p-4">
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead>
                <tr
                  class="text-left text-xs font-medium text-neutral-500 uppercase tracking-wider border-b border-white/10"
                >
                  <th class="pb-3 pr-4">Domain</th>
                  <th class="pb-3 pr-4">Status</th>
                  <th class="pb-3 pr-4 text-right">On Track</th>
                  <th class="pb-3 pr-4 text-right">At Risk</th>
                  <th class="pb-3 pr-4 text-right">Off Track</th>
                  <th class="pb-3 pr-4 text-right">Total</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-white/5">
                {#each domainProjectHealthData as domain}
                  <tr class="hover:bg-white/5 transition-colors">
                    <td class="py-3 pr-4">
                      <span class="text-sm text-white font-medium">
                        {domain.domainName}
                      </span>
                    </td>
                    <td class="py-3 pr-4">
                      <span
                        class="text-xs font-medium px-2 py-1 rounded {statusColors[
                          domain.status
                        ]
                          ? statusColors[domain.status].replace('bg-', 'bg-') +
                            '/20 ' +
                            statusColors[domain.status]
                              .replace('bg-', 'text-')
                              .replace('-500', '-400')
                          : 'bg-neutral-500/20 text-neutral-400'}"
                      >
                        {statusLabels[domain.status] || domain.status}
                      </span>
                    </td>
                    <td class="py-3 pr-4 text-right">
                      <span class="text-sm font-semibold text-white">
                        {domain.onTrackPercent.toFixed(0)}%
                      </span>
                      <span class="text-xs text-neutral-500 ml-1">
                        ({domain.onTrackCount})
                      </span>
                    </td>
                    <td class="py-3 pr-4 text-right">
                      <span class="text-sm text-neutral-300">
                        {domain.atRiskCount}
                      </span>
                    </td>
                    <td class="py-3 pr-4 text-right">
                      <span class="text-sm text-neutral-300">
                        {domain.offTrackCount}
                      </span>
                    </td>
                    <td class="py-3 pr-4 text-right">
                      <span class="text-sm text-neutral-400">
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

    <!-- Project List -->
    {#if $databaseStore.loading}
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
    {:else if $databaseStore.error}
      <Card class="border-red-500/50">
        <div class="mb-3 text-sm font-medium text-red-600 dark:text-red-400">
          Error Loading Data
        </div>
        <p class="mb-3 text-neutral-700 dark:text-neutral-400">
          {$databaseStore.error}
        </p>
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
  {:else}
    <!-- No data state -->
    <Card>
      <div class="py-8 text-center">
        <div class="mb-2 text-neutral-400">No metrics data available</div>
        <p class="text-sm text-neutral-500">
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
    color: #e5e5e5;
  }
  .formula-container :global(.katex-display) {
    margin: 0;
  }
</style>

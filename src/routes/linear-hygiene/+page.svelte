<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import Card from "$lib/components/Card.svelte";
  import EngineersTable from "$lib/components/EngineersTable.svelte";
  import EngineerDetailModal from "$lib/components/EngineerDetailModal.svelte";
  import Skeleton from "$lib/components/Skeleton.svelte";
  import TeamFilterNotice from "$lib/components/TeamFilterNotice.svelte";
  import TrendChip from "$lib/components/metrics/TrendChip.svelte";
  import Badge from "$lib/components/Badge.svelte";
  import { teamFilterStore } from "$lib/stores/team-filter";
  import { getDomainForTeam } from "../../utils/domain-mapping";
  import {
    calculateMetricTrends,
    metricExtractors,
  } from "$lib/utils/trend-calculation";
  import { getStatusTextColor } from "$lib/utils/status-colors";
  import type {
    LinearHygieneV1,
    MetricsSnapshotV1,
  } from "../../types/metrics-snapshot";
  import type { LatestMetricsResponse } from "../api/metrics/latest/+server";
  import type {
    TrendDataPoint,
    TrendsResponse,
  } from "../api/metrics/trends/+server";

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
    active_project_count?: number;
    multi_project_violation?: number;
  }

  interface ProjectData {
    project_id: string;
    project_name: string;
    project_lead_name: string | null;
    project_lead_avatar_url: string | null;
    missing_lead: number;
    is_stale_update: number;
    has_status_mismatch: number;
    missing_health: number;
    has_date_discrepancy: number;
    in_progress_issues: number;
    teams: string;
  }

  // Domain hygiene data for table
  interface DomainHygieneHealth {
    domainName: string;
    hygieneScore: number;
    totalGaps: number;
    engineersWithGaps: number;
    totalEngineers: number;
    projectsWithGaps: number;
    totalProjects: number;
    status: string;
  }

  // Props from page.server.ts
  let { data } = $props();

  // Data state
  let loading = $state(true);
  let error = $state<string | null>(null);
  let linearHygiene = $state<LinearHygieneV1 | null>(null);
  let allSnapshots = $state<
    Array<{
      level: string;
      levelId: string | null;
      snapshot: MetricsSnapshotV1;
      capturedAt: string;
    }>
  >([]);
  let allEngineers = $state<EngineerData[]>([]);
  let allProjects = $state<ProjectData[]>([]);

  // Trend data state
  let trendDataPoints = $state<TrendDataPoint[]>([]);

  // Engineer modal state
  let selectedEngineer = $state<EngineerData | null>(null);

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

    // Load KaTeX
    katex = await import("katex");
    if (katex) {
      formulaHtml = katex.default.renderToString(
        "\\text{Hygiene Score} = \\left(1 - \\frac{\\text{Total Gaps}}{\\text{Max Possible Gaps}}\\right) \\times 100",
        { throwOnError: false, displayMode: true }
      );
    }

    // Fetch all metrics snapshots, engineers, and projects
    try {
      const [metricsRes, engineersRes, projectsRes] = await Promise.all([
        fetch("/api/metrics/latest?all=true"),
        fetch("/api/engineers"),
        fetch("/api/projects"),
      ]);

      const metricsData = (await metricsRes.json()) as LatestMetricsResponse;
      const engineersData = await engineersRes.json();
      const projectsData = await projectsRes.json();

      if (!metricsData.success) {
        error = metricsData.error || "Failed to fetch metrics";
        return;
      }

      allSnapshots = metricsData.snapshots || [];
      allEngineers = engineersData.engineers || [];
      allProjects = projectsData.projects || [];

      // Extract org-level linear hygiene
      const orgSnapshot = allSnapshots.find((s) => s.level === "org");
      linearHygiene = orgSnapshot?.snapshot?.linearHygiene || null;

      // Fetch initial org-level trends
      await fetchTrendData("org", null);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load data";
    } finally {
      loading = false;
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
  const hygieneTrends = $derived(
    calculateMetricTrends(trendDataPoints, metricExtractors.linearHygiene)
  );

  // Check if any trend data is limited (actual days < expected)
  const hasLimitedTrendData = $derived.by(() => {
    const weekLimited =
      hygieneTrends.week.hasEnoughData &&
      (hygieneTrends.week.actualDays ?? 7) < 7;
    const monthLimited =
      hygieneTrends.month.hasEnoughData &&
      (hygieneTrends.month.actualDays ?? 30) < 30;
    return weekLimited || monthLimited;
  });

  // Get the engineer team mapping
  const engineerTeamMapping = $derived(data.engineerTeamMapping || {});
  const hasMappingConfigured = $derived(
    Object.keys(engineerTeamMapping).length > 0
  );

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

  // Get engineers mapped (from ENGINEER_TEAM_MAPPING)
  const teamMappedEngineerNames = $derived.by(() => {
    if (!hasMappingConfigured) return new Set<string>();
    return new Set(Object.keys(engineerTeamMapping));
  });

  // Filter engineers with hygiene gaps
  const engineersWithGaps = $derived.by(() => {
    let filtered = allEngineers;

    // Filter to engineers with active WIP
    filtered = filtered.filter((e) => e.wip_issue_count > 0);

    // Filter by mapping if configured
    if (hasMappingConfigured) {
      filtered = filtered.filter((e) =>
        teamMappedEngineerNames.has(e.assignee_name)
      );
    }

    // Filter by team if team filter is active (more specific)
    if (activeTeamFilter && hasMappingConfigured) {
      filtered = filtered.filter((e) => {
        const teamKey = engineerTeamMapping[e.assignee_name];
        return teamKey?.toUpperCase() === activeTeamFilter.toUpperCase();
      });
    }
    // Otherwise filter by domain if domain filter is active
    else if (activeDomainFilter && hasMappingConfigured) {
      filtered = filtered.filter((e) => {
        const teamKey = engineerTeamMapping[e.assignee_name];
        if (!teamKey) return false;
        const domain = getDomainForTeam(teamKey);
        return domain === activeDomainFilter;
      });
    }

    // Filter to only engineers with gaps
    return filtered.filter(
      (e) =>
        e.missing_estimate_count > 0 ||
        e.missing_priority_count > 0 ||
        e.no_recent_comment_count > 0 ||
        e.wip_age_violation_count > 0
    );
  });

  // Get project team keys helper
  function getProjectTeamKeys(project: ProjectData): string[] {
    try {
      const teams = JSON.parse(project.teams || "[]") as string[];
      return teams.map((t) => t.toUpperCase());
    } catch {
      return [];
    }
  }

  // Filter projects with hygiene gaps
  const projectsWithGaps = $derived.by(() => {
    let filtered = allProjects;

    // Filter to active projects (with WIP issues)
    filtered = filtered.filter((p) => p.in_progress_issues > 0);

    // Filter by team if team filter is active (more specific)
    if (activeTeamFilter) {
      filtered = filtered.filter((p) => {
        const projectTeams = getProjectTeamKeys(p);
        return projectTeams.some((t) => t === activeTeamFilter.toUpperCase());
      });
    }
    // Otherwise filter by domain if active
    else if (activeDomainFilter) {
      const domainTeamKeys = new Set<string>();
      // Get team keys for the domain from engineer mapping
      for (const [, teamKey] of Object.entries(engineerTeamMapping)) {
        const domain = getDomainForTeam(teamKey);
        if (domain === activeDomainFilter) {
          domainTeamKeys.add(teamKey.toUpperCase());
        }
      }

      if (domainTeamKeys.size > 0) {
        filtered = filtered.filter((p) => {
          const projectTeams = getProjectTeamKeys(p);
          return projectTeams.some((t) => domainTeamKeys.has(t));
        });
      }
    }

    // Filter to only projects with gaps
    return filtered.filter(
      (p) =>
        p.missing_lead === 1 ||
        p.is_stale_update === 1 ||
        p.has_status_mismatch === 1 ||
        p.missing_health === 1 ||
        p.has_date_discrepancy === 1
    );
  });

  // Extract domain-level hygiene health data for table (only shown when no team filter)
  const domainHygieneData = $derived.by((): DomainHygieneHealth[] => {
    // Don't show domain breakdown when team filter is active
    if (activeTeamFilter) return [];

    const domains: DomainHygieneHealth[] = [];

    for (const snapshot of allSnapshots) {
      if (snapshot.level !== "domain" || !snapshot.levelId) continue;

      // Filter by active domain if set
      if (activeDomainFilter && snapshot.levelId !== activeDomainFilter)
        continue;

      const hygiene = snapshot.snapshot.linearHygiene;
      if (!hygiene) continue;

      domains.push({
        domainName: snapshot.levelId,
        hygieneScore: hygiene.hygieneScore,
        totalGaps: hygiene.totalGaps,
        engineersWithGaps: hygiene.engineersWithGaps,
        totalEngineers: hygiene.totalEngineers,
        projectsWithGaps: hygiene.projectsWithGaps,
        totalProjects: hygiene.totalProjects,
        status: hygiene.status,
      });
    }

    // Sort by hygiene score (ascending - domains needing attention first)
    return domains.sort((a, b) => a.hygieneScore - b.hygieneScore);
  });

  // Get the filtered team snapshot for hero metrics (when team filter is active)
  const filteredTeamHygiene = $derived.by((): LinearHygieneV1 | null => {
    if (!activeTeamFilter) return null;
    const teamSnapshot = allSnapshots.find(
      (s) =>
        s.level === "team" &&
        s.levelId?.toUpperCase() === activeTeamFilter.toUpperCase()
    );
    return teamSnapshot?.snapshot?.linearHygiene || null;
  });

  // Get the filtered domain snapshot for hero metrics (when domain filter is active but no team filter)
  const filteredDomainHygiene = $derived.by((): LinearHygieneV1 | null => {
    // Team filter takes precedence
    if (activeTeamFilter) return null;
    if (!activeDomainFilter) return null;
    const domainSnapshot = allSnapshots.find(
      (s) => s.level === "domain" && s.levelId === activeDomainFilter
    );
    return domainSnapshot?.snapshot?.linearHygiene || null;
  });

  // Use filtered team hygiene if team filter is active, then domain, then org-level
  const displayHygiene = $derived(
    filteredTeamHygiene || filteredDomainHygiene || linearHygiene
  );

  // Calculate total gaps from engineer gap counts (for future sorting)
  function _getEngineerTotalGaps(engineer: EngineerData): number {
    return (
      engineer.missing_estimate_count +
      engineer.missing_priority_count +
      engineer.no_recent_comment_count +
      engineer.wip_age_violation_count
    );
  }

  // Calculate total gaps from project gap counts
  function getProjectTotalGaps(project: ProjectData): number {
    return (
      project.missing_lead +
      project.is_stale_update +
      project.has_status_mismatch +
      project.missing_health +
      project.has_date_discrepancy
    );
  }

  function closeEngineerModal() {
    selectedEngineer = null;
  }
</script>

<div class="space-y-6">
  <!-- Page Title -->
  <div class="flex flex-wrap items-center justify-between gap-4">
    <h1
      class="text-2xl font-semibold text-black-900 dark:text-black-900 dark:text-white"
    >
      Linear Hygiene
    </h1>
    <TeamFilterNotice level={activeTeamFilter ? "team" : "domain"} />
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
    <Card class="border-danger-500/50">
      <div
        class="mb-3 text-sm font-medium text-danger-600 dark:text-danger-400"
      >
        Error Loading Data
      </div>
      <p class="text-black-700 dark:text-black-400">{error}</p>
    </Card>
  {:else if linearHygiene}
    <!-- Marquee Hero Section -->
    <div class="py-8 border-b border-black-200 dark:border-white/10">
      <!-- Large metric -->
      <div class="flex items-baseline justify-center gap-4 mb-3">
        <span
          class="text-8xl lg:text-9xl font-bold tracking-tight {getStatusTextColor(
            displayHygiene?.status ?? 'unknown'
          )}"
        >
          {displayHygiene?.hygieneScore ?? 0}<span
            class="text-5xl lg:text-6xl font-normal text-black-600 dark:text-black-400"
            >%</span
          >
        </span>
      </div>

      <!-- 7d/30d Trend Chips -->
      <div class="flex items-center justify-center gap-2 mb-2">
        {#if hygieneTrends.week.hasEnoughData}
          {@const actualDays = hygieneTrends.week.actualDays ?? 7}
          {@const isLimited = actualDays < 7}
          <TrendChip
            direction={hygieneTrends.week.direction}
            percentChange={hygieneTrends.week.percentChange}
            period="7d"
            higherIsBetter={true}
            {isLimited}
            tooltip={isLimited
              ? `Based on ${actualDays} days of data`
              : undefined}
          />
        {/if}
        {#if hygieneTrends.month.hasEnoughData}
          {@const actualDays = hygieneTrends.month.actualDays ?? 30}
          {@const isLimited = actualDays < 30}
          <TrendChip
            direction={hygieneTrends.month.direction}
            percentChange={hygieneTrends.month.percentChange}
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
        of tracking best practices met
      </p>
      <p class="text-center text-sm text-black-500">
        {displayHygiene?.totalGaps ?? 0} gaps found
        <Badge status={displayHygiene?.status ?? "unknown"} class="ml-2" />
      </p>

      <!-- Breakdown row -->
      <div class="flex items-center justify-center gap-8 lg:gap-16 mt-8">
        <!-- Engineers with gaps -->
        <div class="text-center">
          <div
            class="text-4xl lg:text-5xl font-bold text-black-900 dark:text-black-900 dark:text-white"
          >
            {displayHygiene?.engineersWithGaps ?? 0}
          </div>
          <div class="text-sm text-black-500 dark:text-black-400 mt-1">
            Engineers
          </div>
          <div class="text-xs text-black-500">
            of {displayHygiene?.totalEngineers ?? 0} with gaps
          </div>
        </div>

        <!-- Divider -->
        <div class="h-12 w-px bg-ambient-700 dark:bg-white/10"></div>

        <!-- Projects with gaps -->
        <div class="text-center">
          <div
            class="text-4xl lg:text-5xl font-bold text-black-900 dark:text-black-900 dark:text-white"
          >
            {displayHygiene?.projectsWithGaps ?? 0}
          </div>
          <div class="text-sm text-black-500 dark:text-black-400 mt-1">
            Projects
          </div>
          <div class="text-xs text-black-500">
            of {displayHygiene?.totalProjects ?? 0} with gaps
          </div>
        </div>

        <!-- Divider -->
        <div class="h-12 w-px bg-ambient-700 dark:bg-white/10"></div>

        <!-- Total gaps -->
        <div class="text-center">
          <div
            class="text-4xl lg:text-5xl font-bold text-black-900 dark:text-black-900 dark:text-white"
          >
            {displayHygiene?.totalGaps ?? 0}
          </div>
          <div class="text-sm text-black-500 dark:text-black-400 mt-1">
            Total Gaps
          </div>
          <div class="text-xs text-black-500">across all items</div>
        </div>
      </div>

      <!-- Gap type breakdown -->
      <div
        class="flex flex-wrap items-center justify-center gap-6 mt-8 pt-6 border-t border-white/5"
      >
        <!-- Engineer gap types -->
        <div class="text-center opacity-70">
          <div
            class="text-2xl font-bold text-black-800 dark:text-black-900 dark:text-white"
          >
            {displayHygiene?.missingEstimateCount ?? 0}
          </div>
          <div class="text-xs text-black-500">Missing estimate</div>
        </div>
        <div class="text-center opacity-70">
          <div
            class="text-2xl font-bold text-black-800 dark:text-black-900 dark:text-white"
          >
            {displayHygiene?.missingPriorityCount ?? 0}
          </div>
          <div class="text-xs text-black-500">Missing priority</div>
        </div>
        <div class="text-center opacity-70">
          <div
            class="text-2xl font-bold text-black-800 dark:text-black-900 dark:text-white"
          >
            {displayHygiene?.noRecentCommentCount ?? 0}
          </div>
          <div class="text-xs text-black-500">No recent comment</div>
        </div>
        <div class="text-center opacity-70">
          <div
            class="text-2xl font-bold text-black-800 dark:text-black-900 dark:text-white"
          >
            {displayHygiene?.wipAgeViolationCount ?? 0}
          </div>
          <div class="text-xs text-black-500">WIP age violation</div>
        </div>

        <!-- Divider -->
        <div class="h-8 w-px bg-ambient-700 dark:bg-white/10"></div>

        <!-- Project gap types -->
        <div class="text-center opacity-70">
          <div
            class="text-2xl font-bold text-black-800 dark:text-black-900 dark:text-white"
          >
            {displayHygiene?.missingLeadCount ?? 0}
          </div>
          <div class="text-xs text-black-500">Missing lead</div>
        </div>
        <div class="text-center opacity-70">
          <div
            class="text-2xl font-bold text-black-800 dark:text-black-900 dark:text-white"
          >
            {displayHygiene?.staleUpdateCount ?? 0}
          </div>
          <div class="text-xs text-black-500">Stale update</div>
        </div>
        <div class="text-center opacity-70">
          <div
            class="text-2xl font-bold text-black-800 dark:text-black-900 dark:text-white"
          >
            {displayHygiene?.statusMismatchCount ?? 0}
          </div>
          <div class="text-xs text-black-500">Status mismatch</div>
        </div>
        <div class="text-center opacity-70">
          <div
            class="text-2xl font-bold text-black-800 dark:text-black-900 dark:text-white"
          >
            {displayHygiene?.missingHealthCount ?? 0}
          </div>
          <div class="text-xs text-black-500">Missing health</div>
        </div>
        <div class="text-center opacity-70">
          <div
            class="text-2xl font-bold text-black-800 dark:text-black-900 dark:text-white"
          >
            {displayHygiene?.dateDiscrepancyCount ?? 0}
          </div>
          <div class="text-xs text-black-500">Date discrepancy</div>
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
          Linear hygiene reflects tactical discipline: estimates enable
          forecasting, priorities drive focus, comments surface blockers, and
          project metadata keeps stakeholders informed. Gaps compound and erode
          team velocity over time.
        </p>
      </div>

      <!-- How it's calculated -->
      <div class="space-y-2">
        <h3 class="text-xs font-medium text-black-500 uppercase tracking-wider">
          How it's calculated
        </h3>
        <p class="text-sm text-black-600 dark:text-black-400">
          Gaps are counted across <strong
            class="text-black-700 dark:text-black-300">4</strong
          >
          engineer issue types (estimates, priority, comments, WIP age) and
          <strong class="text-black-700 dark:text-black-300">5</strong>
          project types (lead, update, status, health, dates).
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

    <!-- Domain Hygiene Table -->
    {#if domainHygieneData.length > 0}
      <Card class="p-0 overflow-hidden">
        <div
          class="flex items-center justify-between px-4 py-3 border-b border-black-200 dark:border-white/10 bg-ambient-600 dark:bg-white/5"
        >
          <h3
            class="text-sm font-medium text-black-900 dark:text-black-900 dark:text-white"
          >
            Domain Breakdown ({domainHygieneData.length})
          </h3>
          <span class="text-xs text-black-600 dark:text-black-500"
            >Hygiene by domain</span
          >
        </div>
        <div class="p-4">
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead>
                <tr
                  class="text-left text-xs font-medium text-black-600 dark:text-black-500 uppercase tracking-wider border-b border-black-200 dark:border-white/10"
                >
                  <th class="pb-3 pr-4">Domain</th>
                  <th class="pb-3 pr-4">Status</th>
                  <th class="pb-3 pr-4 text-right">Score</th>
                  <th class="pb-3 pr-4 text-right">Gaps</th>
                  <th class="pb-3 pr-4 text-right">Engineers</th>
                  <th class="pb-3 pr-4 text-right">Projects</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-black-100 dark:divide-white/5">
                {#each domainHygieneData as domain (domain.domainName)}
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
                        class="text-sm font-semibold text-black-900 dark:text-black-900 dark:text-white"
                      >
                        {domain.hygieneScore}%
                      </span>
                    </td>
                    <td class="py-3 pr-4 text-right">
                      <span class="text-sm text-black-700 dark:text-black-300">
                        {domain.totalGaps}
                      </span>
                    </td>
                    <td class="py-3 pr-4 text-right">
                      <span class="text-sm text-black-700 dark:text-black-300">
                        {domain.engineersWithGaps}
                      </span>
                      <span class="text-xs text-black-600 dark:text-black-500">
                        /{domain.totalEngineers}
                      </span>
                    </td>
                    <td class="py-3 pr-4 text-right">
                      <span class="text-sm text-black-700 dark:text-black-300">
                        {domain.projectsWithGaps}
                      </span>
                      <span class="text-xs text-black-600 dark:text-black-500">
                        /{domain.totalProjects}
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

    <!-- Engineers with Gaps Table -->
    <Card class="p-0 overflow-hidden">
      <div
        class="flex items-center justify-between px-4 py-3 border-b border-black-200 dark:border-white/10 bg-ambient-600 dark:bg-white/5"
      >
        <h3
          class="text-sm font-medium text-black-900 dark:text-black-900 dark:text-white"
        >
          Engineers with Gaps ({engineersWithGaps.length})
        </h3>
        <span class="text-xs text-black-600 dark:text-black-500">
          Missing estimates, priority, comments, or WIP age
        </span>
      </div>
      <div class="p-4">
        {#if engineersWithGaps.length > 0}
          <EngineersTable
            engineers={engineersWithGaps}
            onEngineerClick={(engineer) => {
              selectedEngineer = engineer;
            }}
          />
        {:else}
          <div class="py-8 text-center text-black-500">
            No engineers with hygiene gaps — great job!
          </div>
        {/if}
      </div>
    </Card>

    <!-- Projects with Gaps Table -->
    <Card class="p-0 overflow-hidden">
      <div
        class="flex items-center justify-between px-4 py-3 border-b border-black-200 dark:border-white/10 bg-ambient-600 dark:bg-white/5"
      >
        <h3
          class="text-sm font-medium text-black-900 dark:text-black-900 dark:text-white"
        >
          Projects with Gaps ({projectsWithGaps.length})
        </h3>
        <span class="text-xs text-black-500">
          Missing lead, stale update, status mismatch, etc.
        </span>
      </div>
      <div class="p-4">
        {#if projectsWithGaps.length > 0}
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead>
                <tr
                  class="text-left text-xs font-medium text-black-500 uppercase tracking-wider border-b border-black-200 dark:border-white/10"
                >
                  <th class="pb-3 pr-4">Project</th>
                  <th class="pb-3 pr-4">Lead</th>
                  <th class="pb-3 pr-4 text-center">Issues</th>
                  <th class="pb-3 pr-4 text-center">Gaps</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-white/5">
                {#each projectsWithGaps.sort((a, b) => getProjectTotalGaps(b) - getProjectTotalGaps(a)) as project (project.project_id)}
                  <tr
                    class="hover:bg-ambient-600 dark:hover:bg-white/5 transition-colors"
                  >
                    <td class="py-3 pr-4">
                      <span
                        class="text-sm text-black-900 dark:text-white font-medium"
                      >
                        {project.project_name}
                      </span>
                    </td>
                    <td class="py-3 pr-4">
                      {#if project.project_lead_name}
                        <div class="flex items-center gap-2">
                          {#if project.project_lead_avatar_url}
                            <img
                              src={project.project_lead_avatar_url}
                              alt=""
                              class="w-6 h-6 rounded-full"
                            />
                          {/if}
                          <span
                            class="text-sm text-black-700 dark:text-black-300"
                          >
                            {project.project_lead_name}
                          </span>
                        </div>
                      {:else}
                        <span class="text-sm text-danger-400">No lead</span>
                      {/if}
                    </td>
                    <td class="py-3 pr-4 text-center">
                      <span class="text-sm text-black-600 dark:text-black-400">
                        {project.in_progress_issues}
                      </span>
                    </td>
                    <td class="py-3 pr-4 text-center">
                      <div class="flex items-center justify-center gap-1">
                        {#if project.missing_lead === 1}
                          <span
                            class="text-xs px-1.5 py-0.5 rounded bg-danger-100 text-danger-700"
                            title="Missing lead"
                          >
                            Lead
                          </span>
                        {/if}
                        {#if project.is_stale_update === 1}
                          <span
                            class="text-xs px-1.5 py-0.5 rounded bg-warning-100 text-warning-700"
                            title="Stale update (7+ days)"
                          >
                            Stale
                          </span>
                        {/if}
                        {#if project.has_status_mismatch === 1}
                          <span
                            class="text-xs px-1.5 py-0.5 rounded bg-warning-100 text-warning-700"
                            title="Status mismatch"
                          >
                            Status
                          </span>
                        {/if}
                        {#if project.missing_health === 1}
                          <span
                            class="text-xs px-1.5 py-0.5 rounded bg-warning-100 text-warning-700"
                            title="Missing health status"
                          >
                            Health
                          </span>
                        {/if}
                        {#if project.has_date_discrepancy === 1}
                          <span
                            class="text-xs px-1.5 py-0.5 rounded bg-warning-100 text-warning-700"
                            title="Date discrepancy (>30 days)"
                          >
                            Date
                          </span>
                        {/if}
                      </div>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {:else}
          <div class="py-8 text-center text-black-500">
            No projects with hygiene gaps — great job!
          </div>
        {/if}
      </div>
    </Card>
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

<!-- Engineer Detail Modal -->
{#if selectedEngineer}
  <EngineerDetailModal
    engineer={selectedEngineer}
    onclose={closeEngineerModal}
  />
{/if}

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

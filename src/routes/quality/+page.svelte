<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import Card from "$lib/components/Card.svelte";
  import IssueTable from "$lib/components/IssueTable.svelte";
  import { pageLoading } from "$lib/stores/page-loading";
  import TeamFilterNotice from "$lib/components/TeamFilterNotice.svelte";
  import TrendChip from "$lib/components/metrics/TrendChip.svelte";
  import Badge from "$lib/components/Badge.svelte";
  import { teamFilterStore } from "$lib/stores/team-filter";
  import {
    getDomainForTeam,
    getTeamsForDomain,
  } from "../../utils/domain-mapping";
  import {
    calculateMetricTrends,
    metricExtractors,
  } from "$lib/utils/trend-calculation";
  import type {
    QualityHealthV1,
    MetricsSnapshotV1,
  } from "../../types/metrics-snapshot";
  import type { LatestMetricsResponse } from "../api/metrics/latest/+server";
  import type {
    TrendDataPoint,
    TrendsResponse,
  } from "../api/metrics/trends/+server";
  import type { Issue } from "../../db/schema";

  // Domain quality data for table
  interface DomainQuality {
    domainName: string;
    openBugCount: number;
    averageBugAgeDays: number;
    maxBugAgeDays: number;
    netBugChange: number;
    compositeScore: number;
    status: string;
  }

  // Data state
  let loading = $state(true);
  let error = $state<string | null>(null);
  let quality = $state<QualityHealthV1 | null>(null);
  let allSnapshots = $state<
    Array<{
      level: string;
      levelId: string | null;
      snapshot: MetricsSnapshotV1;
      capturedAt: string;
    }>
  >([]);
  let bugIssues = $state<Issue[]>([]);
  let bugsLoading = $state(true);

  // Trend data state
  let trendDataPoints = $state<TrendDataPoint[]>([]);

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

  // Fetch data on mount
  onMount(async () => {
    if (!browser) return;
    pageLoading.startLoading("/quality");

    // Load KaTeX (non-blocking)
    import("katex").then((k) => {
      katex = k;
      formulaHtml = katex.default.renderToString(
        "\\text{Score} = 0.3 \\times \\underbrace{\\max(0, 100 - \\text{Bugs})}_{\\text{Bug Score}} + 0.4 \\times \\underbrace{\\max(0, 100 - \\text{Net} \\times 10)}_{\\text{Net Score}} + 0.3 \\times \\underbrace{\\max(0, 100 - \\text{Age} \\times 0.5)}_{\\text{Age Score}}",
        { throwOnError: false, displayMode: true }
      );
    });

    // Fetch all metrics snapshots (including domain-level)
    try {
      const metricsRes = await fetch("/api/metrics/latest?all=true");
      const metricsData = (await metricsRes.json()) as LatestMetricsResponse;

      if (!metricsData.success) {
        error = metricsData.error || "Failed to fetch metrics";
        return;
      }

      allSnapshots = metricsData.snapshots || [];

      // Extract org-level quality
      const orgSnapshot = allSnapshots.find((s) => s.level === "org");
      quality = orgSnapshot?.snapshot?.quality || null;

      // Fetch initial org-level trends
      await fetchTrendData("org", null);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load data";
    } finally {
      loading = false;
      pageLoading.stopLoading("/quality");
    }

    // Fetch bugs (org-level)
    try {
      const issuesRes = await fetch(
        "/api/issues?type=bug&status=open&limit=1000"
      );
      const issuesData = await issuesRes.json();
      bugIssues = issuesData.issues || [];
    } catch (e) {
      console.error("Failed to fetch bug issues:", e);
    } finally {
      bugsLoading = false;
    }
  });

  // Re-fetch trends when filter changes
  $effect(() => {
    if (!browser || loading) return;

    const domain = activeDomainFilter;
    if (domain) {
      fetchTrendData("domain", domain);
    } else {
      fetchTrendData("org", null);
    }
  });

  // Calculate WoW and MoM trends
  const qualityTrends = $derived(
    calculateMetricTrends(trendDataPoints, metricExtractors.quality)
  );

  // Check if any trend data is limited (actual days < expected)
  const hasLimitedTrendData = $derived.by(() => {
    const weekLimited =
      qualityTrends.week.hasEnoughData &&
      (qualityTrends.week.actualDays ?? 7) < 7;
    const monthLimited =
      qualityTrends.month.hasEnoughData &&
      (qualityTrends.month.actualDays ?? 30) < 30;
    return weekLimited || monthLimited;
  });

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
  const filteredDomainQuality = $derived.by((): QualityHealthV1 | null => {
    if (!activeDomainFilter) return null;
    const domainSnapshot = allSnapshots.find(
      (s) => s.level === "domain" && s.levelId === activeDomainFilter
    );
    return domainSnapshot?.snapshot?.quality || null;
  });

  // Use filtered domain quality if filter is active, otherwise org-level
  const displayQuality = $derived(filteredDomainQuality || quality);

  // Computed status
  const computedStatus = $derived(displayQuality?.status || "unknown");

  // Status text colors for the large metric
  const statusTextColors: Record<string, string> = {
    peakFlow: "text-success-400",
    strongRhythm: "text-success-500",
    steadyProgress: "text-warning-500",
    earlyTraction: "text-danger-500",
    lowTraction: "text-danger-600",
    unknown: "text-black-600 dark:text-black-400",
  };

  // Get teams in active domain for filtering bugs
  const teamsInActiveDomain = $derived.by((): Set<string> | null => {
    if (!activeDomainFilter) return null;
    const teams = getTeamsForDomain(activeDomainFilter);
    return teams.length > 0 ? new Set(teams) : null;
  });

  // Open bugs driving the quality metric (filtered by domain if active)
  const openBugs = $derived.by(() => {
    if (!activeDomainFilter || !teamsInActiveDomain) return bugIssues;
    return bugIssues.filter((bug) => {
      if (!bug.team_key) return false;
      return teamsInActiveDomain.has(bug.team_key);
    });
  });

  // Extract domain-level quality data for table (filtered by active domain)
  const domainQualityData = $derived.by((): DomainQuality[] => {
    const domains: DomainQuality[] = [];

    for (const snapshot of allSnapshots) {
      if (snapshot.level !== "domain" || !snapshot.levelId) continue;

      // Filter by active domain if set
      if (activeDomainFilter && snapshot.levelId !== activeDomainFilter)
        continue;

      const qualityData = snapshot.snapshot.quality;
      if (!qualityData) continue;

      domains.push({
        domainName: snapshot.levelId,
        openBugCount: qualityData.openBugCount,
        averageBugAgeDays: qualityData.averageBugAgeDays,
        maxBugAgeDays: qualityData.maxBugAgeDays,
        netBugChange: qualityData.netBugChange,
        compositeScore: qualityData.compositeScore,
        status: qualityData.status,
      });
    }

    // Sort by composite score (ascending - domains needing attention first)
    return domains.sort((a, b) => a.compositeScore - b.compositeScore);
  });
</script>

<div class="space-y-6">
  <!-- Page Title -->
  <div class="flex flex-wrap items-center justify-between gap-4">
    <h1 class="text-2xl font-semibold text-black-900 dark:text-white">
      Quality
    </h1>
    <TeamFilterNotice showLevelNotice={false} />
  </div>

  {#if loading}
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
  {:else if displayQuality}
    <!-- Marquee Hero Section -->
    <div class="py-8 border-b border-black-200 dark:border-white/10">
      <!-- Large metric -->
      <div class="flex items-baseline justify-center gap-4 mb-3">
        <span
          class="text-8xl lg:text-9xl font-bold tracking-tight drop-shadow-sm dark:drop-shadow-none {statusTextColors[
            computedStatus
          ]}"
        >
          {displayQuality.compositeScore}<span
            class="text-5xl lg:text-6xl font-normal text-black-600 dark:text-black-400"
            >%</span
          >
        </span>
      </div>

      <!-- 7d/30d Trend Chips -->
      <div class="flex items-center justify-center gap-2 mb-2">
        {#if qualityTrends.week.hasEnoughData}
          {@const actualDays = qualityTrends.week.actualDays ?? 7}
          {@const isLimited = actualDays < 7}
          <TrendChip
            direction={qualityTrends.week.direction}
            percentChange={qualityTrends.week.percentChange}
            period="7d"
            higherIsBetter={true}
            {isLimited}
            tooltip={isLimited
              ? `Based on ${actualDays} days of data`
              : undefined}
          />
        {/if}
        {#if qualityTrends.month.hasEnoughData}
          {@const actualDays = qualityTrends.month.actualDays ?? 30}
          {@const isLimited = actualDays < 30}
          <TrendChip
            direction={qualityTrends.month.direction}
            percentChange={qualityTrends.month.percentChange}
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
        Composite quality score
      </p>
      <p class="text-center text-sm text-black-500">
        Based on bug count, age, and backlog trend
        <Badge status={computedStatus} class="ml-2" />
      </p>

      <!-- Breakdown row -->
      <div class="flex items-center justify-center gap-8 lg:gap-16 mt-8">
        <!-- Open bugs -->
        <div class="text-center">
          <div
            class="text-4xl lg:text-5xl font-bold text-black-900 dark:text-white"
          >
            {displayQuality.openBugCount}
          </div>
          <div class="text-sm text-black-600 dark:text-black-400 mt-1">
            Open Bugs
          </div>
          <div class="text-xs text-black-500">total backlog</div>
        </div>

        <!-- Divider -->
        <div class="h-12 w-px bg-ambient-700 dark:bg-white/10"></div>

        <!-- Average age -->
        <div class="text-center">
          <div
            class="text-4xl lg:text-5xl font-bold text-black-900 dark:text-white"
          >
            {displayQuality.averageBugAgeDays.toFixed(0)}
          </div>
          <div class="text-sm text-black-600 dark:text-black-400 mt-1">
            Avg Age (days)
          </div>
          <div class="text-xs text-black-500">
            max: {displayQuality.maxBugAgeDays.toFixed(0)}d
          </div>
        </div>

        <!-- Divider -->
        <div class="h-12 w-px bg-ambient-700 dark:bg-white/10"></div>

        <!-- Net change -->
        <div class="text-center">
          <div
            class="text-4xl lg:text-5xl font-bold text-black-900 dark:text-white"
          >
            {displayQuality.netBugChange > 0
              ? "+"
              : ""}{displayQuality.netBugChange}
          </div>
          <div class="text-sm text-black-600 dark:text-black-400 mt-1">
            Net Change
          </div>
          <div class="text-xs text-black-500">in 14 days</div>
        </div>

        <!-- Divider -->
        <div class="h-12 w-px bg-ambient-700 dark:bg-white/10"></div>

        <!-- Opened vs Closed -->
        <div class="text-center opacity-70">
          <div
            class="text-3xl lg:text-4xl font-bold text-black-900 dark:text-white"
          >
            {displayQuality.bugsOpenedInPeriod} / {displayQuality.bugsClosedInPeriod}
          </div>
          <div class="text-sm text-black-600 dark:text-black-400 mt-1">
            Opened / Closed
          </div>
          <div class="text-xs text-black-500">in 14 days</div>
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
          Bug debt compounds over time. A growing backlog indicates we're
          creating bugs faster than fixing them. Old bugs tend to get harder to
          fix as context fades. Tracking the trend helps catch quality
          regressions early.
        </p>
      </div>

      <!-- How it's calculated -->
      <div class="space-y-2">
        <h3 class="text-xs font-medium text-black-500 uppercase tracking-wider">
          How it's calculated
        </h3>
        <p class="text-sm text-black-600 dark:text-black-400">
          Three components: <strong class="text-black-700 dark:text-black-300"
            >bug count</strong
          >
          (0 at 100+ bugs),
          <strong class="text-black-700 dark:text-black-300">net change</strong>
          (rewards closing bugs, 0 at +10 net new), and
          <strong class="text-black-700 dark:text-black-300">average age</strong
          > (0 at 200+ days). 100% = zero bugs.
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

    <!-- Domain Quality Table -->
    {#if domainQualityData.length > 0}
      <Card class="p-0 overflow-hidden">
        <div
          class="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-ambient-600 dark:bg-white/5"
        >
          <h3 class="text-sm font-medium text-black-900 dark:text-white">
            Domain Breakdown ({domainQualityData.length})
          </h3>
          <span class="text-xs text-black-600 dark:text-black-500"
            >Quality metrics by domain</span
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
                  <th class="pb-3 pr-4 text-right">Open Bugs</th>
                  <th class="pb-3 pr-4 text-right">Avg Age</th>
                  <th class="pb-3 pr-4 text-right">Net Change</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-black-100 dark:divide-white/5">
                {#each domainQualityData as domain}
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
                        {domain.compositeScore}%
                      </span>
                    </td>
                    <td class="py-3 pr-4 text-right">
                      <span class="text-sm text-black-700 dark:text-black-300">
                        {domain.openBugCount}
                      </span>
                    </td>
                    <td class="py-3 pr-4 text-right">
                      <span class="text-sm text-black-600 dark:text-black-400">
                        {domain.averageBugAgeDays.toFixed(0)}d
                      </span>
                    </td>
                    <td class="py-3 pr-4 text-right">
                      <span class="text-sm text-black-700 dark:text-black-300">
                        {domain.netBugChange > 0
                          ? "+"
                          : ""}{domain.netBugChange}
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

    <!-- Open Bugs Table -->
    <Card class="p-0 overflow-hidden">
      <div
        class="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-ambient-600 dark:bg-white/5"
      >
        <h3 class="text-sm font-medium text-black-900 dark:text-white">
          Open Bugs {#if !bugsLoading}({openBugs.length}){/if}
        </h3>
      </div>
      <div class="p-4">
        {#if bugsLoading}
          <div class="py-8 text-center text-black-500">Loading bugs...</div>
        {:else if openBugs.length > 0}
          <IssueTable
            issues={openBugs}
            showAssignee={true}
            showTeam={true}
            showIdentifier={true}
            groupByState={false}
            noMaxHeight={true}
          />
        {:else}
          <div class="py-8 text-center text-black-500">
            No open bugs in the backlog — great job!
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

<style>
  /* KaTeX formula styling */
  .formula-container :global(.katex) {
    font-size: 0.85em;
    color: #1a1a1a;
  }
  :global(.dark) .formula-container :global(.katex) {
    color: #e5e5e5;
  }
  .formula-container :global(.katex-display) {
    margin: 0;
  }
</style>

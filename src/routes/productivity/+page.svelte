<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import Card from "$lib/components/Card.svelte";
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
  import type {
    TeamProductivityV1,
    MetricsSnapshotV1,
  } from "../../types/metrics-snapshot";
  import type { LatestMetricsResponse } from "../api/metrics/latest/+server";
  import type {
    TrendDataPoint,
    TrendsResponse,
  } from "../api/metrics/trends/+server";

  // Domain productivity data for table
  interface DomainProductivity {
    domainName: string;
    trueThroughput: number;
    engineerCount: number | null;
    trueThroughputPerEngineer: number | null;
    weeklyRate: number;
    weeklyRatePerEngineer: number | null;
    percentOfGoal: number;
    status: string;
  }

  // Data state
  let loading = $state(true);
  let error = $state<string | null>(null);
  let teamProductivity = $state<TeamProductivityV1 | null>(null);
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

  // KaTeX for rendering math formulas
  let katex: typeof import("katex") | null = null;
  let formulaHtml = $state("");

  // Productivity goal target (3 throughput per engineer per week)
  const PRODUCTIVITY_GOAL = 3;
  const MEASUREMENT_PERIOD_WEEKS = 2;

  // Convert 14-day throughput to weekly rate
  function toWeeklyRate(value: number): number {
    return value / MEASUREMENT_PERIOD_WEEKS;
  }

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

    // Load KaTeX
    katex = await import("katex");
    if (katex) {
      formulaHtml = katex.default.renderToString(
        "\\text{Productivity} = \\frac{\\text{TrueThroughput}_{\\text{per eng/wk}}}{\\text{Goal}} \\times 100",
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

      // Extract org-level productivity
      const orgSnapshot = allSnapshots.find((s) => s.level === "org");
      teamProductivity = orgSnapshot?.snapshot?.teamProductivity || null;

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

    const domain = activeDomainFilter;
    if (domain) {
      fetchTrendData("domain", domain);
    } else {
      fetchTrendData("org", null);
    }
  });

  // Calculate WoW and MoM trends
  const productivityTrends = $derived(
    calculateMetricTrends(trendDataPoints, metricExtractors.productivity)
  );

  // Check if any trend data is limited (actual days < expected)
  const hasLimitedTrendData = $derived.by(() => {
    const weekLimited =
      productivityTrends.week.hasEnoughData &&
      (productivityTrends.week.actualDays ?? 7) < 7;
    const monthLimited =
      productivityTrends.month.hasEnoughData &&
      (productivityTrends.month.actualDays ?? 30) < 30;
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
  const filteredDomainProductivity = $derived.by(
    (): TeamProductivityV1 | null => {
      if (!activeDomainFilter) return null;
      const domainSnapshot = allSnapshots.find(
        (s) => s.level === "domain" && s.levelId === activeDomainFilter
      );
      return domainSnapshot?.snapshot?.teamProductivity || null;
    }
  );

  // Use filtered domain productivity if filter is active, otherwise org-level
  const displayProductivity = $derived(
    filteredDomainProductivity || teamProductivity
  );

  // Check if productivity has TrueThroughput data
  const hasProductivityData = $derived(
    displayProductivity && "trueThroughput" in displayProductivity
  );

  // Productivity values (from display productivity, which respects filter)
  const trueThroughput = $derived(
    hasProductivityData &&
      displayProductivity &&
      "trueThroughput" in displayProductivity
      ? displayProductivity.trueThroughput
      : 0
  );

  const engineerCount = $derived(
    hasProductivityData &&
      displayProductivity &&
      "engineerCount" in displayProductivity
      ? displayProductivity.engineerCount
      : null
  );

  const trueThroughputPerEngineer = $derived(
    hasProductivityData &&
      displayProductivity &&
      "trueThroughputPerEngineer" in displayProductivity
      ? displayProductivity.trueThroughputPerEngineer
      : null
  );

  // Weekly rate per engineer
  const weeklyRatePerEngineer = $derived(
    trueThroughputPerEngineer !== null
      ? toWeeklyRate(trueThroughputPerEngineer)
      : 0
  );

  // Percentage of goal
  const percentOfGoal = $derived(
    weeklyRatePerEngineer > 0
      ? Math.round((weeklyRatePerEngineer / PRODUCTIVITY_GOAL) * 100)
      : 0
  );

  // Total weekly throughput
  const weeklyThroughput = $derived(toWeeklyRate(trueThroughput));

  // Status
  const computedStatus = $derived(displayProductivity?.status || "unknown");

  // Status text colors for the large metric
  const statusTextColors: Record<string, string> = {
    peakFlow: "text-success-400",
    strongRhythm: "text-success-500",
    steadyProgress: "text-warning-500",
    earlyTraction: "text-danger-500",
    lowTraction: "text-danger-600",
    unknown: "text-black-600 dark:text-black-400",
  };

  // Extract domain-level productivity data for table (filtered by active domain)
  const domainProductivityData = $derived.by((): DomainProductivity[] => {
    const domains: DomainProductivity[] = [];

    for (const snapshot of allSnapshots) {
      if (snapshot.level !== "domain" || !snapshot.levelId) continue;

      // Filter by active domain if set
      if (activeDomainFilter && snapshot.levelId !== activeDomainFilter)
        continue;

      const productivity = snapshot.snapshot.teamProductivity;
      if (!productivity || !("trueThroughput" in productivity)) continue;

      const throughput = productivity.trueThroughput;
      const engCount = productivity.engineerCount;
      const perEng = productivity.trueThroughputPerEngineer;
      const weeklyPerEng = perEng !== null ? toWeeklyRate(perEng) : null;

      domains.push({
        domainName: snapshot.levelId,
        trueThroughput: throughput,
        engineerCount: engCount,
        trueThroughputPerEngineer: perEng,
        weeklyRate: toWeeklyRate(throughput),
        weeklyRatePerEngineer: weeklyPerEng,
        percentOfGoal:
          weeklyPerEng !== null
            ? Math.round((weeklyPerEng / PRODUCTIVITY_GOAL) * 100)
            : 0,
        status: productivity.status,
      });
    }

    // Sort by percent of goal (ascending - domains needing attention first)
    return domains.sort((a, b) => a.percentOfGoal - b.percentOfGoal);
  });

  // Domains below threshold (< 100% of goal)
  const domainsBelowThreshold = $derived(
    domainProductivityData.filter((d) => d.percentOfGoal < 100)
  );
</script>

<div class="space-y-6">
  <!-- Page Title -->
  <div class="flex flex-wrap items-center justify-between gap-4">
    <h1 class="text-2xl font-semibold text-black-900 dark:text-white">
      Productivity
    </h1>
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
    <Card class="border-danger-500/50">
      <div
        class="mb-3 text-sm font-medium text-danger-600 dark:text-danger-400"
      >
        Error Loading Data
      </div>
      <p class="text-black-700 dark:text-black-400">{error}</p>
    </Card>
  {:else if displayProductivity}
    <!-- Marquee Hero Section -->
    <div class="py-8 border-b border-black-200 dark:border-white/10">
      <!-- Large metric -->
      <div class="flex items-baseline justify-center gap-4 mb-3">
        <span
          class="text-8xl lg:text-9xl font-bold tracking-tight drop-shadow-sm dark:drop-shadow-none {statusTextColors[
            computedStatus
          ]}"
        >
          {#if hasProductivityData}{percentOfGoal}<span
              class="text-5xl lg:text-6xl font-normal text-black-600 dark:text-black-400"
              >%</span
            >{:else}—{/if}
        </span>
      </div>

      <!-- 7d/30d Trend Chips -->
      {#if hasProductivityData}
        <div class="flex items-center justify-center gap-2 mb-2">
          {#if productivityTrends.week.hasEnoughData}
            {@const actualDays = productivityTrends.week.actualDays ?? 7}
            {@const isLimited = actualDays < 7}
            <TrendChip
              direction={productivityTrends.week.direction}
              percentChange={productivityTrends.week.percentChange}
              period="7d"
              higherIsBetter={true}
              {isLimited}
              tooltip={isLimited
                ? `Based on ${actualDays} days of data`
                : undefined}
            />
          {/if}
          {#if productivityTrends.month.hasEnoughData}
            {@const actualDays = productivityTrends.month.actualDays ?? 30}
            {@const isLimited = actualDays < 30}
            <TrendChip
              direction={productivityTrends.month.direction}
              percentChange={productivityTrends.month.percentChange}
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
      {/if}

      <!-- Subtitle -->
      <p class="text-center text-xl text-black-600 dark:text-black-400 mb-2">
        {#if hasProductivityData}
          TrueThroughput relative to goal
        {:else}
          Awaiting GetDX integration
        {/if}
      </p>
      <p class="text-center text-sm text-black-500">
        {#if hasProductivityData}
          {weeklyRatePerEngineer.toFixed(2)}/wk per engineer (goal: {PRODUCTIVITY_GOAL})
          <Badge status={computedStatus} class="ml-2" />
        {:else}
          Configure GetDX to enable productivity metrics
        {/if}
      </p>

      <!-- Breakdown row -->
      <div class="flex items-center justify-center gap-8 lg:gap-16 mt-8">
        <!-- Total throughput -->
        <div class="text-center">
          <div
            class="text-4xl lg:text-5xl font-bold text-black-900 dark:text-white"
          >
            {weeklyThroughput.toFixed(1)}
          </div>
          <div class="text-sm text-black-600 dark:text-black-400 mt-1">
            Total/week
          </div>
          <div class="text-xs text-black-500">TrueThroughput</div>
        </div>

        <!-- Divider -->
        <div class="h-12 w-px bg-ambient-700 dark:bg-white/10"></div>

        <!-- Domains tracked -->
        <div class="text-center">
          <div
            class="text-4xl lg:text-5xl font-bold text-black-900 dark:text-white"
          >
            {domainProductivityData.length}
          </div>
          <div class="text-sm text-black-600 dark:text-black-400 mt-1">
            Domains
          </div>
          <div class="text-xs text-black-500">with GetDX data</div>
        </div>

        <!-- Divider -->
        <div class="h-12 w-px bg-ambient-700 dark:bg-white/10"></div>

        <!-- Engineer count (org-wide) -->
        <div class="text-center opacity-70">
          <div
            class="text-3xl lg:text-4xl font-bold text-black-900 dark:text-white"
          >
            {engineerCount ?? "—"}
          </div>
          <div class="text-sm text-black-600 dark:text-black-400 mt-1">
            Engineers
          </div>
          <div class="text-xs text-black-500">org-wide</div>
        </div>

        <!-- Divider -->
        <div class="h-12 w-px bg-ambient-700 dark:bg-white/10"></div>

        <!-- Per engineer rate -->
        <div class="text-center opacity-70">
          <div
            class="text-3xl lg:text-4xl font-bold text-black-900 dark:text-white"
          >
            {weeklyRatePerEngineer.toFixed(2)}
          </div>
          <div class="text-sm text-black-600 dark:text-black-400 mt-1">
            Per Eng/wk
          </div>
        </div>

        <!-- Divider -->
        <div class="h-12 w-px bg-ambient-700 dark:bg-white/10"></div>

        <!-- Goal -->
        <div class="text-center opacity-70">
          <div
            class="text-3xl lg:text-4xl font-bold text-black-900 dark:text-white"
          >
            {PRODUCTIVITY_GOAL}
          </div>
          <div class="text-sm text-black-600 dark:text-black-400 mt-1">
            Goal/wk
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
          TrueThroughput measures actual completed work, not just activity.
          Tracking throughput per engineer identifies capacity constraints and
          helps balance workloads. Consistent throughput correlates with
          sustainable velocity.
        </p>
      </div>

      <!-- How it's calculated -->
      <div class="space-y-2">
        <h3 class="text-xs font-medium text-black-500 uppercase tracking-wider">
          How it's calculated
        </h3>
        <p class="text-sm text-black-600 dark:text-black-400">
          TrueThroughput from GetDX measures <strong
            class="text-black-700 dark:text-black-300"
            >merged PRs weighted by complexity</strong
          >. The productivity score compares the per-engineer weekly rate
          against a target of
          <strong class="text-black-700 dark:text-black-300"
            >{PRODUCTIVITY_GOAL} throughput/week</strong
          >.
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

    <!-- Domain Productivity Table -->
    {#if domainProductivityData.length > 0}
      <Card class="p-0 overflow-hidden">
        <div
          class="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-ambient-600 dark:bg-white/5"
        >
          <h3 class="text-sm font-medium text-black-900 dark:text-white">
            Domain Breakdown ({domainProductivityData.length})
          </h3>
          <span class="text-xs text-black-600 dark:text-black-500"
            >TrueThroughput by domain</span
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
                  <th class="pb-3 pr-4 text-right">% of Goal</th>
                  <th class="pb-3 pr-4 text-right">Per Eng/wk</th>
                  <th class="pb-3 pr-4 text-right">Total/wk</th>
                  <th class="pb-3 pr-4 text-right">Engineers</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-black-100 dark:divide-white/5">
                {#each domainProductivityData as domain}
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
                        {domain.percentOfGoal}%
                      </span>
                    </td>
                    <td class="py-3 pr-4 text-right">
                      <span class="text-sm text-black-700 dark:text-black-300">
                        {domain.weeklyRatePerEngineer !== null
                          ? domain.weeklyRatePerEngineer.toFixed(2)
                          : "—"}
                      </span>
                    </td>
                    <td class="py-3 pr-4 text-right">
                      <span class="text-sm text-black-600 dark:text-black-400">
                        {domain.weeklyRate.toFixed(1)}
                      </span>
                    </td>
                    <td class="py-3 pr-4 text-right">
                      <span class="text-sm text-black-600 dark:text-black-400">
                        {domain.engineerCount ?? "—"}
                      </span>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      <!-- Summary: Domains Below Target -->
      {#if domainsBelowThreshold.length > 0}
        <Card class="p-0 overflow-hidden">
          <div
            class="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-ambient-600 dark:bg-white/5"
          >
            <h3 class="text-sm font-medium text-black-900 dark:text-white">
              Domains Needing Attention ({domainsBelowThreshold.length})
            </h3>
            <span class="text-xs text-black-500"
              >Below {PRODUCTIVITY_GOAL}/wk per engineer goal</span
            >
          </div>
          <div class="p-4">
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {#each domainsBelowThreshold as domain}
                <div
                  class="p-4 rounded-lg border border-white/10 bg-ambient-600 dark:bg-white/5"
                >
                  <div class="flex items-center justify-between mb-2">
                    <span
                      class="text-sm font-medium text-black-900 dark:text-white"
                      >{domain.domainName}</span
                    >
                    <Badge status={domain.status} class="text-[10px]" />
                  </div>
                  <div
                    class="text-2xl font-bold text-black-900 dark:text-white"
                  >
                    {domain.percentOfGoal}%
                  </div>
                  <div class="text-xs text-black-500 mt-1">
                    {domain.weeklyRatePerEngineer?.toFixed(2) ?? "—"}/wk per eng
                    (goal: {PRODUCTIVITY_GOAL})
                  </div>
                </div>
              {/each}
            </div>
          </div>
        </Card>
      {:else}
        <Card>
          <div class="py-8 text-center text-black-500">
            All domains meeting productivity goals — great job!
          </div>
        </Card>
      {/if}
    {:else}
      <Card>
        <div class="py-8 text-center">
          <div class="mb-2 text-black-600 dark:text-black-400">
            No domain productivity data available
          </div>
          <p class="text-sm text-black-500">
            Domain-level TrueThroughput requires GetDX integration and domain
            mappings.
          </p>
        </div>
      </Card>
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

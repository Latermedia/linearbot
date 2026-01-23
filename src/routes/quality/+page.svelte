<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import Card from "$lib/components/Card.svelte";
  import IssueTable from "$lib/components/IssueTable.svelte";
  import Skeleton from "$lib/components/Skeleton.svelte";
  import TeamFilterNotice from "$lib/components/TeamFilterNotice.svelte";
  import { teamFilterStore } from "$lib/stores/team-filter";
  import {
    getDomainForTeam,
    getTeamsForDomain,
  } from "../../utils/domain-mapping";
  import type {
    QualityHealthV1,
    MetricsSnapshotV1,
  } from "../../types/metrics-snapshot";
  import type { LatestMetricsResponse } from "../api/metrics/latest/+server";
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

  // KaTeX for rendering math formulas
  let katex: typeof import("katex") | null = null;
  let formulaHtml = $state("");

  // Fetch data on mount
  onMount(async () => {
    if (!browser) return;

    // Load KaTeX (non-blocking)
    import("katex").then((k) => {
      katex = k;
      formulaHtml = katex.default.renderToString(
        "\\text{Quality Score} = 100 - \\left( w_1 \\cdot \\frac{\\text{Open Bugs}}{\\text{Threshold}} + w_2 \\cdot \\frac{\\text{Avg Age}}{\\text{Max Age}} + w_3 \\cdot \\max(0, \\text{Net Change}) \\right)",
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
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load data";
    } finally {
      loading = false;
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

  // Status indicator colors
  const statusColors: Record<string, string> = {
    healthy: "bg-emerald-500",
    warning: "bg-amber-500",
    critical: "bg-red-500",
    unknown: "bg-neutral-500",
  };

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
    <h1 class="text-2xl font-semibold text-white">Quality</h1>
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
  {:else if displayQuality}
    <!-- Marquee Hero Section -->
    <div class="py-8 border-b border-white/10">
      <!-- Large metric -->
      <div class="flex items-baseline justify-center gap-4 mb-3">
        <span class="text-8xl lg:text-9xl font-bold text-white tracking-tight">
          {displayQuality.compositeScore}%
        </span>
      </div>

      <!-- Subtitle -->
      <p class="text-center text-xl text-neutral-400 mb-2">
        Composite quality score
      </p>
      <p class="text-center text-sm text-neutral-500">
        Based on bug count, age, and backlog trend
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
        <!-- Open bugs -->
        <div class="text-center">
          <div class="text-4xl lg:text-5xl font-bold text-white">
            {displayQuality.openBugCount}
          </div>
          <div class="text-sm text-neutral-400 mt-1">Open Bugs</div>
          <div class="text-xs text-neutral-500">total backlog</div>
        </div>

        <!-- Divider -->
        <div class="h-12 w-px bg-white/10"></div>

        <!-- Average age -->
        <div class="text-center">
          <div class="text-4xl lg:text-5xl font-bold text-white">
            {displayQuality.averageBugAgeDays.toFixed(0)}
          </div>
          <div class="text-sm text-neutral-400 mt-1">Avg Age (days)</div>
          <div class="text-xs text-neutral-500">
            max: {displayQuality.maxBugAgeDays.toFixed(0)}d
          </div>
        </div>

        <!-- Divider -->
        <div class="h-12 w-px bg-white/10"></div>

        <!-- Net change -->
        <div class="text-center">
          <div class="text-4xl lg:text-5xl font-bold text-white">
            {displayQuality.netBugChange > 0
              ? "+"
              : ""}{displayQuality.netBugChange}
          </div>
          <div class="text-sm text-neutral-400 mt-1">Net Change</div>
          <div class="text-xs text-neutral-500">in 14 days</div>
        </div>

        <!-- Divider -->
        <div class="h-12 w-px bg-white/10"></div>

        <!-- Opened vs Closed -->
        <div class="text-center opacity-70">
          <div class="text-3xl lg:text-4xl font-bold text-white">
            {displayQuality.bugsOpenedInPeriod} / {displayQuality.bugsClosedInPeriod}
          </div>
          <div class="text-sm text-neutral-400 mt-1">Opened / Closed</div>
          <div class="text-xs text-neutral-500">in 14 days</div>
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
          Bug debt compounds over time. A growing backlog indicates we're
          creating bugs faster than fixing them. Old bugs tend to get harder to
          fix as context fades. Tracking the trend helps catch quality
          regressions early.
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
          The composite score combines <strong class="text-neutral-300"
            >open bug count</strong
          >,
          <strong class="text-neutral-300">average bug age</strong>, and
          <strong class="text-neutral-300">14-day backlog trend</strong>. Higher
          scores indicate healthier quality; 100% means zero bugs.
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

    <!-- Domain Quality Table -->
    {#if domainQualityData.length > 0}
      <Card class="p-0 overflow-hidden">
        <div
          class="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/5"
        >
          <h3 class="text-sm font-medium text-white">
            Domain Breakdown ({domainQualityData.length})
          </h3>
          <span class="text-xs text-neutral-500">Quality metrics by domain</span
          >
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
                  <th class="pb-3 pr-4 text-right">Score</th>
                  <th class="pb-3 pr-4 text-right">Open Bugs</th>
                  <th class="pb-3 pr-4 text-right">Avg Age</th>
                  <th class="pb-3 pr-4 text-right">Net Change</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-white/5">
                {#each domainQualityData as domain}
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
                        {domain.compositeScore}%
                      </span>
                    </td>
                    <td class="py-3 pr-4 text-right">
                      <span class="text-sm text-neutral-300">
                        {domain.openBugCount}
                      </span>
                    </td>
                    <td class="py-3 pr-4 text-right">
                      <span class="text-sm text-neutral-400">
                        {domain.averageBugAgeDays.toFixed(0)}d
                      </span>
                    </td>
                    <td class="py-3 pr-4 text-right">
                      <span class="text-sm text-neutral-300">
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
        class="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/5"
      >
        <h3 class="text-sm font-medium text-white">
          Open Bugs {#if !bugsLoading}({openBugs.length}){/if}
        </h3>
      </div>
      <div class="p-4">
        {#if bugsLoading}
          <div class="py-8 text-center text-neutral-500">Loading bugs...</div>
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
          <div class="py-8 text-center text-neutral-500">
            No open bugs in the backlog — great job!
          </div>
        {/if}
      </div>
    </Card>
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
    font-size: 0.85em;
    color: #e5e5e5;
  }
  .formula-container :global(.katex-display) {
    margin: 0;
  }
</style>

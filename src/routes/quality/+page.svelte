<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import Card from "$lib/components/Card.svelte";
  import IssueTable from "$lib/components/IssueTable.svelte";
  import Skeleton from "$lib/components/Skeleton.svelte";
  import type { QualityHealthV1 } from "../../types/metrics-snapshot";
  import type { LatestMetricsResponse } from "../api/metrics/latest/+server";
  import type { Issue } from "../../db/schema";

  // Data state
  let loading = $state(true);
  let error = $state<string | null>(null);
  let quality = $state<QualityHealthV1 | null>(null);
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

    // Fetch metrics first (fast), then bugs (slower)
    try {
      const metricsRes = await fetch("/api/metrics/latest");
      const metricsData = (await metricsRes.json()) as LatestMetricsResponse;

      if (!metricsData.success) {
        error = metricsData.error || "Failed to fetch metrics";
        loading = false;
        return;
      }

      quality = metricsData.snapshot?.quality || null;
      loading = false;

      // Fetch bugs separately (don't block the main UI)
      try {
        const issuesRes = await fetch(
          "/api/issues?type=bug&status=open&limit=1000"
        );
        const issuesData = await issuesRes.json();
        bugIssues = issuesData.issues || [];
      } catch (e) {
        console.error("Failed to fetch bug issues:", e);
        // Don't set error - bugs list is optional
      } finally {
        bugsLoading = false;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load data";
      loading = false;
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

  // Computed status
  const computedStatus = $derived(quality?.status || "unknown");

  // Open bugs driving the quality metric
  const openBugs = $derived(bugIssues);
</script>

<div class="space-y-6">
  <!-- Page Title -->
  <h1 class="text-2xl font-semibold text-white">Quality</h1>

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
  {:else if quality}
    <!-- Marquee Hero Section -->
    <div class="py-8 border-b border-white/10">
      <!-- Large metric -->
      <div class="flex items-baseline justify-center gap-4 mb-3">
        <span
          class="w-4 h-4 rounded-full {statusColors[
            computedStatus
          ]} self-center"
        ></span>
        <span class="text-8xl lg:text-9xl font-bold text-white tracking-tight">
          {quality.compositeScore}%
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
            {quality.openBugCount}
          </div>
          <div class="text-sm text-neutral-400 mt-1">Open Bugs</div>
          <div class="text-xs text-neutral-500">total backlog</div>
        </div>

        <!-- Divider -->
        <div class="h-12 w-px bg-white/10"></div>

        <!-- Average age -->
        <div class="text-center">
          <div class="text-4xl lg:text-5xl font-bold text-white">
            {quality.averageBugAgeDays.toFixed(0)}
          </div>
          <div class="text-sm text-neutral-400 mt-1">Avg Age (days)</div>
          <div class="text-xs text-neutral-500">
            max: {quality.maxBugAgeDays.toFixed(0)}d
          </div>
        </div>

        <!-- Divider -->
        <div class="h-12 w-px bg-white/10"></div>

        <!-- Net change -->
        <div class="text-center">
          <div class="text-4xl lg:text-5xl font-bold text-white">
            {quality.netBugChange > 0 ? "+" : ""}{quality.netBugChange}
          </div>
          <div class="text-sm text-neutral-400 mt-1">Net Change</div>
          <div class="text-xs text-neutral-500">in 14 days</div>
        </div>

        <!-- Divider -->
        <div class="h-12 w-px bg-white/10"></div>

        <!-- Opened vs Closed -->
        <div class="text-center opacity-70">
          <div class="text-3xl lg:text-4xl font-bold text-white">
            {quality.bugsOpenedInPeriod} / {quality.bugsClosedInPeriod}
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

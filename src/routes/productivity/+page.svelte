<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import Card from "$lib/components/Card.svelte";
  import Skeleton from "$lib/components/Skeleton.svelte";
  import TeamFilterNotice from "$lib/components/TeamFilterNotice.svelte";
  import type {
    TeamProductivityV1,
    MetricsSnapshotV1,
  } from "../../types/metrics-snapshot";
  import type { LatestMetricsResponse } from "../api/metrics/latest/+server";

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
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load data";
    } finally {
      loading = false;
    }
  });

  // Status indicator colors
  const statusColors: Record<string, string> = {
    healthy: "bg-emerald-500",
    warning: "bg-amber-500",
    critical: "bg-red-500",
    unknown: "bg-neutral-500",
    pending: "bg-neutral-500",
  };

  const statusLabels: Record<string, string> = {
    healthy: "Healthy",
    warning: "Warning",
    critical: "Critical",
    unknown: "Unknown",
    pending: "Pending",
  };

  // Check if productivity has TrueThroughput data
  const hasProductivityData = $derived(
    teamProductivity && "trueThroughput" in teamProductivity
  );

  // Productivity values
  const trueThroughput = $derived(
    hasProductivityData && "trueThroughput" in teamProductivity!
      ? teamProductivity!.trueThroughput
      : 0
  );

  const engineerCount = $derived(
    hasProductivityData && "engineerCount" in teamProductivity!
      ? teamProductivity!.engineerCount
      : null
  );

  const trueThroughputPerEngineer = $derived(
    hasProductivityData && "trueThroughputPerEngineer" in teamProductivity!
      ? teamProductivity!.trueThroughputPerEngineer
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
  const computedStatus = $derived(teamProductivity?.status || "unknown");

  // Extract domain-level productivity data for table
  const domainProductivityData = $derived.by((): DomainProductivity[] => {
    const domains: DomainProductivity[] = [];

    for (const snapshot of allSnapshots) {
      if (snapshot.level !== "domain" || !snapshot.levelId) continue;

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
    <h1 class="text-2xl font-semibold text-white">Productivity</h1>
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
  {:else if teamProductivity}
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
          {hasProductivityData ? `${percentOfGoal}%` : "—"}
        </span>
      </div>

      <!-- Subtitle -->
      <p class="text-center text-xl text-neutral-400 mb-2">
        {#if hasProductivityData}
          TrueThroughput relative to goal
        {:else}
          Awaiting GetDX integration
        {/if}
      </p>
      <p class="text-center text-sm text-neutral-500">
        {#if hasProductivityData}
          {weeklyRatePerEngineer.toFixed(2)}/wk per engineer (goal: {PRODUCTIVITY_GOAL})
          <span
            class="ml-2 inline-block text-xs font-medium px-2 py-0.5 rounded {computedStatus ===
            'healthy'
              ? 'bg-emerald-500/20 text-emerald-400'
              : computedStatus === 'warning'
                ? 'bg-amber-500/20 text-amber-400'
                : computedStatus === 'critical'
                  ? 'bg-red-500/20 text-red-400'
                  : 'bg-neutral-500/20 text-neutral-400'}"
          >
            {statusLabels[computedStatus]}
          </span>
        {:else}
          Configure GetDX to enable productivity metrics
        {/if}
      </p>

      <!-- Breakdown row -->
      <div class="flex items-center justify-center gap-8 lg:gap-16 mt-8">
        <!-- Total throughput -->
        <div class="text-center">
          <div class="text-4xl lg:text-5xl font-bold text-white">
            {weeklyThroughput.toFixed(1)}
          </div>
          <div class="text-sm text-neutral-400 mt-1">Total/week</div>
          <div class="text-xs text-neutral-500">TrueThroughput</div>
        </div>

        <!-- Divider -->
        <div class="h-12 w-px bg-white/10"></div>

        <!-- Domains tracked -->
        <div class="text-center">
          <div class="text-4xl lg:text-5xl font-bold text-white">
            {domainProductivityData.length}
          </div>
          <div class="text-sm text-neutral-400 mt-1">Domains</div>
          <div class="text-xs text-neutral-500">with GetDX data</div>
        </div>

        <!-- Divider -->
        <div class="h-12 w-px bg-white/10"></div>

        <!-- Engineer count (org-wide) -->
        <div class="text-center opacity-70">
          <div class="text-3xl lg:text-4xl font-bold text-white">
            {engineerCount ?? "—"}
          </div>
          <div class="text-sm text-neutral-400 mt-1">Engineers</div>
          <div class="text-xs text-neutral-500">org-wide</div>
        </div>

        <!-- Divider -->
        <div class="h-12 w-px bg-white/10"></div>

        <!-- Per engineer rate -->
        <div class="text-center opacity-70">
          <div class="text-3xl lg:text-4xl font-bold text-white">
            {weeklyRatePerEngineer.toFixed(2)}
          </div>
          <div class="text-sm text-neutral-400 mt-1">Per Eng/wk</div>
        </div>

        <!-- Divider -->
        <div class="h-12 w-px bg-white/10"></div>

        <!-- Goal -->
        <div class="text-center opacity-70">
          <div class="text-3xl lg:text-4xl font-bold text-emerald-400">
            {PRODUCTIVITY_GOAL}
          </div>
          <div class="text-sm text-neutral-400 mt-1">Goal/wk</div>
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
          TrueThroughput measures actual completed work, not just activity.
          Tracking throughput per engineer identifies capacity constraints and
          helps balance workloads. Consistent throughput correlates with
          sustainable velocity.
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
          TrueThroughput from GetDX measures <strong class="text-neutral-300"
            >merged PRs weighted by complexity</strong
          >. The productivity score compares the per-engineer weekly rate
          against a target of
          <strong class="text-neutral-300"
            >{PRODUCTIVITY_GOAL} throughput/week</strong
          >.
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

    <!-- Domain Productivity Table -->
    {#if domainProductivityData.length > 0}
      <Card class="p-0 overflow-hidden">
        <div
          class="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/5"
        >
          <h3 class="text-sm font-medium text-white">
            Domain Breakdown ({domainProductivityData.length})
          </h3>
          <span class="text-xs text-neutral-500">TrueThroughput by domain</span>
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
                  <th class="pb-3 pr-4 text-right">% of Goal</th>
                  <th class="pb-3 pr-4 text-right">Per Eng/wk</th>
                  <th class="pb-3 pr-4 text-right">Total/wk</th>
                  <th class="pb-3 pr-4 text-right">Engineers</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-white/5">
                {#each domainProductivityData as domain}
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
                        {domain.percentOfGoal}%
                      </span>
                    </td>
                    <td class="py-3 pr-4 text-right">
                      <span class="text-sm text-neutral-300">
                        {domain.weeklyRatePerEngineer !== null
                          ? domain.weeklyRatePerEngineer.toFixed(2)
                          : "—"}
                      </span>
                    </td>
                    <td class="py-3 pr-4 text-right">
                      <span class="text-sm text-neutral-400">
                        {domain.weeklyRate.toFixed(1)}
                      </span>
                    </td>
                    <td class="py-3 pr-4 text-right">
                      <span class="text-sm text-neutral-400">
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
            class="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/5"
          >
            <h3 class="text-sm font-medium text-white">
              Domains Needing Attention ({domainsBelowThreshold.length})
            </h3>
            <span class="text-xs text-neutral-500"
              >Below {PRODUCTIVITY_GOAL}/wk per engineer goal</span
            >
          </div>
          <div class="p-4">
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {#each domainsBelowThreshold as domain}
                <div class="p-4 rounded-lg border border-white/10 bg-white/5">
                  <div class="flex items-center justify-between mb-2">
                    <span class="text-sm font-medium text-white"
                      >{domain.domainName}</span
                    >
                    <span
                      class="w-2 h-2 rounded-full {statusColors[domain.status]}"
                    ></span>
                  </div>
                  <div class="text-2xl font-bold text-white">
                    {domain.percentOfGoal}%
                  </div>
                  <div class="text-xs text-neutral-500 mt-1">
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
          <div class="py-8 text-center text-neutral-500">
            All domains meeting productivity goals — great job!
          </div>
        </Card>
      {/if}
    {:else}
      <Card>
        <div class="py-8 text-center">
          <div class="mb-2 text-neutral-400">
            No domain productivity data available
          </div>
          <p class="text-sm text-neutral-500">
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

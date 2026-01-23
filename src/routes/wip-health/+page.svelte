<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import Card from "$lib/components/Card.svelte";
  import EngineersTable from "$lib/components/EngineersTable.svelte";
  import EngineerDetailModal from "$lib/components/EngineerDetailModal.svelte";
  import Skeleton from "$lib/components/Skeleton.svelte";
  import {
    teamFilterStore,
    teamNamesMatchFilter,
  } from "$lib/stores/team-filter";
  import { teamsStore } from "$lib/stores/database";
  import type { TeamHealthV1 } from "../../types/metrics-snapshot";
  import type { LatestMetricsResponse } from "../api/metrics/latest/+server";

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

  // Props from page.server.ts
  let { data } = $props();

  // Data state
  let loading = $state(true);
  let error = $state<string | null>(null);
  let teamHealth = $state<TeamHealthV1 | null>(null);
  let allEngineers = $state<EngineerData[]>([]);

  // Engineer modal state
  let selectedEngineer = $state<EngineerData | null>(null);

  // KaTeX for rendering math formulas
  let katex: typeof import("katex") | null = null;
  let formulaHtml = $state("");

  // Team filter state
  const teams = $derived($teamsStore);
  const selectedTeamKey = $derived($teamFilterStore);
  const selectedTeamName = $derived.by(() => {
    if (!selectedTeamKey) return null;
    const team = teams.find((t) => t.teamKey === selectedTeamKey);
    return team?.teamName || selectedTeamKey;
  });

  // Fetch data based on team filter
  async function fetchData(teamKey: string | null) {
    loading = true;
    error = null;

    try {
      // Build metrics URL based on team filter
      const metricsUrl = teamKey
        ? `/api/metrics/latest?level=team&levelId=${encodeURIComponent(teamKey)}`
        : "/api/metrics/latest";

      const [metricsRes, engineersRes] = await Promise.all([
        fetch(metricsUrl),
        fetch("/api/engineers"),
      ]);

      const metricsData = (await metricsRes.json()) as LatestMetricsResponse;
      const engineersData = await engineersRes.json();

      if (!metricsData.success) {
        error = metricsData.error || "Failed to fetch metrics";
        return;
      }

      teamHealth = metricsData.snapshot?.teamHealth || null;
      allEngineers = engineersData.engineers || [];
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load data";
    } finally {
      loading = false;
    }
  }

  // Track last fetched team key to avoid double fetching
  let lastFetchedTeamKey: string | null | undefined = undefined;

  // Initial setup
  onMount(async () => {
    if (!browser) return;

    // Load KaTeX
    katex = await import("katex");
    if (katex) {
      formulaHtml = katex.default.renderToString(
        "\\text{WIP Health} = \\frac{\\displaystyle\\sum_{i=1}^{N} \\mathbf{1}\\bigl[\\text{issues}_i \\leq 5 \\;\\land\\; \\text{projects}_i = 1\\bigr]}{N} \\times 100",
        { throwOnError: false, displayMode: true }
      );
    }
  });

  // Fetch data when team filter changes (including initial load)
  $effect(() => {
    if (browser && lastFetchedTeamKey !== selectedTeamKey) {
      lastFetchedTeamKey = selectedTeamKey;
      fetchData(selectedTeamKey);
    }
  });

  // Get the engineer team mapping
  const engineerTeamMapping = $derived(data.engineerTeamMapping || {});
  const hasMappingConfigured = $derived(
    Object.keys(engineerTeamMapping).length > 0
  );

  // Get engineers mapped to the selected team (from ENGINEER_TEAM_MAPPING)
  const teamMappedEngineerNames = $derived.by(() => {
    if (!hasMappingConfigured) return new Set<string>();

    // If team filter is active, only include engineers mapped to that team
    if (selectedTeamKey) {
      return new Set(
        Object.entries(engineerTeamMapping)
          .filter(([_, teamKey]) => teamKey === selectedTeamKey)
          .map(([name]) => name)
      );
    }

    // No filter - include all mapped engineers
    return new Set(Object.keys(engineerTeamMapping));
  });

  // Filter to only mapped engineers (or all if no mapping configured)
  // Also apply team filter when active
  const engineers = $derived.by(() => {
    let filtered = allEngineers;

    // First filter by ENGINEER_TEAM_MAPPING (respecting team filter)
    if (hasMappingConfigured) {
      filtered = filtered.filter((e) =>
        teamMappedEngineerNames.has(e.assignee_name)
      );
    }

    // Then filter by team filter when active (for engineers not in mapping but with team_names)
    if (selectedTeamKey && selectedTeamName) {
      filtered = filtered.filter((e) =>
        teamNamesMatchFilter(e.team_names, selectedTeamName)
      );
    }

    return filtered;
  });

  // Calculate stats from filtered engineers
  // When team filter is active, use the count of engineers mapped to that team
  const totalEngineerCount = $derived(
    hasMappingConfigured ? teamMappedEngineerNames.size : engineers.length
  );

  // Engineers with 6+ issues
  const wipViolationEngineers = $derived(
    engineers.filter((e) => e.wip_limit_violation === 1)
  );

  // Engineers on 2+ projects
  const multiProjectEngineers = $derived(
    engineers.filter((e) => e.multi_project_violation === 1)
  );

  // Combined: engineers with ANY violation (union of both)
  const overloadedEngineers = $derived(
    engineers.filter(
      (e) => e.wip_limit_violation === 1 || e.multi_project_violation === 1
    )
  );

  // Healthy count = total - overloaded
  // This accounts for engineers in the mapping who have no WIP data (they have 0 issues = healthy)
  const healthyCount = $derived(
    totalEngineerCount - overloadedEngineers.length
  );

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

  // Calculate healthy percentage
  const healthyPercent = $derived(
    totalEngineerCount > 0
      ? ((healthyCount / totalEngineerCount) * 100).toFixed(0)
      : "0"
  );

  // Determine status based on healthy percentage
  const computedStatus = $derived.by((): "healthy" | "warning" | "critical" => {
    const pct = parseFloat(healthyPercent);
    if (pct >= 80) return "healthy";
    if (pct >= 60) return "warning";
    return "critical";
  });

  function closeEngineerModal() {
    selectedEngineer = null;
  }
</script>

<div class="space-y-6">
  <!-- Page Title -->
  <div class="flex flex-wrap items-center gap-3">
    <h1 class="text-2xl font-semibold text-white">WIP Health</h1>
    {#if selectedTeamName}
      <span class="text-sm text-neutral-400">— {selectedTeamName}</span>
    {/if}
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
  {:else if teamHealth}
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
          {healthyPercent}%
        </span>
      </div>

      <!-- Subtitle -->
      <p class="text-center text-xl text-neutral-400 mb-2">
        Engineers within WIP constraints
      </p>
      <p class="text-center text-sm text-neutral-500">
        {healthyCount} of {totalEngineerCount} engineers
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
        <!-- Overloaded (combined) -->
        <div class="text-center">
          <div class="text-4xl lg:text-5xl font-bold text-white">
            {overloadedEngineers.length}
          </div>
          <div class="text-sm text-neutral-400 mt-1">Overloaded</div>
          <div class="text-xs text-neutral-500">need attention</div>
        </div>

        <!-- Divider -->
        <div class="h-12 w-px bg-white/10"></div>

        <!-- 6+ issues breakdown -->
        <div class="text-center opacity-70">
          <div class="text-3xl lg:text-4xl font-bold text-white">
            {wipViolationEngineers.length}
          </div>
          <div class="text-sm text-neutral-400 mt-1">6+ issues</div>
        </div>

        <!-- Divider -->
        <div class="h-12 w-px bg-white/10"></div>

        <!-- Context-switching breakdown -->
        <div class="text-center opacity-70">
          <div class="text-3xl lg:text-4xl font-bold text-white">
            {multiProjectEngineers.length}
          </div>
          <div class="text-sm text-neutral-400 mt-1">2+ projects</div>
        </div>

        <!-- Divider -->
        <div class="h-12 w-px bg-white/10"></div>

        <!-- Projects impacted -->
        <div class="text-center opacity-70">
          <div class="text-3xl lg:text-4xl font-bold text-white">
            {teamHealth.impactedProjectCount}
          </div>
          <div class="text-sm text-neutral-400 mt-1">Projects impacted</div>
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
          WIP constraints reduce cycle time by limiting queue depth. Overloaded
          engineers create bottlenecks; context-switching across projects
          compounds delays through task-switching overhead.
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
          An engineer is "within constraints" when they have <strong
            class="text-neutral-300">5 or fewer</strong
          >
          in-progress issues AND are focused on a
          <strong class="text-neutral-300">single project</strong>.
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

    <!-- Overloaded Engineers Table -->
    <Card class="p-0 overflow-hidden">
      <div
        class="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/5"
      >
        <h3 class="text-sm font-medium text-white">
          Overloaded Engineers ({overloadedEngineers.length})
        </h3>
        <span class="text-xs text-neutral-500"> 6+ issues or 2+ projects </span>
      </div>
      <div class="p-4">
        {#if overloadedEngineers.length > 0}
          <EngineersTable
            engineers={overloadedEngineers}
            onEngineerClick={(engineer) => {
              selectedEngineer = engineer;
            }}
          />
        {:else}
          <div class="py-8 text-center text-neutral-500">
            No engineers currently overloaded — great job!
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
    color: #e5e5e5;
  }
  .formula-container :global(.katex-display) {
    margin: 0;
  }
</style>

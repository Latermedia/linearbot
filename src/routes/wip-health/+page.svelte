<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import Card from "$lib/components/Card.svelte";
  import EngineersTable from "$lib/components/EngineersTable.svelte";
  import EngineerDetailModal from "$lib/components/EngineerDetailModal.svelte";
  import Skeleton from "$lib/components/Skeleton.svelte";
  import TeamFilterNotice from "$lib/components/TeamFilterNotice.svelte";
  import type {
    TeamHealthV1,
    MetricsSnapshotV1,
  } from "../../types/metrics-snapshot";
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

  // Domain WIP health data for table
  interface DomainWipHealth {
    domainName: string;
    healthyWorkloadPercent: number;
    healthyIcCount: number;
    totalIcCount: number;
    wipViolationCount: number;
    multiProjectViolationCount: number;
    impactedProjectCount: number;
    status: string;
  }

  // Props from page.server.ts
  let { data } = $props();

  // Data state
  let loading = $state(true);
  let error = $state<string | null>(null);
  let teamHealth = $state<TeamHealthV1 | null>(null);
  let allSnapshots = $state<
    Array<{
      level: string;
      levelId: string | null;
      snapshot: MetricsSnapshotV1;
      capturedAt: string;
    }>
  >([]);
  let allEngineers = $state<EngineerData[]>([]);

  // Engineer modal state
  let selectedEngineer = $state<EngineerData | null>(null);

  // KaTeX for rendering math formulas
  let katex: typeof import("katex") | null = null;
  let formulaHtml = $state("");

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

    // Fetch all metrics snapshots (including domain-level) and engineers
    try {
      const [metricsRes, engineersRes] = await Promise.all([
        fetch("/api/metrics/latest?all=true"),
        fetch("/api/engineers"),
      ]);

      const metricsData = (await metricsRes.json()) as LatestMetricsResponse;
      const engineersData = await engineersRes.json();

      if (!metricsData.success) {
        error = metricsData.error || "Failed to fetch metrics";
        return;
      }

      allSnapshots = metricsData.snapshots || [];
      allEngineers = engineersData.engineers || [];

      // Extract org-level team health
      const orgSnapshot = allSnapshots.find((s) => s.level === "org");
      teamHealth = orgSnapshot?.snapshot?.teamHealth || null;
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load data";
    } finally {
      loading = false;
    }
  });

  // Get the engineer team mapping
  const engineerTeamMapping = $derived(data.engineerTeamMapping || {});
  const hasMappingConfigured = $derived(
    Object.keys(engineerTeamMapping).length > 0
  );

  // Get engineers mapped (from ENGINEER_TEAM_MAPPING)
  const teamMappedEngineerNames = $derived.by(() => {
    if (!hasMappingConfigured) return new Set<string>();
    return new Set(Object.keys(engineerTeamMapping));
  });

  // Filter to only mapped engineers (or all if no mapping configured)
  const engineers = $derived.by(() => {
    if (!hasMappingConfigured) return allEngineers;
    return allEngineers.filter((e) =>
      teamMappedEngineerNames.has(e.assignee_name)
    );
  });

  // Calculate stats from filtered engineers
  const totalEngineerCount = $derived(
    hasMappingConfigured ? teamMappedEngineerNames.size : engineers.length
  );

  // Extract domain-level WIP health data for table
  const domainWipHealthData = $derived.by((): DomainWipHealth[] => {
    const domains: DomainWipHealth[] = [];

    for (const snapshot of allSnapshots) {
      if (snapshot.level !== "domain" || !snapshot.levelId) continue;

      const health = snapshot.snapshot.teamHealth;
      if (!health) continue;

      domains.push({
        domainName: snapshot.levelId,
        healthyWorkloadPercent: health.healthyWorkloadPercent,
        healthyIcCount: health.healthyIcCount,
        totalIcCount: health.totalIcCount,
        wipViolationCount: health.wipViolationCount,
        multiProjectViolationCount: health.multiProjectViolationCount,
        impactedProjectCount: health.impactedProjectCount,
        status: health.status,
      });
    }

    // Sort by healthy percent (ascending - domains needing attention first)
    return domains.sort(
      (a, b) => a.healthyWorkloadPercent - b.healthyWorkloadPercent
    );
  });

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
  <div class="flex flex-wrap items-center justify-between gap-4">
    <h1 class="text-2xl font-semibold text-white">WIP Health</h1>
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
  {:else if teamHealth}
    <!-- Marquee Hero Section -->
    <div class="py-8 border-b border-white/10">
      <!-- Large metric -->
      <div class="flex items-baseline justify-center gap-4 mb-3">
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

    <!-- Domain WIP Health Table -->
    {#if domainWipHealthData.length > 0}
      <Card class="p-0 overflow-hidden">
        <div
          class="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/5"
        >
          <h3 class="text-sm font-medium text-white">
            Domain Breakdown ({domainWipHealthData.length})
          </h3>
          <span class="text-xs text-neutral-500">WIP health by domain</span>
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
                  <th class="pb-3 pr-4 text-right">Healthy %</th>
                  <th class="pb-3 pr-4 text-right">6+ Issues</th>
                  <th class="pb-3 pr-4 text-right">2+ Projects</th>
                  <th class="pb-3 pr-4 text-right">Engineers</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-white/5">
                {#each domainWipHealthData as domain}
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
                        {domain.healthyWorkloadPercent.toFixed(0)}%
                      </span>
                      <span class="text-xs text-neutral-500 ml-1">
                        ({domain.healthyIcCount}/{domain.totalIcCount})
                      </span>
                    </td>
                    <td class="py-3 pr-4 text-right">
                      <span class="text-sm text-neutral-300">
                        {domain.wipViolationCount}
                      </span>
                    </td>
                    <td class="py-3 pr-4 text-right">
                      <span class="text-sm text-neutral-300">
                        {domain.multiProjectViolationCount}
                      </span>
                    </td>
                    <td class="py-3 pr-4 text-right">
                      <span class="text-sm text-neutral-400">
                        {domain.totalIcCount}
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

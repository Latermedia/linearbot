<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import Card from "$lib/components/Card.svelte";
  import Skeleton from "$lib/components/Skeleton.svelte";
  import Badge from "$lib/components/Badge.svelte";
  import ProjectDetailModal from "$lib/components/ProjectDetailModal.svelte";
  import FourPillarsChart from "$lib/components/FourPillarsChart.svelte";
  import { databaseStore, projectsStore } from "$lib/stores/database";
  import type { ProjectSummary } from "$lib/project-data";
  import type {
    MetricsSnapshotV1,
    PillarStatus,
    ProductivityStatus,
    TeamProductivityV1,
  } from "../../types/metrics-snapshot";
  import type { LatestMetricsResponse } from "../api/metrics/latest/+server";
  import type {
    TrendDataPoint,
    TrendsResponse,
  } from "../api/metrics/trends/+server";

  // Engineering principles - rotates every 5 seconds
  const principles = [
    "Principles over process",
    "Don't Make Me Think",
    "WIP Constraints",
    "Work in public",
    "Async First",
    "Doings > Meetings",
    "Velocity > Predictability",
    "Single Source of Truth",
    "Iterate to innovate",
    "Clear, concise, complete",
    "Ship value daily",
    "POC is worth 1k meetings",
    "Go slow to go fast",
    "Mind the gaps",
  ];

  // Rotating principle state
  let principleIndex = $state(Math.floor(Math.random() * principles.length));
  let isAnimating = $state(false);
  const currentPrinciple = $derived(principles[principleIndex]);

  // Rotate principles every 5 seconds with blur poof animation
  $effect(() => {
    if (!browser) return;

    const interval = setInterval(() => {
      isAnimating = true;
      setTimeout(() => {
        principleIndex = (principleIndex + 1) % principles.length;
        isAnimating = false;
      }, 400); // Swap text at peak of blur
    }, 5000);

    return () => clearInterval(interval);
  });

  // State
  let loading = $state(true);
  let error = $state<string | null>(null);
  let orgSnapshot = $state<MetricsSnapshotV1 | null>(null);
  let allSnapshots = $state<
    Array<{
      level: string;
      levelId: string | null;
      snapshot: MetricsSnapshotV1;
      capturedAt: string;
    }>
  >([]);
  let selectedLevel = $state<"org" | "domain" | "team">("org");
  let teamNames = $state<Record<string, string>>({});

  // Trend data state
  let trendDataPoints = $state<TrendDataPoint[]>([]);
  let trendLoading = $state(true);

  // Fetch metrics data
  async function fetchMetrics() {
    if (!browser) return;

    loading = true;
    error = null;

    try {
      // Fetch all latest snapshots
      const response = await fetch("/api/metrics/latest?all=true");
      const data = (await response.json()) as LatestMetricsResponse;

      if (!data.success) {
        error = data.error || "Failed to fetch metrics";
        return;
      }

      allSnapshots = data.snapshots || [];
      teamNames = data.teamNames || {};

      // Extract org snapshot
      const org = allSnapshots.find((s) => s.level === "org");
      orgSnapshot = org?.snapshot || null;
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to fetch metrics";
    } finally {
      loading = false;
    }
  }

  // Fetch trend data for all-time view
  async function fetchTrendData() {
    if (!browser) return;

    trendLoading = true;

    try {
      // Fetch all available trend data (high limit to get all-time data)
      const response = await fetch("/api/metrics/trends?level=org&limit=10000");
      const data = (await response.json()) as TrendsResponse;

      if (data.success && data.dataPoints) {
        // Sort by capturedAt ascending (oldest first, time flows left to right)
        trendDataPoints = data.dataPoints.sort(
          (a, b) =>
            new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime()
        );
      }
    } catch (e) {
      console.error("Failed to fetch trend data:", e);
    } finally {
      trendLoading = false;
    }
  }

  // State for project detail modal
  let selectedProject = $state<ProjectSummary | null>(null);

  function handleProjectClick(projectId: string): void {
    const project = $projectsStore.get(projectId);
    if (project) {
      selectedProject = project;
    }
  }

  function closeModal(): void {
    selectedProject = null;
  }

  // Load on mount
  onMount(() => {
    fetchMetrics();
    fetchTrendData();
    databaseStore.load();
  });

  // Get status color classes (works for both PillarStatus and ProductivityStatus)
  function getStatusClasses(status: PillarStatus | ProductivityStatus): {
    bg: string;
    text: string;
    border: string;
  } {
    switch (status) {
      case "healthy":
        return {
          bg: "bg-emerald-500/10",
          text: "text-emerald-400",
          border: "border-emerald-500/30",
        };
      case "warning":
        return {
          bg: "bg-amber-500/10",
          text: "text-amber-400",
          border: "border-amber-500/30",
        };
      case "critical":
        return {
          bg: "bg-red-500/10",
          text: "text-red-400",
          border: "border-red-500/30",
        };
      case "unknown":
        return {
          bg: "bg-blue-500/10",
          text: "text-blue-400",
          border: "border-blue-500/30",
        };
      case "pending":
        return {
          bg: "bg-neutral-500/10",
          text: "text-neutral-400",
          border: "border-neutral-500/30",
        };
      default:
        return {
          bg: "bg-neutral-500/10",
          text: "text-neutral-400",
          border: "border-neutral-500/30",
        };
    }
  }

  // Measurement period in weeks (data is aggregated over 14 days = 2 weeks)
  const MEASUREMENT_PERIOD_WEEKS = 2;

  // Check if productivity has TrueThroughput data
  function hasProductivityData(p: TeamProductivityV1): p is {
    trueThroughput: number;
    engineerCount: number | null;
    trueThroughputPerEngineer: number | null;
    status: ProductivityStatus;
  } {
    return "trueThroughput" in p;
  }

  // Convert 14-day throughput to weekly rate
  function toWeeklyRate(value: number): number {
    return value / MEASUREMENT_PERIOD_WEEKS;
  }

  // Get productivity display string (as weekly rate)
  function _getProductivityDisplay(p: TeamProductivityV1): string {
    if (hasProductivityData(p)) {
      const weeklyRate = toWeeklyRate(p.trueThroughput);
      return `${weeklyRate.toFixed(1)}/wk`;
    }
    return "—";
  }

  // Get per-IC weekly rate
  function _getPerICWeeklyRate(p: TeamProductivityV1): string {
    if (hasProductivityData(p) && p.trueThroughputPerEngineer !== null) {
      const weeklyPerIC = toWeeklyRate(p.trueThroughputPerEngineer);
      return `${weeklyPerIC.toFixed(2)}/wk`;
    }
    return "—";
  }

  // Get team display name: "Full Name (KEY)" or just "KEY" if no full name
  function getTeamDisplayName(teamKey: string | null): string {
    if (!teamKey) return "Unknown";
    const fullName = teamNames[teamKey];
    if (fullName) {
      return `${fullName} (${teamKey})`;
    }
    return teamKey;
  }

  // Get domain snapshots
  const domainSnapshots = $derived(
    allSnapshots.filter((s) => s.level === "domain")
  );

  // Get team snapshots
  const teamSnapshots = $derived(
    allSnapshots.filter((s) => s.level === "team")
  );

  // Currently viewed snapshot based on level (for future use)
  const _currentSnapshot = $derived.by(() => {
    if (selectedLevel === "org") return orgSnapshot;
    // For domain/team views, we could add a selector later
    return orgSnapshot;
  });

  // Status classes for each pillar (derived from orgSnapshot)
  const teamHealthStatusClasses = $derived(
    orgSnapshot ? getStatusClasses(orgSnapshot.teamHealth.status) : null
  );
  const velocityStatusClasses = $derived(
    orgSnapshot ? getStatusClasses(orgSnapshot.velocityHealth.status) : null
  );
  const qualityStatusClasses = $derived(
    orgSnapshot ? getStatusClasses(orgSnapshot.quality.status) : null
  );

  // Project Health derived counts (split by source: Self-reported vs Trajectory Alert)
  const velocityCounts = $derived.by(() => {
    if (!orgSnapshot) return null;
    const statuses = orgSnapshot.velocityHealth.projectStatuses;
    return {
      atRiskHuman: statuses.filter(
        (p) => p.effectiveHealth === "atRisk" && p.healthSource === "human"
      ).length,
      atRiskVelocity: statuses.filter(
        (p) => p.effectiveHealth === "atRisk" && p.healthSource === "velocity"
      ).length,
      offTrackHuman: statuses.filter(
        (p) => p.effectiveHealth === "offTrack" && p.healthSource === "human"
      ).length,
      offTrackVelocity: statuses.filter(
        (p) => p.effectiveHealth === "offTrack" && p.healthSource === "velocity"
      ).length,
      total: statuses.length,
      onTrack: statuses.filter((p) => p.effectiveHealth === "onTrack").length,
    };
  });

  // Productivity derived values
  const orgProductivity = $derived(orgSnapshot?.teamProductivity ?? null);
  const orgHasProductivityData = $derived(
    orgProductivity ? hasProductivityData(orgProductivity) : false
  );
  const productivityStatusClasses = $derived(
    orgProductivity ? getStatusClasses(orgProductivity.status) : null
  );
</script>

<div class="space-y-6">
  <!-- Header -->
  <div>
    <h1 class="text-2xl font-semibold tracking-tight text-white">
      Engineering Metrics
    </h1>
    <div class="relative h-6 mt-1 -ml-4 pl-4 -mr-4 pr-4 overflow-hidden">
      <p
        class="absolute left-4 right-4 top-0 text-sm text-neutral-400 italic principle-text {isAnimating
          ? 'principle-exit'
          : 'principle-enter'}"
      >
        {currentPrinciple}
      </p>
    </div>
  </div>

  <!-- Loading State -->
  {#if loading && !orgSnapshot}
    <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {#each [1, 2, 3, 4] as i (i)}
        <Card>
          <Skeleton class="mb-3 w-24 h-4" />
          <Skeleton class="mb-2 w-16 h-8" />
          <Skeleton class="w-full h-2" />
        </Card>
      {/each}
    </div>
  {:else if error}
    <!-- Error State -->
    <Card class="border-red-500/30">
      <div class="mb-2 text-sm font-medium text-red-400">
        Failed to load metrics
      </div>
      <p class="text-sm text-neutral-400">{error}</p>
      <p class="mt-2 text-xs text-neutral-500">
        Metrics are captured hourly after each sync. If you haven't synced yet,
        run a sync first or trigger a manual capture.
      </p>
    </Card>
  {:else if orgSnapshot}
    <!-- Health Metrics Overview -->
    <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <!-- Pillar 1: WIP Health -->
      <Card
        class="transition-colors duration-150 hover:bg-white/5 {teamHealthStatusClasses?.border ||
          ''} border"
      >
        <div class="flex justify-between items-start mb-3">
          <div
            class="text-xs font-medium tracking-wide uppercase text-neutral-400"
          >
            WIP Health
          </div>
          <Badge
            variant={orgSnapshot.teamHealth.status === "healthy"
              ? "success"
              : orgSnapshot.teamHealth.status === "warning"
                ? "warning"
                : "destructive"}
          >
            {orgSnapshot.teamHealth.status}
          </Badge>
        </div>

        <div class="space-y-3">
          <div>
            <div
              class="text-2xl font-semibold {teamHealthStatusClasses?.text ||
                ''}"
            >
              {orgSnapshot.teamHealth.healthyWorkloadPercent.toFixed(0)}%
            </div>
            <div class="text-xs text-neutral-500">Healthy Workloads</div>
          </div>

          <div class="space-y-0.5 text-xs">
            <div>
              <span class="font-semibold text-neutral-400"
                >{orgSnapshot.teamHealth.wipViolationCount}</span
              >
              <span class="text-neutral-500">ICs overloaded (6+ issues)</span>
            </div>
            <div>
              <span class="font-semibold text-neutral-400"
                >{orgSnapshot.teamHealth.multiProjectViolationCount}</span
              >
              <span class="text-neutral-500"
                >ICs context-switching (2+ proj)</span
              >
            </div>
            <div>
              <span class="font-semibold text-neutral-400"
                >{orgSnapshot.teamHealth.impactedProjectCount}</span
              >
              <span class="text-neutral-500"
                >of {orgSnapshot.teamHealth.totalProjectCount} projects impacted</span
              >
            </div>
          </div>
        </div>
      </Card>

      <!-- Pillar 2: Project Health -->
      <Card
        class="transition-colors duration-150 hover:bg-white/5 {velocityStatusClasses?.border ||
          ''} border"
      >
        <div class="flex justify-between items-start mb-3">
          <div
            class="text-xs font-medium tracking-wide uppercase text-neutral-400"
          >
            Project Health
          </div>
          <Badge
            variant={orgSnapshot.velocityHealth.status === "healthy"
              ? "success"
              : orgSnapshot.velocityHealth.status === "warning"
                ? "warning"
                : "destructive"}
          >
            {orgSnapshot.velocityHealth.status}
          </Badge>
        </div>

        <div class="space-y-3">
          <div>
            <div
              class="text-2xl font-semibold {velocityStatusClasses?.text || ''}"
            >
              {orgSnapshot.velocityHealth.onTrackPercent.toFixed(0)}%
            </div>
            <div class="text-xs text-neutral-500">
              {velocityCounts?.onTrack ?? 0} of {velocityCounts?.total ?? 0} projects
              on track
            </div>
          </div>

          {#if velocityCounts}
            {@const hasIssues =
              velocityCounts.atRiskHuman > 0 ||
              velocityCounts.offTrackHuman > 0 ||
              velocityCounts.atRiskVelocity > 0 ||
              velocityCounts.offTrackVelocity > 0}
            {#if hasIssues}
              <div class="flex justify-between text-xs">
                {#if velocityCounts.atRiskHuman > 0 || velocityCounts.offTrackHuman > 0}
                  <div class="space-y-0.5">
                    <div
                      class="text-neutral-500 text-[10px] uppercase tracking-wider"
                    >
                      Self-reported
                    </div>
                    {#if velocityCounts.atRiskHuman > 0}
                      <div>
                        <span class="font-semibold text-neutral-400"
                          >{velocityCounts.atRiskHuman}</span
                        >
                        <span class="text-neutral-500">at risk</span>
                      </div>
                    {/if}
                    {#if velocityCounts.offTrackHuman > 0}
                      <div>
                        <span class="font-semibold text-neutral-400"
                          >{velocityCounts.offTrackHuman}</span
                        >
                        <span class="text-neutral-500">off track</span>
                      </div>
                    {/if}
                  </div>
                {/if}
                {#if velocityCounts.atRiskVelocity > 0 || velocityCounts.offTrackVelocity > 0}
                  <div class="space-y-0.5">
                    <div
                      class="text-neutral-500 text-[10px] uppercase tracking-wider"
                    >
                      Trajectory Alert
                    </div>
                    {#if velocityCounts.atRiskVelocity > 0}
                      <div>
                        <span class="font-semibold text-neutral-400"
                          >{velocityCounts.atRiskVelocity}</span
                        >
                        <span class="text-neutral-500">at risk</span>
                      </div>
                    {/if}
                    {#if velocityCounts.offTrackVelocity > 0}
                      <div>
                        <span class="font-semibold text-neutral-400"
                          >{velocityCounts.offTrackVelocity}</span
                        >
                        <span class="text-neutral-500">off track</span>
                      </div>
                    {/if}
                  </div>
                {/if}
              </div>
            {:else}
              <div class="text-xs text-neutral-500">All projects on track</div>
            {/if}
          {/if}
        </div>
      </Card>

      <!-- Pillar 3: Team Productivity -->
      <Card
        class="border transition-colors duration-150 hover:bg-white/5 {orgHasProductivityData
          ? productivityStatusClasses?.border
          : 'border-neutral-700/50 opacity-60'}"
      >
        <div class="flex justify-between items-start mb-3">
          <div
            class="text-xs font-medium tracking-wide uppercase text-neutral-400"
          >
            Productivity
          </div>
          {#if orgHasProductivityData && orgProductivity && "trueThroughput" in orgProductivity}
            <Badge
              variant={orgProductivity.status === "healthy"
                ? "success"
                : orgProductivity.status === "warning"
                  ? "warning"
                  : orgProductivity.status === "critical"
                    ? "destructive"
                    : "outline"}
            >
              {orgProductivity.status}
            </Badge>
          {:else if orgProductivity}
            <Badge variant="outline">{orgProductivity.status}</Badge>
          {/if}
        </div>

        <div class="space-y-3">
          {#if orgHasProductivityData && orgProductivity && "trueThroughput" in orgProductivity}
            <div>
              {#if orgProductivity.trueThroughputPerEngineer !== null}
                <div
                  class="text-2xl font-semibold {productivityStatusClasses?.text ||
                    ''}"
                >
                  {toWeeklyRate(
                    orgProductivity.trueThroughputPerEngineer
                  ).toFixed(2)}<span
                    class="text-sm font-normal text-neutral-400"
                    >/wk per eng</span
                  >
                </div>
                <div class="text-xs text-neutral-500">
                  TrueThroughput (target: 3/wk)
                </div>
              {:else}
                <div
                  class="text-2xl font-semibold {productivityStatusClasses?.text ||
                    ''}"
                >
                  {toWeeklyRate(orgProductivity.trueThroughput).toFixed(1)}<span
                    class="text-sm font-normal text-neutral-400">/wk</span
                  >
                </div>
                <div class="text-xs text-neutral-500">
                  TrueThroughput (total)
                </div>
              {/if}
            </div>

            <div class="space-y-0.5 text-xs">
              <div>
                <span class="font-semibold text-neutral-400"
                  >{toWeeklyRate(orgProductivity.trueThroughput).toFixed(
                    1
                  )}</span
                >
                <span class="text-neutral-500">total throughput/wk</span>
              </div>
              {#if orgProductivity.engineerCount !== null}
                <div>
                  <span class="font-semibold text-neutral-400"
                    >{orgProductivity.engineerCount}</span
                  >
                  <span class="text-neutral-500">engineers</span>
                </div>
              {/if}
            </div>
          {:else if orgProductivity && "notes" in orgProductivity}
            <div>
              <div class="text-2xl font-semibold text-neutral-500">—</div>
              <div class="text-xs text-neutral-500">TrueThroughput</div>
            </div>

            <div class="text-xs italic text-neutral-500">
              {orgProductivity.notes}
            </div>
          {:else}
            <div>
              <div class="text-2xl font-semibold text-neutral-500">—</div>
              <div class="text-xs text-neutral-500">TrueThroughput</div>
            </div>
          {/if}
        </div>
      </Card>

      <!-- Pillar 4: Quality -->
      <Card
        class="transition-colors duration-150 hover:bg-white/5 {qualityStatusClasses?.border ||
          ''} border"
      >
        <div class="flex justify-between items-start mb-3">
          <div
            class="text-xs font-medium tracking-wide uppercase text-neutral-400"
          >
            Quality
          </div>
          <Badge
            variant={orgSnapshot.quality.status === "healthy"
              ? "success"
              : orgSnapshot.quality.status === "warning"
                ? "warning"
                : "destructive"}
          >
            {orgSnapshot.quality.status}
          </Badge>
        </div>

        <div class="space-y-3">
          <div>
            <div
              class="text-2xl font-semibold {qualityStatusClasses?.text || ''}"
            >
              {orgSnapshot.quality.compositeScore}
            </div>
            <div class="text-xs text-neutral-500">Quality score (0-100)</div>
          </div>

          <div class="space-y-0.5 text-xs">
            <div>
              <span class="font-semibold text-neutral-400"
                >{orgSnapshot.quality.openBugCount}</span
              >
              <span class="text-neutral-500">open bugs</span>
            </div>
            <div>
              {#if orgSnapshot.quality.netBugChange > 0}
                <span class="text-neutral-500"
                  >Backlog growing (<span class="font-semibold text-neutral-400"
                    >+{orgSnapshot.quality.netBugChange}</span
                  > in 14d)</span
                >
              {:else if orgSnapshot.quality.netBugChange < 0}
                <span class="text-neutral-500"
                  >Backlog shrinking (<span
                    class="font-semibold text-neutral-400"
                    >{orgSnapshot.quality.netBugChange}</span
                  > in 14d)</span
                >
              {:else}
                <span class="text-neutral-500"
                  >Backlog stable (<span class="font-semibold text-neutral-400"
                    >0</span
                  > net in 14d)</span
                >
              {/if}
            </div>
            <div>
              <span class="text-neutral-500"
                >Avg age: {orgSnapshot.quality.averageBugAgeDays.toFixed(0)} days</span
              >
            </div>
          </div>
        </div>
      </Card>
    </div>

    <!-- Four Pillars Trend Chart -->
    <div class="mt-8">
      <h2 class="mb-4 text-lg font-medium text-white">Trends</h2>
      <Card>
        {#if trendLoading}
          <div class="flex justify-center items-center h-[280px]">
            <Skeleton class="w-full h-64" />
          </div>
        {:else if trendDataPoints.length > 0}
          <FourPillarsChart dataPoints={trendDataPoints} />
        {:else}
          <div
            class="flex justify-center items-center h-[280px] text-sm text-neutral-500"
          >
            No trend data available yet. Metrics are captured hourly after each
            sync.
          </div>
        {/if}
      </Card>
    </div>

    <!-- Domain Breakdown -->
    {#if domainSnapshots.length > 0}
      <div class="mt-8">
        <h2 class="mb-4 text-lg font-medium text-white">By Domain</h2>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-white/10">
                <th class="px-4 py-3 font-medium text-left text-neutral-400">
                  Domain
                </th>
                <th class="px-4 py-3 font-medium text-center text-neutral-400">
                  WIP Health
                </th>
                <th class="px-4 py-3 font-medium text-center text-neutral-400">
                  Project Health
                </th>
                <th class="px-4 py-3 font-medium text-center text-neutral-400">
                  Quality
                </th>
                <th class="px-4 py-3 font-medium text-center text-neutral-400">
                  Throughput/IC/week
                </th>
                <th class="px-4 py-3 font-medium text-right text-neutral-400">
                  ICs
                </th>
                <th class="px-4 py-3 font-medium text-right text-neutral-400">
                  Projects
                </th>
                <th class="px-4 py-3 font-medium text-right text-neutral-400">
                  Open Bugs
                </th>
              </tr>
            </thead>
            <tbody>
              {#each domainSnapshots as { levelId, snapshot } (levelId)}
                <tr
                  class="border-b transition-colors border-white/5 hover:bg-white/5"
                >
                  <td class="px-4 py-3 font-medium text-white">{levelId}</td>
                  <td class="px-4 py-3 text-center">
                    <Badge
                      variant={snapshot.teamHealth.status === "healthy"
                        ? "success"
                        : snapshot.teamHealth.status === "warning"
                          ? "warning"
                          : "destructive"}
                    >
                      {snapshot.teamHealth.status}
                    </Badge>
                  </td>
                  <td class="px-4 py-3 text-center">
                    <Badge
                      variant={snapshot.velocityHealth.status === "healthy"
                        ? "success"
                        : snapshot.velocityHealth.status === "warning"
                          ? "warning"
                          : "destructive"}
                    >
                      {snapshot.velocityHealth.onTrackPercent.toFixed(0)}% on
                      track
                    </Badge>
                  </td>
                  <td class="px-4 py-3 text-center">
                    <Badge
                      variant={snapshot.quality.status === "healthy"
                        ? "success"
                        : snapshot.quality.status === "warning"
                          ? "warning"
                          : "destructive"}
                    >
                      {snapshot.quality.compositeScore}
                    </Badge>
                  </td>
                  <td class="px-4 py-3 text-center">
                    {#if hasProductivityData(snapshot.teamProductivity)}
                      <Badge
                        variant={snapshot.teamProductivity.status === "healthy"
                          ? "success"
                          : snapshot.teamProductivity.status === "warning"
                            ? "warning"
                            : snapshot.teamProductivity.status === "critical"
                              ? "destructive"
                              : "outline"}
                      >
                        {toWeeklyRate(
                          snapshot.teamProductivity.trueThroughputPerEngineer ??
                            0
                        ).toFixed(1)}
                      </Badge>
                    {:else}
                      <span class="text-neutral-500">—</span>
                    {/if}
                  </td>
                  <td class="px-4 py-3 text-right text-neutral-400">
                    {snapshot.teamHealth.totalIcCount}
                  </td>
                  <td class="px-4 py-3 text-right text-neutral-400">
                    {snapshot.teamHealth.totalProjectCount}
                  </td>
                  <td class="px-4 py-3 text-right text-neutral-400">
                    {snapshot.quality.openBugCount}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    {/if}

    <!-- Team Breakdown -->
    {#if teamSnapshots.length > 0}
      <div class="mt-8">
        <h2 class="mb-4 text-lg font-medium text-white">By Team</h2>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-white/10">
                <th class="px-4 py-3 font-medium text-left text-neutral-400">
                  Team
                </th>
                <th class="px-4 py-3 font-medium text-center text-neutral-400">
                  WIP Health
                </th>
                <th class="px-4 py-3 font-medium text-center text-neutral-400">
                  Project Health
                </th>
                <th class="px-4 py-3 font-medium text-center text-neutral-400">
                  Quality
                </th>
                <th class="px-4 py-3 font-medium text-right text-neutral-400">
                  ICs
                </th>
                <th class="px-4 py-3 font-medium text-right text-neutral-400">
                  Projects
                </th>
                <th class="px-4 py-3 font-medium text-right text-neutral-400">
                  Open Bugs
                </th>
              </tr>
            </thead>
            <tbody>
              {#each teamSnapshots.sort( (a, b) => (a.levelId || "").localeCompare(b.levelId || "") ) as { levelId, snapshot } (levelId)}
                <tr
                  class="border-b transition-colors border-white/5 hover:bg-white/5"
                >
                  <td class="px-4 py-3 font-medium text-white"
                    >{getTeamDisplayName(levelId)}</td
                  >
                  <td class="px-4 py-3 text-center">
                    <Badge
                      variant={snapshot.teamHealth.status === "healthy"
                        ? "success"
                        : snapshot.teamHealth.status === "warning"
                          ? "warning"
                          : "destructive"}
                    >
                      {snapshot.teamHealth.status}
                    </Badge>
                  </td>
                  <td class="px-4 py-3 text-center">
                    <Badge
                      variant={snapshot.velocityHealth.status === "healthy"
                        ? "success"
                        : snapshot.velocityHealth.status === "warning"
                          ? "warning"
                          : "destructive"}
                    >
                      {snapshot.velocityHealth.onTrackPercent.toFixed(0)}%
                    </Badge>
                  </td>
                  <td class="px-4 py-3 text-center">
                    <Badge
                      variant={snapshot.quality.status === "healthy"
                        ? "success"
                        : snapshot.quality.status === "warning"
                          ? "warning"
                          : "destructive"}
                    >
                      {snapshot.quality.compositeScore}
                    </Badge>
                  </td>
                  <td class="px-4 py-3 text-right text-neutral-400">
                    {snapshot.teamHealth.totalIcCount}
                  </td>
                  <td class="px-4 py-3 text-right text-neutral-400">
                    {snapshot.teamHealth.totalProjectCount}
                  </td>
                  <td class="px-4 py-3 text-right text-neutral-400">
                    {snapshot.quality.openBugCount}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    {/if}

    <!-- Projects Needing Attention -->
    {#if orgSnapshot.velocityHealth.projectStatuses.filter((p) => p.effectiveHealth !== "onTrack").length > 0}
      <div class="mt-8">
        <h2 class="mb-4 text-lg font-medium text-white">
          Projects Needing Attention
        </h2>
        <Card>
          <div class="space-y-2">
            {#each orgSnapshot.velocityHealth.projectStatuses.filter((p) => p.effectiveHealth !== "onTrack") as project (project.projectId)}
              <button
                class="flex justify-between items-center px-3 py-2 w-full text-left rounded transition-colors cursor-pointer hover:bg-white/5"
                onclick={() => handleProjectClick(project.projectId)}
              >
                <div>
                  <div class="font-medium text-white">
                    {project.projectName}
                  </div>
                  <div class="text-xs text-neutral-500">
                    {#if project.daysOffTarget !== null}
                      {project.daysOffTarget > 0
                        ? `${project.daysOffTarget} days behind target`
                        : `${Math.abs(project.daysOffTarget)} days ahead`}
                      • {project.healthSource === "human"
                        ? "Self-reported"
                        : "Trajectory Alert"}
                    {:else}
                      No target date set
                    {/if}
                  </div>
                </div>
                <Badge
                  variant={project.effectiveHealth === "atRisk"
                    ? "warning"
                    : "destructive"}
                >
                  {project.effectiveHealth === "atRisk"
                    ? "At Risk"
                    : "Off Track"}
                </Badge>
              </button>
            {/each}
          </div>
        </Card>
      </div>
    {/if}
  {:else}
    <!-- No Data State -->
    <Card>
      <div class="py-8 text-center">
        <div class="mb-2 text-neutral-400">No metrics data available</div>
        <p class="text-sm text-neutral-500">
          Metrics snapshots are captured automatically after each sync. Run a
          sync or wait for the next scheduled sync.
        </p>
      </div>
    </Card>
  {/if}
</div>

<!-- Project Detail Modal -->
{#if selectedProject}
  <ProjectDetailModal project={selectedProject} onclose={closeModal} />
{/if}

<style>
  /* Blur poof animation for rotating principles */
  .principle-text {
    transition:
      opacity 400ms cubic-bezier(0.76, 0, 0.24, 1),
      filter 400ms cubic-bezier(0.76, 0, 0.24, 1),
      transform 400ms cubic-bezier(0.76, 0, 0.24, 1);
  }

  .principle-enter {
    opacity: 1;
    filter: blur(0px);
    transform: scale(1);
  }

  .principle-exit {
    opacity: 0;
    filter: blur(12px);
    transform: scale(1.08);
  }
</style>

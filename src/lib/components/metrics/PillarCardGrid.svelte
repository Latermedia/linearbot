<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import Card from "$lib/components/Card.svelte";
  import Skeleton from "$lib/components/Skeleton.svelte";
  import PillarCard from "./PillarCard.svelte";
  import EngineerListPopover, {
    type EngineerItem,
  } from "./EngineerListPopover.svelte";
  import type {
    MetricsSnapshotV1,
    TeamProductivityV1,
  } from "../../../types/metrics-snapshot";
  import type { TrendDataPoint } from "../../../routes/api/metrics/trends/+server";
  import {
    calculateMetricTrends,
    metricExtractors,
    type TrendResult,
  } from "$lib/utils/trend-calculation";

  // Engineer data from API
  interface EngineerData {
    assignee_id: string;
    assignee_name: string;
    avatar_url: string | null;
    wip_issue_count: number;
    wip_limit_violation: number;
    active_project_count: number;
    multi_project_violation: number;
  }

  interface Props {
    snapshot: MetricsSnapshotV1 | null;
    loading?: boolean;
    error?: string | null;
    /** Mark productivity as under construction (GetDX mapping pending) */
    productivityUnderConstruction?: boolean;
    /** Callback when a pillar card is clicked */
    onPillarClick?: (
      pillar: "wipHealth" | "projectHealth" | "productivity" | "quality"
    ) => void;
    /** Callback when an engineer is clicked (to open modal) */
    onEngineerClick?: (engineerId: string) => void;
    /** Trend data points for calculating week/month trends */
    trendDataPoints?: TrendDataPoint[];
    /** Engineer-to-team mapping for filtering IC metrics by team */
    engineerTeamMapping?: Record<string, string>;
    /** Currently selected team key for filtering */
    selectedTeamKey?: string | null;
  }

  let {
    snapshot,
    loading = false,
    error = null,
    productivityUnderConstruction = false,
    onPillarClick,
    onEngineerClick,
    trendDataPoints = [],
    engineerTeamMapping = {},
    selectedTeamKey = null,
  }: Props = $props();

  // Engineer data state
  let allEngineers = $state<EngineerData[]>([]);

  // Hover state for engineer popover with delay
  let pendingDetailId = $state<string | null>(null);
  let activeDetailId = $state<string | null>(null);
  let hoverPosition = $state({ x: 0, y: 0 });
  let showDelayTimer: ReturnType<typeof setTimeout> | null = null;
  let hideDelayTimer: ReturnType<typeof setTimeout> | null = null;
  let isMouseInPopover = $state(false);

  const SHOW_DELAY = 300; // ms before showing popover
  const HIDE_DELAY = 150; // ms before hiding popover (allows mouse to enter)

  // Fetch engineers on mount
  onMount(async () => {
    if (!browser) return;
    try {
      const response = await fetch("/api/engineers");
      const data = await response.json();
      allEngineers = data.engineers || [];
    } catch (e) {
      console.error("Failed to fetch engineers:", e);
    }
  });

  // Filter engineers by ENGINEER_TEAM_MAPPING when a team is selected
  const filteredEngineers = $derived.by((): EngineerData[] => {
    if (!selectedTeamKey) {
      // No team filter - return all engineers
      return allEngineers;
    }

    // Get engineers mapped to the selected team
    const mappedEngineerNames = new Set<string>();
    for (const [name, teamKey] of Object.entries(engineerTeamMapping)) {
      if (teamKey === selectedTeamKey) {
        mappedEngineerNames.add(name);
      }
    }

    // If no mapping configured, return all engineers
    if (Object.keys(engineerTeamMapping).length === 0) {
      return allEngineers;
    }

    // Filter to only mapped engineers for this team
    return allEngineers.filter((e) => mappedEngineerNames.has(e.assignee_name));
  });

  // Filter engineers based on active detail (using filtered engineers when team is selected)
  const hoveredEngineers = $derived.by((): EngineerItem[] => {
    if (!activeDetailId) return [];

    if (activeDetailId === "wip-overloaded") {
      return filteredEngineers
        .filter((e) => e.wip_limit_violation === 1)
        .map((e) => ({
          assignee_id: e.assignee_id,
          assignee_name: e.assignee_name,
          avatar_url: e.avatar_url,
        }));
    }

    if (activeDetailId === "multi-project") {
      return filteredEngineers
        .filter((e) => e.multi_project_violation === 1)
        .map((e) => ({
          assignee_id: e.assignee_id,
          assignee_name: e.assignee_name,
          avatar_url: e.avatar_url,
        }));
    }

    return [];
  });

  // Title for the popover based on detail type
  const popoverTitle = $derived.by(() => {
    if (activeDetailId === "wip-overloaded") return "Overloaded (6+ issues)";
    if (activeDetailId === "multi-project")
      return "Context-Switching (2+ projects)";
    return "";
  });

  // Handle detail hover with delay
  function handleWipDetailHover(
    detailId: string | null,
    event: MouseEvent | null
  ) {
    // Clear any existing timers
    if (showDelayTimer) {
      clearTimeout(showDelayTimer);
      showDelayTimer = null;
    }
    if (hideDelayTimer) {
      clearTimeout(hideDelayTimer);
      hideDelayTimer = null;
    }

    if (detailId && event) {
      // Mouse entered a detail - start show delay
      pendingDetailId = detailId;
      hoverPosition = { x: event.clientX, y: event.clientY };
      showDelayTimer = setTimeout(() => {
        activeDetailId = pendingDetailId;
      }, SHOW_DELAY);
    } else {
      // Mouse left detail - start hide delay (unless mouse is in popover)
      pendingDetailId = null;
      if (!isMouseInPopover) {
        hideDelayTimer = setTimeout(() => {
          activeDetailId = null;
        }, HIDE_DELAY);
      }
    }
  }

  // Handle mouse entering/leaving the popover
  function handlePopoverMouseEnter() {
    isMouseInPopover = true;
    // Cancel any pending hide
    if (hideDelayTimer) {
      clearTimeout(hideDelayTimer);
      hideDelayTimer = null;
    }
  }

  function handlePopoverMouseLeave() {
    isMouseInPopover = false;
    // Start hide delay
    hideDelayTimer = setTimeout(() => {
      activeDetailId = null;
    }, HIDE_DELAY);
  }

  // Handle engineer click
  function handleEngineerClick(engineerId: string) {
    activeDetailId = null; // Close popover
    isMouseInPopover = false;
    onEngineerClick?.(engineerId);
  }

  // Measurement period in weeks (data is aggregated over 14 days = 2 weeks)
  const MEASUREMENT_PERIOD_WEEKS = 2;

  // Convert 14-day throughput to weekly rate
  function toWeeklyRate(value: number): number {
    return value / MEASUREMENT_PERIOD_WEEKS;
  }

  // Check if productivity has TrueThroughput data
  function hasProductivityData(p: TeamProductivityV1): p is {
    trueThroughput: number;
    engineerCount: number | null;
    trueThroughputPerEngineer: number | null;
    status: "healthy" | "warning" | "critical" | "unknown";
  } {
    return "trueThroughput" in p;
  }

  // Derived values for each pillar
  const teamHealth = $derived(snapshot?.teamHealth);
  const velocityHealth = $derived(snapshot?.velocityHealth);
  const productivity = $derived(snapshot?.teamProductivity);
  const quality = $derived(snapshot?.quality);

  // Derived productivity values
  const hasProductivity = $derived(
    productivity ? hasProductivityData(productivity) : false
  );

  // Project Health counts
  const velocityCounts = $derived.by(() => {
    if (!velocityHealth?.projectStatuses) return null;
    const statuses = velocityHealth.projectStatuses;
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

  // Build details arrays for each pillar
  const wipHealthDetails = $derived.by(() => {
    if (!teamHealth) return [];
    const totalIcs = teamHealth.totalIcCount || 1; // Avoid division by zero
    const totalProjects = teamHealth.totalProjectCount || 1;

    const wipPct = ((teamHealth.wipViolationCount / totalIcs) * 100).toFixed(0);
    const multiPct = (
      (teamHealth.multiProjectViolationCount / totalIcs) *
      100
    ).toFixed(0);
    const projectPct = (
      (teamHealth.impactedProjectCount / totalProjects) *
      100
    ).toFixed(0);

    return [
      {
        id: "wip-overloaded",
        value: `${wipPct}%`,
        label: " ICs overloaded (6+ issues)",
      },
      {
        id: "multi-project",
        value: `${multiPct}%`,
        label: " ICs context-switching (2+ projects)",
      },
      {
        id: "projects-impacted",
        value: `${projectPct}%`,
        label: " projects impacted",
      },
    ];
  });

  // Project Health two-column details (Self-reported vs Trajectory Alert)
  const projectHealthTwoColumnDetails = $derived.by(() => {
    if (!velocityCounts) return undefined;

    const hasIssues =
      velocityCounts.atRiskHuman > 0 ||
      velocityCounts.offTrackHuman > 0 ||
      velocityCounts.atRiskVelocity > 0 ||
      velocityCounts.offTrackVelocity > 0;

    if (!hasIssues) {
      return undefined; // Will show noIssuesMessage
    }

    const leftItems: { value: string | number; label: string }[] = [];
    const rightItems: { value: string | number; label: string }[] = [];

    if (velocityCounts.atRiskHuman > 0) {
      leftItems.push({ value: velocityCounts.atRiskHuman, label: " at risk" });
    }
    if (velocityCounts.offTrackHuman > 0) {
      leftItems.push({
        value: velocityCounts.offTrackHuman,
        label: " off track",
      });
    }
    if (velocityCounts.atRiskVelocity > 0) {
      rightItems.push({
        value: velocityCounts.atRiskVelocity,
        label: " at risk",
      });
    }
    if (velocityCounts.offTrackVelocity > 0) {
      rightItems.push({
        value: velocityCounts.offTrackVelocity,
        label: " off track",
      });
    }

    return {
      left:
        leftItems.length > 0
          ? { header: "Self-reported", items: leftItems }
          : undefined,
      right:
        rightItems.length > 0
          ? { header: "Trajectory Alert", items: rightItems }
          : undefined,
    };
  });

  const productivityDetails = $derived.by(() => {
    if (!productivity || !hasProductivity) return [];
    if (!("trueThroughput" in productivity)) return [];

    const details: { value: string | number; label: string }[] = [
      {
        value: toWeeklyRate(productivity.trueThroughput).toFixed(1),
        label: " total throughput/wk",
      },
    ];

    if (productivity.engineerCount !== null) {
      details.push({
        value: productivity.engineerCount,
        label: " engineers",
      });
    }

    return details;
  });

  const qualityDetails = $derived.by(() => {
    if (!quality) return [];

    const bugChangeLabel =
      quality.netBugChange > 0
        ? ` Backlog growing (+${quality.netBugChange} in 14d)`
        : quality.netBugChange < 0
          ? ` Backlog shrinking (${quality.netBugChange} in 14d)`
          : " Backlog stable (0 net in 14d)";

    return [
      { value: quality.openBugCount, label: " open bugs" },
      { value: "", label: bugChangeLabel },
      {
        value: "",
        label: `Avg age: ${quality.averageBugAgeDays.toFixed(0)} days`,
      },
    ];
  });

  // Productivity goal target (3 throughput per engineer per week)
  const PRODUCTIVITY_GOAL = 3;

  // Productivity value display as % of goal
  const productivityValue = $derived.by(() => {
    if (!productivity || !hasProductivity) return "—";
    if (!("trueThroughput" in productivity)) return "—";

    if (productivity.trueThroughputPerEngineer !== null) {
      const weeklyRate = toWeeklyRate(productivity.trueThroughputPerEngineer);
      const percentOfGoal = (weeklyRate / PRODUCTIVITY_GOAL) * 100;
      return `${Math.round(percentOfGoal)}%`;
    }
    return "—";
  });

  const productivitySubtitle = $derived.by(() => {
    if (!productivity || !hasProductivity) return undefined;
    if (!("trueThroughput" in productivity)) return undefined;

    if (productivity.trueThroughputPerEngineer !== null) {
      const weeklyRate = toWeeklyRate(productivity.trueThroughputPerEngineer);
      return `${weeklyRate.toFixed(2)}/wk per eng (goal: ${PRODUCTIVITY_GOAL})`;
    }
    return "TrueThroughput";
  });

  // Trend calculations for each pillar
  const wipHealthTrends = $derived.by(
    (): { week: TrendResult; month: TrendResult } | null => {
      if (trendDataPoints.length === 0 || !teamHealth) return null;
      return calculateMetricTrends(
        trendDataPoints,
        metricExtractors.wipHealth,
        teamHealth.healthyWorkloadPercent
      );
    }
  );

  const projectHealthTrends = $derived.by(
    (): { week: TrendResult; month: TrendResult } | null => {
      if (trendDataPoints.length === 0 || !velocityHealth) return null;
      return calculateMetricTrends(
        trendDataPoints,
        metricExtractors.projectHealth,
        velocityHealth.onTrackPercent
      );
    }
  );

  const productivityTrends = $derived.by(
    (): { week: TrendResult; month: TrendResult } | null => {
      if (trendDataPoints.length === 0 || !productivity || !hasProductivity)
        return null;
      if (!("trueThroughputPerEngineer" in productivity)) return null;
      return calculateMetricTrends(
        trendDataPoints,
        metricExtractors.productivity,
        productivity.trueThroughputPerEngineer ?? undefined
      );
    }
  );

  const qualityTrends = $derived.by(
    (): { week: TrendResult; month: TrendResult } | null => {
      if (trendDataPoints.length === 0 || !quality) return null;
      return calculateMetricTrends(
        trendDataPoints,
        metricExtractors.quality,
        quality.compositeScore
      );
    }
  );
</script>

{#if loading}
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
{:else if snapshot}
  <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
    <!-- Pillar 1: WIP Health -->
    <PillarCard
      title="WIP Health"
      value="{teamHealth?.healthyWorkloadPercent.toFixed(0) || 0}%"
      subtitle="Engineers within WIP constraints"
      subtitleInfo={{
        formula:
          "\\text{WIP Health} = \\frac{\\displaystyle\\sum_{i=1}^{N} \\mathbf{1}\\bigl[\\text{issues}_i \\leq 5 \\;\\land\\; \\text{projects}_i = 1\\bigr]}{N} \\times 100",
        content: [
          'An engineer is "within constraints" when they have 5 or fewer in-progress issues AND are focused on a single project.',
          "WIP constraints reduce cycle time by limiting queue depth. Overloaded engineers create bottlenecks; context-switching across projects compounds delays through task-switching overhead.",
        ],
      }}
      details={wipHealthDetails}
      onClick={() => onPillarClick?.("wipHealth")}
      onDetailHover={handleWipDetailHover}
      weekTrend={wipHealthTrends?.week}
      monthTrend={wipHealthTrends?.month}
      higherIsBetter={true}
    />

    <!-- Pillar 2: Project Health -->
    <PillarCard
      title="Project Health"
      value="{velocityHealth?.onTrackPercent.toFixed(0) || 0}%"
      subtitle="{velocityCounts?.onTrack ?? 0} of {velocityCounts?.total ??
        0} projects on track"
      subtitleInfo={{
        formula:
          "\\text{Project Health} = \\frac{\\text{On Track Projects}}{\\text{Total Projects}} \\times 100",
        content: [
          'A project is "on track" when both human judgment (Linear health status) AND velocity math agree it will finish on time.',
          "Self-reported: Team explicitly marked project as at risk or off track in Linear.",
          "Trajectory alert: Velocity prediction shows 2-4 weeks late (at risk) or 4+ weeks late (off track), even if team says on track.",
          "Predictability builds trust. Combining human intuition with velocity math catches blind spots early—when there's still time to course correct.",
        ],
      }}
      twoColumnDetails={projectHealthTwoColumnDetails}
      noIssuesMessage="All projects on track"
      onClick={() => onPillarClick?.("projectHealth")}
      weekTrend={projectHealthTrends?.week}
      monthTrend={projectHealthTrends?.month}
      higherIsBetter={true}
    />

    <!-- Pillar 3: Team Productivity -->
    <PillarCard
      title="Productivity"
      value={productivityValue}
      subtitle={productivitySubtitle}
      subtitleInfo={{
        formula:
          "\\text{Productivity} = \\frac{\\text{Throughput per Engineer per Week}}{\\text{Goal}} \\times 100",
        content: [
          "Throughput is measured over a 14-day rolling window, then converted to weekly rate per engineer.",
          "The goal is 3 PRs/week as weighted by GetDX's TrueThroughput.",
          "Sustainable pace beats heroics. Consistent throughput enables reliable planning and surfaces systemic blockers before they become crises.",
        ],
      }}
      details={productivityDetails}
      underConstruction={productivityUnderConstruction}
      onClick={() => onPillarClick?.("productivity")}
      weekTrend={productivityTrends?.week}
      monthTrend={productivityTrends?.month}
      higherIsBetter={true}
    />

    <!-- Pillar 4: Quality -->
    <PillarCard
      title="Quality"
      value={quality?.compositeScore ?? "—"}
      valueUnit="%"
      subtitle="Quality score"
      subtitleInfo={{
        formula:
          "\\text{Quality} = 0.3 \\cdot S_{\\text{bugs}} + 0.4 \\cdot S_{\\text{net}} + 0.3 \\cdot S_{\\text{age}}",
        content: [
          "Bug score: 100 − (open bugs ÷ engineers) × 12. Hits zero at ~8 bugs per engineer.",
          "Net score: 100 − (net bug change ÷ engineers) × 200. Penalizes growing backlog; rewards shrinking it.",
          "Age score: 100 − avg bug age × 0.5. Hits zero at 200 days average age.",
          "Bug debt compounds. A growing backlog drains velocity from feature work; old bugs signal triage failures. Fix fast or pay forever.",
        ],
      }}
      details={qualityDetails}
      onClick={() => onPillarClick?.("quality")}
      weekTrend={qualityTrends?.week}
      monthTrend={qualityTrends?.month}
      higherIsBetter={true}
    />
  </div>
{:else}
  <Card>
    <div class="py-8 text-center">
      <div class="mb-2 text-neutral-400">No metrics data available</div>
      <p class="text-sm text-neutral-500">
        Metrics snapshots are captured automatically after each sync. Run a sync
        or wait for the next scheduled sync.
      </p>
    </div>
  </Card>
{/if}

<!-- Engineer list popover on hover -->
{#if activeDetailId && hoveredEngineers.length > 0}
  <EngineerListPopover
    engineers={hoveredEngineers}
    title={popoverTitle}
    position={hoverPosition}
    onEngineerClick={handleEngineerClick}
    onMouseEnter={handlePopoverMouseEnter}
    onMouseLeave={handlePopoverMouseLeave}
  />
{/if}

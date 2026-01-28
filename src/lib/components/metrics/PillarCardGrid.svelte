<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import Card from "$lib/components/Card.svelte";
  import PillarCard from "./PillarCard.svelte";
  import EngineerListPopover, {
    type EngineerItem,
  } from "./EngineerListPopover.svelte";
  import type {
    MetricsSnapshotV1,
    TeamProductivityV1,
  } from "../../../types/metrics-snapshot";
  import type {
    TrendDataPoint,
    TrendsResponse,
  } from "../../../routes/api/metrics/trends/+server";
  import {
    calculateMetricTrends,
    metricExtractors,
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
      pillar:
        | "wipHealth"
        | "projectHealth"
        | "productivity"
        | "quality"
        | "linearHygiene"
    ) => void;
    /** Callback when an engineer is clicked (to open modal) */
    onEngineerClick?: (engineerId: string) => void;
    /** Engineer-to-team mapping for filtering IC metrics by team */
    engineerTeamMapping?: Record<string, string>;
    /** Currently selected team key for filtering */
    selectedTeamKey?: string | null;
    /** Display variant for pillar cards: default or hero (larger centered) */
    variant?: "default" | "hero";
  }

  let {
    snapshot,
    loading = false,
    error = null,
    productivityUnderConstruction = false,
    onPillarClick,
    onEngineerClick,
    engineerTeamMapping = {},
    selectedTeamKey = null,
    variant = "default",
  }: Props = $props();

  // Engineer data state
  let allEngineers = $state<EngineerData[]>([]);

  // Trend data state
  let trendDataPoints = $state<TrendDataPoint[]>([]);

  // Hover state for engineer popover with delay
  let pendingDetailId = $state<string | null>(null);
  let activeDetailId = $state<string | null>(null);
  let hoverPosition = $state({ x: 0, y: 0 });
  let showDelayTimer: ReturnType<typeof setTimeout> | null = null;
  let hideDelayTimer: ReturnType<typeof setTimeout> | null = null;
  let isMouseInPopover = $state(false);

  const SHOW_DELAY = 300; // ms before showing popover
  const HIDE_DELAY = 150; // ms before hiding popover (allows mouse to enter)

  // Fetch engineers and trend data on mount
  onMount(async () => {
    if (!browser) return;
    try {
      // Fetch engineers and trends in parallel
      const [engineersRes, trendsRes] = await Promise.all([
        fetch("/api/engineers"),
        fetch("/api/metrics/trends?level=org&limit=10000"),
      ]);

      const engineersData = await engineersRes.json();
      allEngineers = engineersData.engineers || [];

      const trendsData = (await trendsRes.json()) as TrendsResponse;
      if (trendsData.success && trendsData.dataPoints) {
        // Sort chronologically (oldest first)
        trendDataPoints = trendsData.dataPoints.sort(
          (a, b) =>
            new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime()
        );
      }
    } catch (e) {
      console.error("Failed to fetch data:", e);
    }
  });

  // Calculate WoW and MoM trends for each pillar
  const wipHealthTrends = $derived(
    calculateMetricTrends(trendDataPoints, metricExtractors.wipHealth)
  );
  const projectHealthTrends = $derived(
    calculateMetricTrends(trendDataPoints, metricExtractors.projectHealth)
  );
  const productivityTrends = $derived(
    calculateMetricTrends(trendDataPoints, metricExtractors.productivity)
  );
  const qualityTrends = $derived(
    calculateMetricTrends(trendDataPoints, metricExtractors.quality)
  );
  const linearHygieneTrends = $derived(
    calculateMetricTrends(trendDataPoints, metricExtractors.linearHygiene)
  );

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

  // Handle detail hover with delay (kept for future use with other pillar modals)
  function _handleWipDetailHover(
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
    status:
      | "peakFlow"
      | "strongRhythm"
      | "steadyProgress"
      | "earlyTraction"
      | "lowTraction"
      | "unknown";
  } {
    return "trueThroughput" in p;
  }

  // Derived values for each pillar
  const teamHealth = $derived(snapshot?.teamHealth);
  const velocityHealth = $derived(snapshot?.velocityHealth);
  const productivity = $derived(snapshot?.teamProductivity);
  const quality = $derived(snapshot?.quality);
  const linearHygiene = $derived(snapshot?.linearHygiene);

  // Derived productivity values
  const hasProductivity = $derived(
    productivity ? hasProductivityData(productivity) : false
  );

  // Productivity goal target (3 throughput per engineer per week)
  const PRODUCTIVITY_GOAL = 3;

  // Productivity value display as % of goal (number only, unit added separately)
  const productivityValueNumber = $derived.by(() => {
    if (!productivity || !hasProductivity) return "—";
    if (!("trueThroughput" in productivity)) return "—";

    if (productivity.trueThroughputPerEngineer !== null) {
      const weeklyRate = toWeeklyRate(productivity.trueThroughputPerEngineer);
      const percentOfGoal = (weeklyRate / PRODUCTIVITY_GOAL) * 100;
      return Math.round(percentOfGoal);
    }
    return "—";
  });

  const productivitySubtitle = $derived.by(() => {
    if (!productivity || !hasProductivity) return undefined;
    if (!("trueThroughput" in productivity)) return undefined;

    if (productivity.trueThroughputPerEngineer !== null) {
      return `Goal: ${PRODUCTIVITY_GOAL} TruePR/week/eng`;
    }
    return "TrueThroughput";
  });
</script>

{#if loading}
  <div class="py-16"></div>
{:else if error}
  <Card class="border-danger-500/30">
    <div class="mb-2 text-sm font-medium text-danger-400">
      Failed to load metrics
    </div>
    <p class="text-sm text-black-400">{error}</p>
    <p class="mt-2 text-xs text-black-500">
      Metrics are captured hourly after each sync. If you haven't synced yet,
      run a sync first or trigger a manual capture.
    </p>
  </Card>
{:else if snapshot}
  <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
    <!-- Pillar 1: Linear Hygiene -->
    <PillarCard
      title="Linear Hygiene"
      value={linearHygiene?.hygieneScore ?? "—"}
      valueUnit="%"
      subtitle="of tracking best practices met"
      status={linearHygiene?.status}
      onClick={() => onPillarClick?.("linearHygiene")}
      weekTrend={linearHygieneTrends.week}
      monthTrend={linearHygieneTrends.month}
      higherIsBetter={true}
      {variant}
    />

    <!-- Pillar 2: WIP Health -->
    <PillarCard
      title="WIP Health"
      value={teamHealth?.healthyWorkloadPercent.toFixed(0) || 0}
      valueUnit="%"
      subtitle="Engineers within WIP constraints"
      status={teamHealth?.status}
      onClick={() => onPillarClick?.("wipHealth")}
      weekTrend={wipHealthTrends.week}
      monthTrend={wipHealthTrends.month}
      higherIsBetter={true}
      {variant}
    />

    <!-- Pillar 3: Project Health -->
    <PillarCard
      title="Project Health"
      value={velocityHealth?.onTrackPercent.toFixed(0) || 0}
      valueUnit="%"
      subtitle="Projects on track"
      status={velocityHealth?.status}
      onClick={() => onPillarClick?.("projectHealth")}
      weekTrend={projectHealthTrends.week}
      monthTrend={projectHealthTrends.month}
      higherIsBetter={true}
      {variant}
    />

    <!-- Pillar 4: Team Productivity -->
    <PillarCard
      title="Productivity"
      value={productivityValueNumber}
      valueUnit={productivityValueNumber !== "—" ? "%" : undefined}
      subtitle={productivitySubtitle}
      status={productivity?.status}
      underConstruction={productivityUnderConstruction}
      onClick={() => onPillarClick?.("productivity")}
      weekTrend={productivityTrends.week}
      monthTrend={productivityTrends.month}
      higherIsBetter={true}
      {variant}
    />

    <!-- Pillar 5: Quality -->
    <PillarCard
      title="Quality"
      value={quality?.compositeScore ?? "—"}
      valueUnit="%"
      subtitle="Quality score"
      status={quality?.status}
      onClick={() => onPillarClick?.("quality")}
      weekTrend={qualityTrends.week}
      monthTrend={qualityTrends.month}
      higherIsBetter={true}
      {variant}
    />
  </div>
{:else}
  <Card>
    <div class="py-8 text-center">
      <div class="mb-2 text-black-400">No metrics data available</div>
      <p class="text-sm text-black-500">
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

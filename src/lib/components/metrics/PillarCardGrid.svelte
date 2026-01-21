<script lang="ts">
  import Card from "$lib/components/Card.svelte";
  import Skeleton from "$lib/components/Skeleton.svelte";
  import PillarCard from "./PillarCard.svelte";
  import type {
    MetricsSnapshotV1,
    TeamProductivityV1,
  } from "../../../types/metrics-snapshot";

  import type { TrendDataPoint } from "../../../routes/api/metrics/trends/+server";

  interface Props {
    snapshot: MetricsSnapshotV1 | null;
    loading?: boolean;
    error?: string | null;
    /** Mark productivity as under construction (GetDX mapping pending) */
    productivityUnderConstruction?: boolean;
    /** Historical trend point for hover state (provides counts when projectStatuses empty) */
    hoveredTrendPoint?: TrendDataPoint | null;
    /** Callback when a pillar card is clicked */
    onPillarClick?: (
      pillar: "wipHealth" | "projectHealth" | "productivity" | "quality"
    ) => void;
  }

  let {
    snapshot,
    loading = false,
    error = null,
    productivityUnderConstruction = false,
    hoveredTrendPoint = null,
    onPillarClick,
  }: Props = $props();

  // Whether we're viewing historical data
  const isViewingHistory = $derived(hoveredTrendPoint !== null);

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
    // If viewing history, use pre-computed counts from TrendDataPoint
    // (historical data doesn't have human/velocity breakdown)
    if (isViewingHistory && hoveredTrendPoint) {
      const vh = hoveredTrendPoint.velocityHealth;
      return {
        atRiskHuman: 0, // Not available in historical data
        atRiskVelocity: vh.atRiskCount,
        offTrackHuman: 0, // Not available in historical data
        offTrackVelocity: vh.offTrackCount,
        total: vh.totalProjectCount,
        onTrack: vh.onTrackCount,
      };
    }

    // Current view uses full projectStatuses breakdown
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
    return [
      {
        value: teamHealth.wipViolationCount,
        label: " ICs overloaded (6+ issues)",
      },
      {
        value: teamHealth.multiProjectViolationCount,
        label: " ICs context-switching (2+ projects)",
      },
      {
        value: `${teamHealth.impactedProjectCount} of ${teamHealth.totalProjectCount}`,
        label: " projects impacted",
      },
    ];
  });

  // Project Health two-column details (Self-reported vs Trajectory Alert)
  const projectHealthTwoColumnDetails = $derived.by(() => {
    if (!velocityCounts) return undefined;

    // For historical data, we only have total counts (no human/velocity breakdown)
    // Show as single column under "Trajectory Alert" header
    if (isViewingHistory) {
      const totalAtRisk = velocityCounts.atRiskVelocity;
      const totalOffTrack = velocityCounts.offTrackVelocity;

      if (totalAtRisk === 0 && totalOffTrack === 0) {
        return undefined; // Will show noIssuesMessage
      }

      const items: { value: string | number; label: string }[] = [];
      if (totalAtRisk > 0) {
        items.push({ value: totalAtRisk, label: " at risk" });
      }
      if (totalOffTrack > 0) {
        items.push({ value: totalOffTrack, label: " off track" });
      }

      return {
        right: {
          header: "Historical",
          items,
        },
      };
    }

    // Current view: show breakdown by source
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

  // Productivity value display
  const productivityValue = $derived.by(() => {
    if (!productivity || !hasProductivity) return "—";
    if (!("trueThroughput" in productivity)) return "—";

    if (productivity.trueThroughputPerEngineer !== null) {
      return toWeeklyRate(productivity.trueThroughputPerEngineer).toFixed(2);
    }
    return toWeeklyRate(productivity.trueThroughput).toFixed(1);
  });

  const productivityValueUnit = $derived.by(() => {
    if (!productivity || !hasProductivity) return undefined;
    if (!("trueThroughput" in productivity)) return undefined;

    if (productivity.trueThroughputPerEngineer !== null) {
      return "/wk per eng";
    }
    return "/wk";
  });

  const productivitySubtitle = $derived.by(() => {
    if (!productivity || !hasProductivity) return undefined;
    if (!("trueThroughput" in productivity)) return undefined;

    if (productivity.trueThroughputPerEngineer !== null) {
      return "TrueThroughput (target: 3/wk)";
    }
    return "TrueThroughput (total)";
  });
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
      status={teamHealth?.status || "pending"}
      value="{teamHealth?.healthyWorkloadPercent.toFixed(0) || 0}%"
      subtitle="Healthy Workloads"
      details={wipHealthDetails}
      onClick={() => onPillarClick?.("wipHealth")}
    />

    <!-- Pillar 2: Project Health -->
    <PillarCard
      title="Project Health"
      status={velocityHealth?.status || "pending"}
      value="{velocityHealth?.onTrackPercent.toFixed(0) || 0}%"
      subtitle="{velocityCounts?.onTrack ?? 0} of {velocityCounts?.total ??
        0} projects on track"
      twoColumnDetails={projectHealthTwoColumnDetails}
      noIssuesMessage="All projects on track"
      onClick={() => onPillarClick?.("projectHealth")}
    />

    <!-- Pillar 3: Team Productivity -->
    <PillarCard
      title="Productivity"
      status={productivity?.status || "pending"}
      value={productivityValue}
      valueUnit={productivityValueUnit}
      subtitle={productivitySubtitle}
      details={productivityDetails}
      underConstruction={productivityUnderConstruction}
      onClick={() => onPillarClick?.("productivity")}
    />

    <!-- Pillar 4: Quality -->
    <PillarCard
      title="Quality"
      status={quality?.status || "pending"}
      value={quality?.compositeScore ?? "—"}
      subtitle="Quality score (0-100)"
      details={qualityDetails}
      onClick={() => onPillarClick?.("quality")}
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

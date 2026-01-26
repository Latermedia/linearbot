<script lang="ts">
  import MiniPillarBadge from "./MiniPillarBadge.svelte";
  import type {
    MetricsSnapshotV1,
    TeamProductivityV1,
  } from "../../../types/metrics-snapshot";

  interface Props {
    snapshot: MetricsSnapshotV1 | null;
    /** Mark productivity as under construction (GetDX mapping pending) */
    productivityUnderConstruction?: boolean;
    /** Show loading skeleton state */
    loading?: boolean;
  }

  let {
    snapshot,
    productivityUnderConstruction = false,
    loading = false,
  }: Props = $props();

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

  // Derived values
  const teamHealth = $derived(snapshot?.teamHealth);
  const velocityHealth = $derived(snapshot?.velocityHealth);
  const productivity = $derived(snapshot?.teamProductivity);
  const quality = $derived(snapshot?.quality);

  // Productivity value display
  const productivityValue = $derived.by(() => {
    if (!productivity || !hasProductivityData(productivity)) return "—";

    if (productivity.trueThroughputPerEngineer !== null) {
      return `${toWeeklyRate(productivity.trueThroughputPerEngineer).toFixed(1)}/wk`;
    }
    return `${toWeeklyRate(productivity.trueThroughput).toFixed(1)}/wk`;
  });
</script>

<div class="flex flex-wrap gap-2 items-center">
  {#if loading}
    <!-- Loading skeleton -->
    {#each [1, 2, 3, 4] as i (i)}
      <div
        class="flex items-center gap-1.5 px-2 py-1 rounded bg-white/5 animate-pulse"
      >
        <div class="w-12 h-3 rounded bg-neutral-700"></div>
      </div>
    {/each}
  {:else if snapshot}
    <!-- WIP Health -->
    <MiniPillarBadge
      title="WIP"
      status={teamHealth?.status || "pending"}
      value="{teamHealth?.healthyWorkloadPercent.toFixed(0) || 0}%"
    />

    <!-- Project Health -->
    <MiniPillarBadge
      title="Projects"
      status={velocityHealth?.status || "pending"}
      value="{velocityHealth?.onTrackPercent.toFixed(0) || 0}%"
    />

    <!-- Productivity -->
    <MiniPillarBadge
      title="Productivity"
      status={productivity?.status || "pending"}
      value={productivityValue}
      underConstruction={productivityUnderConstruction}
    />

    <!-- Quality -->
    <MiniPillarBadge
      title="Quality"
      status={quality?.status || "pending"}
      value={quality?.compositeScore ?? "—"}
    />
  {:else}
    <span class="text-xs text-neutral-500 italic">No metrics available</span>
  {/if}
</div>

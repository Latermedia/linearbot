<script lang="ts">
  import { browser } from "$app/environment";
  import { onMount } from "svelte";
  import { teamFilterStore } from "$lib/stores/team-filter";
  import HealthPillarCard from "./HealthPillarCard.svelte";
  import type { MetricsSnapshotV1 } from "../../../types/metrics-snapshot";
  import type { LatestMetricsResponse } from "../../../routes/api/metrics/latest/+server";

  // Props for opening detail modal
  interface Props {
    onPillarClick?: (
      pillar: "teamHealth" | "projectHealth" | "productivity" | "quality"
    ) => void;
  }

  let { onPillarClick }: Props = $props();

  // State
  let loading = $state(true);
  let error = $state<string | null>(null);
  let snapshot = $state<MetricsSnapshotV1 | null>(null);

  const filter = $derived($teamFilterStore);
  const selectedTeamKey = $derived(filter.teamKey);

  // Fetch metrics based on team filter
  async function fetchMetrics() {
    if (!browser) return;

    loading = true;
    error = null;

    try {
      let url = "/api/metrics/latest";
      if (selectedTeamKey) {
        url += `?level=team&levelId=${encodeURIComponent(selectedTeamKey)}`;
      } else {
        url += "?level=org";
      }

      const response = await fetch(url);
      const data = (await response.json()) as LatestMetricsResponse;

      if (!data.success) {
        error = data.error || "Failed to fetch metrics";
        snapshot = null;
        return;
      }

      snapshot = data.snapshot || null;
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to fetch metrics";
      snapshot = null;
    } finally {
      loading = false;
    }
  }

  // Refetch when team filter changes
  $effect(() => {
    const _ = selectedTeamKey; // Track dependency
    fetchMetrics();
  });

  onMount(() => {
    fetchMetrics();
  });

  // Derived values
  const teamHealth = $derived(snapshot?.teamHealth);
  const projectHealth = $derived(snapshot?.velocityHealth);
  const productivity = $derived(snapshot?.teamProductivity);
  const quality = $derived(snapshot?.quality);

  // Check if productivity data is available (not pending)
  const hasProductivityData = $derived(
    productivity && "trueThroughput" in productivity
  );

  // Format percentage
  function formatPercent(value: number): string {
    return `${Math.round(value)}%`;
  }

  function handlePillarClick(
    pillar: "teamHealth" | "projectHealth" | "productivity" | "quality"
  ) {
    onPillarClick?.(pillar);
  }
</script>

<div class="flex flex-wrap gap-3">
  {#if loading}
    <!-- Loading skeleton -->
    {#each Array(4) as _}
      <div
        class="flex flex-col p-4 rounded-md border min-w-[140px] animate-pulse
        bg-neutral-100 dark:bg-white/5 border-neutral-200 dark:border-white/10"
      >
        <div
          class="h-3 w-16 bg-neutral-200 dark:bg-white/10 rounded mb-3"
        ></div>
        <div class="h-7 w-12 bg-neutral-200 dark:bg-white/10 rounded"></div>
      </div>
    {/each}
  {:else if error}
    <div
      class="flex items-center gap-2 px-4 py-3 text-sm text-red-600 dark:text-red-400
      bg-red-500/10 border border-red-500/20 rounded-md"
    >
      <span>Failed to load health metrics</span>
    </div>
  {:else}
    <!-- Team Health -->
    <HealthPillarCard
      title="Team Health"
      value={teamHealth
        ? formatPercent(teamHealth.healthyWorkloadPercent)
        : "—"}
      subtitle="healthy workload"
      status={teamHealth?.status || "pending"}
      onClick={() => handlePillarClick("teamHealth")}
    />

    <!-- Project Health -->
    <HealthPillarCard
      title="Project Health"
      value={projectHealth ? formatPercent(projectHealth.onTrackPercent) : "—"}
      subtitle="on track"
      status={projectHealth?.status || "pending"}
      onClick={() => handlePillarClick("projectHealth")}
    />

    <!-- Productivity (GetDX) -->
    <HealthPillarCard
      title="Productivity"
      value={hasProductivityData &&
      productivity &&
      "trueThroughputPerEngineer" in productivity
        ? productivity.trueThroughputPerEngineer?.toFixed(1) || "—"
        : "—"}
      subtitle={hasProductivityData ? "throughput/IC" : undefined}
      status={productivity?.status || "pending"}
      onClick={() => handlePillarClick("productivity")}
      notAvailable={selectedTeamKey !== null && !hasProductivityData}
    />

    <!-- Quality -->
    <HealthPillarCard
      title="Quality"
      value={quality ? quality.compositeScore : "—"}
      subtitle="score"
      status={quality?.status || "pending"}
      onClick={() => handlePillarClick("quality")}
    />
  {/if}
</div>

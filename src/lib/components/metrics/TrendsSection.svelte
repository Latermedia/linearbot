<script lang="ts">
  import Card from "$lib/components/Card.svelte";
  import Skeleton from "$lib/components/Skeleton.svelte";
  import FourPillarsChart from "$lib/components/FourPillarsChart.svelte";
  import DomainTrendsChart from "$lib/components/DomainTrendsChart.svelte";
  import ProjectStatusStackChart from "$lib/components/ProjectStatusStackChart.svelte";
  import type { TrendDataPoint } from "../../../routes/api/metrics/trends/+server";

  interface Domain {
    name: string;
    teams: { teamKey: string; teamName: string | null }[];
  }

  interface Props {
    dataPoints: TrendDataPoint[];
    loading?: boolean;
    title?: string;
    /** Chart height in pixels */
    height?: number;
    /** Remove top margin (for use with external spacing/transitions) */
    noMargin?: boolean;
    /** Domains for the domain trends chart */
    domains?: Domain[];
  }

  let {
    dataPoints,
    loading = false,
    title = "Trends",
    height = 180,
    noMargin = false,
    domains = [],
  }: Props = $props();
</script>

<div class={noMargin ? "" : "mt-8"}>
  {#if title}
    <h2 class="mb-4 text-lg font-medium text-black-900 dark:text-white">
      {title}
    </h2>
  {/if}

  {#if loading}
    <Card>
      <div class="flex justify-center items-center h-[220px]">
        <Skeleton class="w-full h-40" />
      </div>
    </Card>
  {:else if dataPoints.length > 0}
    <!-- 3-column grid layout for charts -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <!-- Org Trends (Four Pillars) -->
      <Card>
        <FourPillarsChart
          {dataPoints}
          {height}
          compact
          title="Organization Trends"
        />
      </Card>

      <!-- Domain Trends (with selector) -->
      <Card>
        <DomainTrendsChart {domains} {height} />
      </Card>

      <!-- Project Status Stack -->
      <Card>
        <ProjectStatusStackChart {dataPoints} {height} />
      </Card>
    </div>
  {:else}
    <Card>
      <div
        class="flex justify-center items-center h-[220px] text-sm text-black-500"
      >
        No trend data available yet. Metrics are captured hourly after each
        sync.
      </div>
    </Card>
  {/if}
</div>

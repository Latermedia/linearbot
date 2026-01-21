<script lang="ts">
  import Card from "$lib/components/Card.svelte";
  import Skeleton from "$lib/components/Skeleton.svelte";
  import FourPillarsChart from "$lib/components/FourPillarsChart.svelte";
  import type { TrendDataPoint } from "../../../routes/api/metrics/trends/+server";

  interface Props {
    dataPoints: TrendDataPoint[];
    loading?: boolean;
    title?: string;
    /** Callback when hovering over a data point (null when mouse leaves) */
    onhover?: (dataPoint: TrendDataPoint | null) => void;
    /** Chart height in pixels */
    height?: number;
  }

  let {
    dataPoints,
    loading = false,
    title = "Trends",
    onhover,
    height = 180,
  }: Props = $props();
</script>

<div class="mt-8">
  {#if title}
    <h2 class="mb-4 text-lg font-medium text-white">{title}</h2>
  {/if}
  <Card>
    {#if loading}
      <div class="flex justify-center items-center h-[220px]">
        <Skeleton class="w-full h-40" />
      </div>
    {:else if dataPoints.length > 0}
      <FourPillarsChart {dataPoints} {onhover} {height} />
    {:else}
      <div
        class="flex justify-center items-center h-[220px] text-sm text-neutral-500"
      >
        No trend data available yet. Metrics are captured hourly after each
        sync.
      </div>
    {/if}
  </Card>
</div>

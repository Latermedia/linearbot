<script lang="ts">
  import { onMount } from "svelte";
  import type { TrendDataPoint } from "../../routes/api/metrics/trends/+server";

  interface Props {
    dataPoints: TrendDataPoint[];
    height?: number;
  }

  let { dataPoints, height = 180 }: Props = $props();

  // Reference to container for measuring
  let container: HTMLDivElement | undefined = $state();
  let containerWidth = $state(300);

  // Chart dimensions
  const padding = { top: 16, right: 24, bottom: 32, left: 48 };
  const chartHeight = height;
  const innerHeight = chartHeight - padding.top - padding.bottom;

  // Measure container width on mount and resize
  onMount(() => {
    if (!container) return;

    const updateWidth = () => {
      if (container) {
        containerWidth = container.clientWidth;
      }
    };

    updateWidth();

    const resizeObserver = new ResizeObserver(updateWidth);
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  });

  const chartWidth = $derived(containerWidth);
  const innerWidth = $derived(chartWidth - padding.left - padding.right);

  // Colors for project status (using 5-stop gradient from design system)
  const colors = {
    onTrack: "#55BF8C", // success-400 (peakFlow tier)
    atRisk: "#E7B24F", // warning-500 (steadyProgress tier)
    offTrack: "#B6556D", // danger-600 (lowTraction tier)
  };

  // Extract project data and convert to percentages
  const stackData = $derived(
    dataPoints.map((point) => {
      const onTrackCount = point.velocityHealth.onTrackCount;
      const atRiskCount = point.velocityHealth.atRiskCount;
      const offTrackCount = point.velocityHealth.offTrackCount;
      const total = onTrackCount + atRiskCount + offTrackCount;

      // Calculate percentages (each slice sums to 100%)
      const onTrackPct = total > 0 ? (onTrackCount / total) * 100 : 0;
      const atRiskPct = total > 0 ? (atRiskCount / total) * 100 : 0;
      const offTrackPct = total > 0 ? (offTrackCount / total) * 100 : 0;

      return {
        timestamp: new Date(point.capturedAt).getTime(),
        capturedAt: point.capturedAt,
        // Percentages for stacking
        onTrack: onTrackPct,
        atRisk: atRiskPct,
        offTrack: offTrackPct,
        // Keep counts for tooltip
        onTrackCount,
        atRiskCount,
        offTrackCount,
        total,
      };
    })
  );

  // Time range for X-axis
  const timeRange = $derived.by(() => {
    if (stackData.length === 0) return { min: 0, max: 1 };
    const timestamps = stackData.map((d) => d.timestamp);
    return {
      min: Math.min(...timestamps),
      max: Math.max(...timestamps),
    };
  });

  // Y-axis is fixed at 0-100% for percentage display
  const yMin = 0;
  const yMax = 100;

  // Calculate X position based on timestamp
  function getX(timestamp: number): number {
    const range = timeRange.max - timeRange.min;
    if (range === 0) return padding.left + innerWidth / 2;
    return padding.left + ((timestamp - timeRange.min) / range) * innerWidth;
  }

  // Calculate Y position for a value
  function getY(value: number): number {
    const range = yMax - yMin;
    if (range === 0) return padding.top + innerHeight / 2;
    return padding.top + innerHeight - ((value - yMin) / range) * innerHeight;
  }

  // Generate stacked area paths
  const areaPaths = $derived.by(() => {
    if (stackData.length === 0)
      return { onTrack: "", atRisk: "", offTrack: "" };

    // Build paths for each layer (stacked from bottom)
    const points = stackData.map((d) => ({
      x: getX(d.timestamp),
      onTrack: d.onTrack,
      atRisk: d.atRisk,
      offTrack: d.offTrack,
    }));

    // Bottom layer: On Track (0 to onTrack)
    let onTrackPath = `M ${points[0].x} ${getY(0)}`;
    for (const p of points) {
      onTrackPath += ` L ${p.x} ${getY(p.onTrack)}`;
    }
    // Close path back along bottom
    for (let i = points.length - 1; i >= 0; i--) {
      onTrackPath += ` L ${points[i].x} ${getY(0)}`;
    }
    onTrackPath += " Z";

    // Middle layer: At Risk (onTrack to onTrack + atRisk)
    let atRiskPath = `M ${points[0].x} ${getY(points[0].onTrack)}`;
    for (const p of points) {
      atRiskPath += ` L ${p.x} ${getY(p.onTrack + p.atRisk)}`;
    }
    // Close path back along top of onTrack
    for (let i = points.length - 1; i >= 0; i--) {
      atRiskPath += ` L ${points[i].x} ${getY(points[i].onTrack)}`;
    }
    atRiskPath += " Z";

    // Top layer: Off Track (onTrack + atRisk to total)
    let offTrackPath = `M ${points[0].x} ${getY(points[0].onTrack + points[0].atRisk)}`;
    for (const p of points) {
      offTrackPath += ` L ${p.x} ${getY(p.onTrack + p.atRisk + p.offTrack)}`;
    }
    // Close path back along top of atRisk
    for (let i = points.length - 1; i >= 0; i--) {
      offTrackPath += ` L ${points[i].x} ${getY(points[i].onTrack + points[i].atRisk)}`;
    }
    offTrackPath += " Z";

    return { onTrack: onTrackPath, atRisk: atRiskPath, offTrack: offTrackPath };
  });

  // Y-axis ticks - fixed at 25% increments for percentage display
  const yAxisTicks = [0, 25, 50, 75, 100];

  // X-axis labels
  const xLabels = $derived.by(() => {
    if (stackData.length === 0) return [];

    const range = timeRange.max - timeRange.min;
    if (range === 0 && stackData.length > 0) {
      return [
        {
          x: padding.left + innerWidth / 2,
          label: formatDate(stackData[0].capturedAt),
        },
      ];
    }

    // Show a label for every day
    const stepDays = 1;

    const startDate = new Date(timeRange.min);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(timeRange.max);
    endDate.setHours(0, 0, 0, 0);

    const labels: { x: number; label: string }[] = [];
    const currentDate = new Date(startDate);
    let dayIndex = 0;

    while (currentDate <= endDate) {
      if (dayIndex % stepDays === 0) {
        const noonTimestamp = new Date(currentDate).setHours(12, 0, 0, 0);
        const x =
          padding.left + ((noonTimestamp - timeRange.min) / range) * innerWidth;

        if (x >= padding.left && x <= chartWidth - padding.right) {
          labels.push({ x, label: formatDate(currentDate.toISOString()) });
        }
      }
      currentDate.setDate(currentDate.getDate() + 1);
      dayIndex++;
    }

    return labels;
  });

  function formatDate(isoString: string): string {
    const date = new Date(isoString);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  // Hover state
  let hoveredIndex = $state<number | null>(null);
  let mousePosition = $state({ x: 0, y: 0 });

  const hoveredData = $derived.by(() => {
    if (hoveredIndex === null || !stackData[hoveredIndex]) return null;
    const d = stackData[hoveredIndex];
    const date = new Date(d.capturedAt);
    return {
      date: date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }),
      // Percentages (rounded)
      onTrackPct: Math.round(d.onTrack),
      atRiskPct: Math.round(d.atRisk),
      offTrackPct: Math.round(d.offTrack),
      // Counts
      onTrackCount: d.onTrackCount,
      atRiskCount: d.atRiskCount,
      offTrackCount: d.offTrackCount,
      total: d.total,
    };
  });

  const TOOLTIP_WIDTH = 160;
  const TOOLTIP_OFFSET = 12;
  const tooltipPosition = $derived.by(() => {
    const shouldFlipLeft =
      mousePosition.x + TOOLTIP_WIDTH + TOOLTIP_OFFSET > containerWidth;
    return {
      x: shouldFlipLeft
        ? mousePosition.x - TOOLTIP_WIDTH - TOOLTIP_OFFSET
        : mousePosition.x + TOOLTIP_OFFSET,
      y: mousePosition.y - 60,
    };
  });

  function findNearestIndex(mouseX: number): number | null {
    if (stackData.length === 0) return null;

    let nearestIndex = 0;
    let nearestDistance = Infinity;

    for (let i = 0; i < stackData.length; i++) {
      const x = getX(stackData[i].timestamp);
      const distance = Math.abs(x - mouseX);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = i;
      }
    }

    return nearestIndex;
  }

  function handleMouseMove(event: MouseEvent) {
    const svg = event.currentTarget as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    const scaleX = chartWidth / rect.width;
    const mouseX = (event.clientX - rect.left) * scaleX;

    if (container) {
      const containerRect = container.getBoundingClientRect();
      mousePosition = {
        x: event.clientX - containerRect.left,
        y: event.clientY - containerRect.top,
      };
    }

    if (mouseX >= padding.left && mouseX <= chartWidth - padding.right) {
      hoveredIndex = findNearestIndex(mouseX);
    } else {
      hoveredIndex = null;
    }
  }

  function handleMouseLeave() {
    hoveredIndex = null;
  }

  // Legend items
  const legendItems = [
    { key: "onTrack", label: "On Track", color: colors.onTrack },
    { key: "atRisk", label: "At Risk", color: colors.atRisk },
    { key: "offTrack", label: "Off Track", color: colors.offTrack },
  ];
</script>

<div class="relative" bind:this={container}>
  <!-- Chart Title -->
  <div class="mb-2 text-xs font-medium text-black-400">
    Project Health Distribution
  </div>

  <!-- Chart -->
  <svg
    width={chartWidth}
    height={chartHeight}
    viewBox="0 0 {chartWidth} {chartHeight}"
    class="cursor-default"
    role="img"
    aria-label="Project status stacked area chart"
    onmousemove={handleMouseMove}
    onmouseleave={handleMouseLeave}
  >
    <!-- Grid lines -->
    <g class="grid-lines">
      {#each yAxisTicks as y (y)}
        <line
          x1={padding.left}
          y1={getY(y)}
          x2={chartWidth - padding.right}
          y2={getY(y)}
          stroke="rgba(255,255,255,0.05)"
          stroke-width="1"
        />
      {/each}
    </g>

    <!-- Y-axis labels -->
    <g class="y-axis">
      {#each yAxisTicks as y (y)}
        <text
          x={padding.left - 10}
          y={getY(y)}
          text-anchor="end"
          dominant-baseline="middle"
          class="fill-black-400 text-[11px] font-medium"
        >
          {y}%
        </text>
      {/each}
    </g>

    <!-- X-axis labels -->
    <g class="x-axis">
      {#each xLabels as { x, label }, idx (`${x}-${idx}`)}
        <text
          {x}
          y={chartHeight - padding.bottom + 20}
          text-anchor="middle"
          class="fill-black-400 text-[11px] font-medium"
        >
          {label}
        </text>
      {/each}
    </g>

    <!-- Stacked areas (bottom to top: onTrack, atRisk, offTrack) -->
    {#if stackData.length > 0}
      <path d={areaPaths.onTrack} fill={colors.onTrack} opacity="0.7" />
      <path d={areaPaths.atRisk} fill={colors.atRisk} opacity="0.7" />
      <path d={areaPaths.offTrack} fill={colors.offTrack} opacity="0.7" />
    {/if}

    <!-- Hover indicator line -->
    {#if hoveredIndex !== null}
      <line
        x1={getX(stackData[hoveredIndex].timestamp)}
        y1={padding.top}
        x2={getX(stackData[hoveredIndex].timestamp)}
        y2={padding.top + innerHeight}
        stroke="rgba(255,255,255,0.3)"
        stroke-width="1"
      />
    {/if}
  </svg>

  <!-- Hover Tooltip -->
  {#if hoveredData}
    <div
      class="absolute z-10 px-3 py-2 text-xs bg-black-900 border border-white/10 rounded-lg shadow-xl pointer-events-none"
      style="left: {tooltipPosition.x}px; top: {tooltipPosition.y}px;"
    >
      <div class="mb-1.5 text-black-400">{hoveredData.date}</div>
      <div class="space-y-1">
        <div class="flex items-center gap-1.5 justify-between">
          <div class="flex items-center gap-1.5">
            <span
              class="w-2 h-2 rounded-full"
              style="background-color: {colors.onTrack}"
            ></span>
            <span class="text-black-700 dark:text-black-300">On Track</span>
          </div>
          <span class="font-medium text-black-900 dark:text-white"
            >{hoveredData.onTrackPct}%
            <span class="text-black-500">({hoveredData.onTrackCount})</span
            ></span
          >
        </div>
        <div class="flex items-center gap-1.5 justify-between">
          <div class="flex items-center gap-1.5">
            <span
              class="w-2 h-2 rounded-full"
              style="background-color: {colors.atRisk}"
            ></span>
            <span class="text-black-700 dark:text-black-300">At Risk</span>
          </div>
          <span class="font-medium text-black-900 dark:text-white"
            >{hoveredData.atRiskPct}%
            <span class="text-black-500">({hoveredData.atRiskCount})</span
            ></span
          >
        </div>
        <div class="flex items-center gap-1.5 justify-between">
          <div class="flex items-center gap-1.5">
            <span
              class="w-2 h-2 rounded-full"
              style="background-color: {colors.offTrack}"
            ></span>
            <span class="text-black-700 dark:text-black-300">Off Track</span>
          </div>
          <span class="font-medium text-black-900 dark:text-white"
            >{hoveredData.offTrackPct}%
            <span class="text-black-500">({hoveredData.offTrackCount})</span
            ></span
          >
        </div>
        <div
          class="flex items-center justify-between pt-1 mt-1 border-t border-black-200 dark:border-white/10"
        >
          <span class="text-black-600 dark:text-black-400">Total Projects</span>
          <span class="font-medium text-black-900 dark:text-white"
            >{hoveredData.total}</span
          >
        </div>
      </div>
    </div>
  {/if}

  <!-- Empty state -->
  {#if stackData.length === 0}
    <div
      class="flex absolute inset-0 justify-center items-center text-sm text-black-500"
    >
      No project data available
    </div>
  {/if}

  <!-- Legend (bottom) -->
  <div
    class="flex flex-wrap gap-4 justify-center pt-3 mt-2 text-xs border-t border-white/5"
  >
    {#each legendItems as item (item.key)}
      <div class="flex gap-1.5 items-center">
        <div
          class="w-3 h-3 rounded-sm"
          style="background-color: {item.color}; opacity: 0.7;"
        ></div>
        <span class="text-black-600 dark:text-black-400">{item.label}</span>
      </div>
    {/each}
  </div>
</div>

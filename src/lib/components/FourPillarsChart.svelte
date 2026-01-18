<script lang="ts">
  import type { TrendDataPoint } from "../../routes/api/metrics/trends/+server";

  interface Props {
    dataPoints: TrendDataPoint[];
    height?: number;
  }

  let { dataPoints, height = 280 }: Props = $props();

  // Chart dimensions
  const padding = { top: 20, right: 20, bottom: 40, left: 50 };
  const chartWidth = 800;
  const chartHeight = height;
  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;

  // Pillar colors (Linear-style muted colors)
  const colors = {
    wipHealth: "#10b981", // emerald-500
    projectHealth: "#8b5cf6", // violet-500
    productivity: "#f59e0b", // amber-500
    quality: "#3b82f6", // blue-500
  };

  // Target for productivity (3/wk per IC over 2 weeks = 6)
  const PRODUCTIVITY_TARGET = 6;

  // Convert 14-day throughput to weekly rate
  function toWeeklyRate(value: number): number {
    return value / 2;
  }

  // Normalize productivity to 0-100 based on target (3/wk = 100%)
  function normalizeProductivity(value: number | null): number | null {
    if (value === null) return null;
    // value is over 2 weeks, target is 6 (3/wk * 2)
    const normalized = (value / PRODUCTIVITY_TARGET) * 100;
    return Math.min(normalized, 150); // Cap at 150% for visualization
  }

  // Get normalized values for each pillar with timestamp
  const normalizedData = $derived(
    dataPoints.map((point) => ({
      capturedAt: point.capturedAt,
      timestamp: new Date(point.capturedAt).getTime(),
      wipHealth: point.teamHealth.healthyWorkloadPercent,
      projectHealth: point.velocityHealth.onTrackPercent,
      productivity: normalizeProductivity(
        point.productivity.trueThroughputPerEngineer
      ),
      quality: point.quality.compositeScore,
    }))
  );

  // Time range for X-axis (based on actual timestamps)
  const timeRange = $derived.by(() => {
    if (normalizedData.length === 0) return { min: 0, max: 1 };
    const timestamps = normalizedData.map((d) => d.timestamp);
    return {
      min: Math.min(...timestamps),
      max: Math.max(...timestamps),
    };
  });

  // Y-axis scale (0-100, but allow up to 150 for productivity)
  const yMax = 100;
  const yMin = 0;

  // Calculate X position based on timestamp (time-proportional)
  function getX(index: number): number {
    if (normalizedData.length <= 1) return padding.left + innerWidth / 2;
    const timestamp = normalizedData[index].timestamp;
    const range = timeRange.max - timeRange.min;
    if (range === 0) return padding.left + innerWidth / 2;
    return padding.left + ((timestamp - timeRange.min) / range) * innerWidth;
  }

  // Calculate Y position for a value (inverted because SVG y=0 is top)
  function getY(value: number | null): number | null {
    if (value === null) return null;
    // Clamp to chart bounds
    const clampedValue = Math.max(yMin, Math.min(value, yMax));
    return padding.top + innerHeight - (clampedValue / yMax) * innerHeight;
  }

  // Generate SVG path for a line (straight lines between points)
  function generatePath(values: (number | null)[]): string {
    const validPoints: { x: number; y: number }[] = [];

    values.forEach((value, index) => {
      const y = getY(value);
      if (y !== null) {
        validPoints.push({ x: getX(index), y });
      }
    });

    if (validPoints.length === 0) return "";
    if (validPoints.length === 1)
      return `M ${validPoints[0].x} ${validPoints[0].y}`;

    // Straight line path connecting actual data points
    return validPoints
      .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
      .join(" ");
  }

  // Generate paths for each pillar
  const paths = $derived({
    wipHealth: generatePath(normalizedData.map((d) => d.wipHealth)),
    projectHealth: generatePath(normalizedData.map((d) => d.projectHealth)),
    productivity: generatePath(normalizedData.map((d) => d.productivity)),
    quality: generatePath(normalizedData.map((d) => d.quality)),
  });

  // Format date for display
  function formatDate(isoString: string): string {
    const date = new Date(isoString);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  // Format date with time for tooltip
  function formatDateTime(isoString: string): string {
    const date = new Date(isoString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  // Generate X-axis labels (up to 5 evenly spaced dates based on time range)
  const xLabels = $derived.by(() => {
    if (normalizedData.length === 0) return [];

    const range = timeRange.max - timeRange.min;
    if (range === 0) {
      return [
        {
          x: padding.left + innerWidth / 2,
          label: formatDate(normalizedData[0].capturedAt),
        },
      ];
    }

    // Get the start and end dates (at midnight local time)
    const startDate = new Date(timeRange.min);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(timeRange.max);
    endDate.setHours(0, 0, 0, 0);

    // Calculate total days in range
    const msPerDay = 24 * 60 * 60 * 1000;
    const totalDays =
      Math.ceil((endDate.getTime() - startDate.getTime()) / msPerDay) + 1;

    // Determine step size to show at most 5 labels
    const maxLabels = 5;
    const stepDays = Math.max(1, Math.ceil(totalDays / maxLabels));

    // Generate labels at regular day intervals
    const labels: { x: number; label: string }[] = [];
    const currentDate = new Date(startDate);
    let dayIndex = 0;

    while (currentDate <= endDate) {
      if (dayIndex % stepDays === 0) {
        // Position at noon of each day for centering
        const noonTimestamp = new Date(currentDate).setHours(12, 0, 0, 0);
        const x =
          padding.left + ((noonTimestamp - timeRange.min) / range) * innerWidth;

        // Only add if within chart bounds
        if (x >= padding.left && x <= chartWidth - padding.right) {
          labels.push({
            x,
            label: formatDate(currentDate.toISOString()),
          });
        }
      }

      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
      dayIndex++;
    }

    return labels;
  });

  // Y-axis labels
  const yLabels = [0, 25, 50, 75, 100];

  // Hover state
  let hoveredIndex = $state<number | null>(null);

  // Get data point for hover tooltip
  const hoveredData = $derived(
    hoveredIndex !== null ? normalizedData[hoveredIndex] : null
  );
  const hoveredRaw = $derived(
    hoveredIndex !== null ? dataPoints[hoveredIndex] : null
  );

  // Find nearest snapshot to mouse position
  function findNearestIndex(mouseX: number): number | null {
    if (normalizedData.length === 0) return null;

    let nearestIndex = 0;
    let nearestDistance = Infinity;

    for (let i = 0; i < normalizedData.length; i++) {
      const x = getX(i);
      const distance = Math.abs(x - mouseX);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = i;
      }
    }

    return nearestIndex;
  }

  // Handle mouse move on chart
  function handleMouseMove(event: MouseEvent) {
    const svg = event.currentTarget as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    const scaleX = chartWidth / rect.width;
    const mouseX = (event.clientX - rect.left) * scaleX;

    // Only trigger hover if within chart area
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
    { key: "wipHealth", label: "WIP Health", color: colors.wipHealth },
    {
      key: "projectHealth",
      label: "Project Health",
      color: colors.projectHealth,
    },
    { key: "productivity", label: "Productivity", color: colors.productivity },
    { key: "quality", label: "Quality", color: colors.quality },
  ];
</script>

<div class="relative">
  <!-- Legend -->
  <div class="flex flex-wrap gap-4 justify-center mb-4 text-xs">
    {#each legendItems as item (item.key)}
      <div class="flex gap-1.5 items-center">
        <div
          class="w-3 h-0.5 rounded-full"
          style="background-color: {item.color}"
        ></div>
        <span class="text-neutral-400">{item.label}</span>
      </div>
    {/each}
  </div>

  <!-- Chart -->
  <svg
    viewBox="0 0 {chartWidth} {chartHeight}"
    class="w-full h-auto cursor-crosshair"
    role="img"
    aria-label="Four Pillars metrics trend chart"
    onmousemove={handleMouseMove}
    onmouseleave={handleMouseLeave}
  >
    <!-- Grid lines -->
    <g class="grid-lines">
      {#each yLabels as y (y)}
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
      {#each yLabels as y (y)}
        <text
          x={padding.left - 10}
          y={getY(y) ?? 0}
          text-anchor="end"
          dominant-baseline="middle"
          class="fill-neutral-500 text-[11px]"
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
          class="fill-neutral-500 text-[10px]"
        >
          {label}
        </text>
      {/each}
    </g>

    <!-- Data lines -->
    {#if normalizedData.length > 0}
      <!-- WIP Health line -->
      {#if paths.wipHealth}
        <path
          d={paths.wipHealth}
          fill="none"
          stroke={colors.wipHealth}
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="opacity-60"
        />
      {/if}

      <!-- Project Health line -->
      {#if paths.projectHealth}
        <path
          d={paths.projectHealth}
          fill="none"
          stroke={colors.projectHealth}
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="opacity-60"
        />
      {/if}

      <!-- Productivity line -->
      {#if paths.productivity}
        <path
          d={paths.productivity}
          fill="none"
          stroke={colors.productivity}
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-dasharray="4 2"
          class="opacity-60"
        />
      {/if}

      <!-- Quality line -->
      {#if paths.quality}
        <path
          d={paths.quality}
          fill="none"
          stroke={colors.quality}
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="opacity-60"
        />
      {/if}

      <!-- Data point dots (always visible) -->
      {#each normalizedData as point, i (point.capturedAt)}
        {@const x = getX(i)}
        {@const isHovered = hoveredIndex === i}
        <!-- WIP Health dot -->
        {#if point.wipHealth !== null}
          <circle
            cx={x}
            cy={getY(point.wipHealth)}
            r={isHovered ? 5 : 3}
            fill={colors.wipHealth}
            class="transition-all duration-100"
            style="opacity: {isHovered ? 1 : 0.7}"
          />
        {/if}
        <!-- Project Health dot -->
        {#if point.projectHealth !== null}
          <circle
            cx={x}
            cy={getY(point.projectHealth)}
            r={isHovered ? 5 : 3}
            fill={colors.projectHealth}
            class="transition-all duration-100"
            style="opacity: {isHovered ? 1 : 0.7}"
          />
        {/if}
        <!-- Productivity dot -->
        {#if point.productivity !== null}
          <circle
            cx={x}
            cy={getY(point.productivity)}
            r={isHovered ? 5 : 3}
            fill={colors.productivity}
            class="transition-all duration-100"
            style="opacity: {isHovered ? 1 : 0.7}"
          />
        {/if}
        <!-- Quality dot -->
        {#if point.quality !== null}
          <circle
            cx={x}
            cy={getY(point.quality)}
            r={isHovered ? 5 : 3}
            fill={colors.quality}
            class="transition-all duration-100"
            style="opacity: {isHovered ? 1 : 0.7}"
          />
        {/if}
      {/each}
    {/if}

    <!-- Hover indicator line -->
    {#if hoveredIndex !== null}
      <line
        x1={getX(hoveredIndex)}
        y1={padding.top}
        x2={getX(hoveredIndex)}
        y2={padding.top + innerHeight}
        stroke="rgba(255,255,255,0.3)"
        stroke-width="1"
      />
    {/if}
  </svg>

  <!-- Tooltip -->
  {#if hoveredData && hoveredRaw}
    <div
      class="absolute top-0 right-0 p-3 text-xs rounded-md border shadow-lg pointer-events-none bg-neutral-900 border-white/10"
    >
      <div class="mb-2 font-medium text-white">
        {formatDateTime(hoveredData.capturedAt)}
      </div>
      <div class="space-y-1">
        <div class="flex gap-2 justify-between items-center">
          <div class="flex gap-1.5 items-center">
            <div
              class="w-2 h-2 rounded-full"
              style="background-color: {colors.wipHealth}"
            ></div>
            <span class="text-neutral-400">WIP Health</span>
          </div>
          <span class="font-medium text-white"
            >{hoveredData.wipHealth.toFixed(0)}%</span
          >
        </div>
        <div class="flex gap-2 justify-between items-center">
          <div class="flex gap-1.5 items-center">
            <div
              class="w-2 h-2 rounded-full"
              style="background-color: {colors.projectHealth}"
            ></div>
            <span class="text-neutral-400">Project Health</span>
          </div>
          <span class="font-medium text-white"
            >{hoveredData.projectHealth.toFixed(0)}%</span
          >
        </div>
        <div class="flex gap-2 justify-between items-center">
          <div class="flex gap-1.5 items-center">
            <div
              class="w-2 h-2 rounded-full"
              style="background-color: {colors.productivity}"
            ></div>
            <span class="text-neutral-400">Productivity</span>
          </div>
          {#if hoveredRaw.productivity.trueThroughputPerEngineer !== null}
            <span class="font-medium text-white"
              >{toWeeklyRate(
                hoveredRaw.productivity.trueThroughputPerEngineer
              ).toFixed(2)}/wk</span
            >
          {:else}
            <span class="text-neutral-500">—</span>
          {/if}
        </div>
        <div class="flex gap-2 justify-between items-center">
          <div class="flex gap-1.5 items-center">
            <div
              class="w-2 h-2 rounded-full"
              style="background-color: {colors.quality}"
            ></div>
            <span class="text-neutral-400">Quality</span>
          </div>
          <span class="font-medium text-white"
            >{hoveredData.quality.toFixed(0)}</span
          >
        </div>
      </div>
    </div>
  {/if}

  <!-- Empty state -->
  {#if normalizedData.length === 0}
    <div
      class="flex absolute inset-0 justify-center items-center text-sm text-neutral-500"
    >
      No trend data available
    </div>
  {/if}
</div>

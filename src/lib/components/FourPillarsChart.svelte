<script lang="ts">
  import type { TrendDataPoint } from "../../routes/api/metrics/trends/+server";

  interface Props {
    dataPoints: TrendDataPoint[];
    height?: number;
    /** Callback when hovering over a data point (null when mouse leaves) */
    onhover?: (dataPoint: TrendDataPoint | null) => void;
  }

  let { dataPoints, height = 180, onhover }: Props = $props();

  // Chart dimensions - balanced padding for clean look
  const padding = { top: 16, right: 24, bottom: 32, left: 40 };
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

  // Generate SVG path for a line (monotonic cubic interpolation - prevents overshooting)
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

    if (validPoints.length === 2) {
      return `M ${validPoints[0].x} ${validPoints[0].y} L ${validPoints[1].x} ${validPoints[1].y}`;
    }

    // Monotonic cubic interpolation (Fritsch-Carlson method)
    // This prevents overshooting on steep slopes
    const n = validPoints.length;

    // Calculate slopes between consecutive points
    const deltas: number[] = [];
    const slopes: number[] = [];
    for (let i = 0; i < n - 1; i++) {
      const dx = validPoints[i + 1].x - validPoints[i].x;
      const dy = validPoints[i + 1].y - validPoints[i].y;
      deltas.push(dx);
      slopes.push(dx === 0 ? 0 : dy / dx);
    }

    // Calculate tangents at each point
    const tangents: number[] = [slopes[0]];
    for (let i = 1; i < n - 1; i++) {
      if (slopes[i - 1] * slopes[i] <= 0) {
        // Different signs or zero - set tangent to 0 to prevent overshoot
        tangents.push(0);
      } else {
        // Harmonic mean of slopes (Fritsch-Carlson)
        tangents.push(
          (2 * slopes[i - 1] * slopes[i]) / (slopes[i - 1] + slopes[i])
        );
      }
    }
    tangents.push(slopes[n - 2]);

    // Build the path
    let path = `M ${validPoints[0].x} ${validPoints[0].y}`;

    for (let i = 0; i < n - 1; i++) {
      const p0 = validPoints[i];
      const p1 = validPoints[i + 1];
      const dx = deltas[i];

      // Control points for cubic bezier
      const cp1x = p0.x + dx / 3;
      const cp1y = p0.y + (tangents[i] * dx) / 3;
      const cp2x = p1.x - dx / 3;
      const cp2y = p1.y - (tangents[i + 1] * dx) / 3;

      path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p1.x} ${p1.y}`;
    }

    return path;
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

  // Y-axis: major lines (labeled) and minor lines (unlabeled, subtler)
  const yLabelsMajor = [0, 100];
  const yLabelsMinor = [25, 50, 75];

  // Hover state
  let hoveredIndex = $state<number | null>(null);

  // Emit hover events to parent
  $effect(() => {
    const dataPoint = hoveredIndex !== null ? dataPoints[hoveredIndex] : null;
    onhover?.(dataPoint);
  });

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

<div class="relative pt-2 pb-1">
  <!-- Chart -->
  <svg
    viewBox="0 0 {chartWidth} {chartHeight}"
    class="w-full h-auto cursor-crosshair"
    role="img"
    aria-label="Four Pillars metrics trend chart"
    onmousemove={handleMouseMove}
    onmouseleave={handleMouseLeave}
  >
    <!-- Grid lines (minor - subtler) -->
    <g class="grid-lines-minor">
      {#each yLabelsMinor as y (y)}
        <line
          x1={padding.left}
          y1={getY(y)}
          x2={chartWidth - padding.right}
          y2={getY(y)}
          stroke="rgba(255,255,255,0.03)"
          stroke-width="1"
        />
      {/each}
    </g>

    <!-- Grid lines (major) -->
    <g class="grid-lines-major">
      {#each yLabelsMajor as y (y)}
        <line
          x1={padding.left}
          y1={getY(y)}
          x2={chartWidth - padding.right}
          y2={getY(y)}
          stroke="rgba(255,255,255,0.06)"
          stroke-width="1"
        />
      {/each}
    </g>

    <!-- Y-axis labels (major only) -->
    <g class="y-axis">
      {#each yLabelsMajor as y (y)}
        <text
          x={padding.left - 10}
          y={getY(y) ?? 0}
          text-anchor="end"
          dominant-baseline="middle"
          class="fill-neutral-600 text-[9px]"
        >
          {y}
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
          class="fill-neutral-600 text-[9px]"
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
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          style="filter: drop-shadow(0 0 2px {colors.wipHealth})"
        />
      {/if}

      <!-- Project Health line -->
      {#if paths.projectHealth}
        <path
          d={paths.projectHealth}
          fill="none"
          stroke={colors.projectHealth}
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          style="filter: drop-shadow(0 0 2px {colors.projectHealth})"
        />
      {/if}

      <!-- Productivity line -->
      {#if paths.productivity}
        <path
          d={paths.productivity}
          fill="none"
          stroke={colors.productivity}
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          style="filter: drop-shadow(0 0 2px {colors.productivity})"
        />
      {/if}

      <!-- Quality line -->
      {#if paths.quality}
        <path
          d={paths.quality}
          fill="none"
          stroke={colors.quality}
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          style="filter: drop-shadow(0 0 2px {colors.quality})"
        />
      {/if}
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

  <!-- Empty state -->
  {#if normalizedData.length === 0}
    <div
      class="flex absolute inset-0 justify-center items-center text-sm text-neutral-500"
    >
      No trend data available
    </div>
  {/if}

  <!-- Legend (bottom) -->
  <div
    class="flex flex-wrap gap-6 justify-center pt-4 mt-2 text-xs border-t border-white/5"
  >
    {#each legendItems as item (item.key)}
      <div class="flex gap-2 items-center">
        <div
          class="w-5 h-[3px] rounded-full"
          style="background-color: {item.color}; box-shadow: 0 0 3px {item.color}"
        ></div>
        <span class="text-neutral-400">{item.label}</span>
      </div>
    {/each}
  </div>
</div>

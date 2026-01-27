<script lang="ts">
  import { onMount } from "svelte";
  import type { TrendDataPoint } from "../../routes/api/metrics/trends/+server";

  interface Props {
    dataPoints: TrendDataPoint[];
    height?: number;
    /** Number of days visible in the viewport at a time */
    visibleDays?: number;
    /** Compact mode for multi-chart layouts - smaller legend */
    compact?: boolean;
    /** Optional title shown above chart */
    title?: string;
  }

  let {
    dataPoints,
    height = 180,
    visibleDays = 14,
    compact = false,
    title,
  }: Props = $props();

  // Reference to scroll container for auto-scroll and measuring
  let scrollContainer: HTMLDivElement | undefined = $state();

  // Measured container width (responsive)
  let containerWidth = $state(800); // Default fallback

  // Chart dimensions - balanced padding for clean look (increased left for larger labels, bottom for rotated x-axis)
  const padding = { top: 16, right: 24, bottom: 48, left: 48 };
  const chartHeight = height;
  const innerHeight = chartHeight - padding.top - padding.bottom;

  // Measure container width on mount and resize
  onMount(() => {
    if (!scrollContainer) return;

    const updateWidth = () => {
      if (scrollContainer) {
        containerWidth = scrollContainer.clientWidth;
      }
    };

    updateWidth();

    const resizeObserver = new ResizeObserver(updateWidth);
    resizeObserver.observe(scrollContainer);

    // Scroll to end on mount if scrollable (after a tick to let the chart render)
    setTimeout(() => {
      if (scrollContainer && actualDays > visibleDays) {
        scrollContainer.scrollLeft = scrollContainer.scrollWidth;
      }
    }, 0);

    return () => resizeObserver.disconnect();
  });

  // Calculate actual time span in days from data
  const actualDays = $derived.by(() => {
    if (dataPoints.length < 2) return 0;
    const timestamps = dataPoints.map((d) => new Date(d.capturedAt).getTime());
    const minTime = Math.min(...timestamps);
    const maxTime = Math.max(...timestamps);
    const msPerDay = 24 * 60 * 60 * 1000;
    return (maxTime - minTime) / msPerDay;
  });

  // Chart width: scale so visibleDays fits in container, minimum is container width
  // With <= visibleDays of data, chart is exactly container width (data fills full width)
  // With > visibleDays of data, chart is wider and scrollable
  const chartWidth = $derived(
    Math.max(containerWidth, (actualDays / visibleDays) * containerWidth)
  );
  const innerWidth = $derived(chartWidth - padding.left - padding.right);

  // Whether scrolling is needed (more than visibleDays of data)
  const isScrollable = $derived(actualDays > visibleDays);

  // Also scroll to end when dataPoints changes - only if scrollable
  $effect(() => {
    // Track dataPoints length and scrollability to trigger effect
    const _len = dataPoints.length;
    const _scrollable = isScrollable;
    // Use setTimeout to ensure DOM has updated
    setTimeout(() => {
      if (scrollContainer && isScrollable) {
        scrollContainer.scrollLeft = scrollContainer.scrollWidth;
      }
    }, 0);
  });

  // Pillar colors (using new design system palette)
  const colors = {
    wipHealth: "#49AA7C", // success-500
    projectHealth: "#8661D2", // brand-500
    productivity: "#FFCA5A", // warning-400
    quality: "#2563EB", // blue-600
    hygiene: "#EC4899", // pink-500
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
      hygiene: point.linearHygiene?.hygieneScore ?? null,
    }))
  );

  // Time range for X-axis (based on actual data timestamps)
  // Data always fills the full chart width regardless of how many days it spans
  const timeRange = $derived.by(() => {
    if (normalizedData.length === 0) return { min: 0, max: 1 };
    const timestamps = normalizedData.map((d) => d.timestamp);
    return {
      min: Math.min(...timestamps),
      max: Math.max(...timestamps),
    };
  });

  // Calculate dynamic Y-axis range based on data
  // Snap to 25% increments for clean labels
  const yRange = $derived.by(() => {
    if (normalizedData.length === 0) return { min: 0, max: 100 };

    // Collect values separately - capped metrics vs uncapped (productivity)
    const cappedValues: number[] = []; // WIP, Project, Quality, Hygiene - max 100
    const uncappedValues: number[] = []; // Productivity - can exceed 100

    for (const d of normalizedData) {
      if (d.wipHealth !== null) cappedValues.push(Math.min(d.wipHealth, 100));
      if (d.projectHealth !== null)
        cappedValues.push(Math.min(d.projectHealth, 100));
      if (d.quality !== null) cappedValues.push(Math.min(d.quality, 100));
      if (d.hygiene !== null) cappedValues.push(Math.min(d.hygiene, 100));
      if (d.productivity !== null) uncappedValues.push(d.productivity);
    }

    const allValues = [...cappedValues, ...uncappedValues];
    if (allValues.length === 0) return { min: 0, max: 100 };

    const dataMin = Math.min(...allValues);
    const dataMax = Math.max(...allValues);

    // Snap to 25% increments (down for min, up for max)
    const yMin = Math.max(0, Math.floor(dataMin / 25) * 25);

    // For max: if no productivity exceeds 100, cap at 100; otherwise allow higher
    const maxProductivity =
      uncappedValues.length > 0 ? Math.max(...uncappedValues) : 0;
    const effectiveMax =
      maxProductivity > 100 ? dataMax : Math.min(dataMax, 100);
    const yMax = Math.ceil(effectiveMax / 25) * 25;

    return { min: yMin, max: Math.max(yMax, yMin + 25) }; // Ensure at least 25-point range
  });

  // Y-axis bounds from derived range
  const yMax = $derived(yRange.max);
  const yMin = $derived(yRange.min);

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
    // Map value from [yMin, yMax] to [innerHeight, 0] (inverted for SVG)
    const range = yMax - yMin;
    if (range === 0) return padding.top + innerHeight / 2;
    return (
      padding.top + innerHeight - ((clampedValue - yMin) / range) * innerHeight
    );
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
    hygiene: generatePath(normalizedData.map((d) => d.hygiene)),
  });

  // Format date for display
  function formatDate(isoString: string): string {
    const date = new Date(isoString);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  // Generate X-axis labels only for Mondays and 1st of month
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

    // Generate labels only for Mondays (day 1) or 1st of month
    const labels: { x: number; label: string }[] = [];
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const isMonday = currentDate.getDay() === 1;
      const isFirstOfMonth = currentDate.getDate() === 1;

      if (isMonday || isFirstOfMonth) {
        // Position at noon of each day for centering
        const noonTimestamp = new Date(currentDate).setHours(12, 0, 0, 0);
        const x =
          padding.left + ((noonTimestamp - timeRange.min) / range) * innerWidth;

        // Only add if within chart bounds
        if (x >= padding.left && x <= chartWidth - padding.right) {
          // Show month name on 1st of month, otherwise just day
          const label = isFirstOfMonth
            ? currentDate.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })
            : currentDate.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              });
          labels.push({ x, label });
        }
      }

      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return labels;
  });

  // Y-axis: snap to 25% increments for clean labels
  const yAxisTicks = $derived.by(() => {
    // Round min down and max up to nearest 25%
    const snappedMin = Math.floor(yMin / 25) * 25;
    const snappedMax = Math.ceil(yMax / 25) * 25;

    const ticks: number[] = [];
    for (let v = snappedMin; v <= snappedMax; v += 25) {
      ticks.push(v);
    }
    return ticks;
  });

  // Major ticks are min and max, minor ticks are the intermediate ones
  const yLabelsMajor = $derived([yMin, yMax]);
  const yLabelsMinor = $derived(
    yAxisTicks.filter((t) => t !== yMin && t !== yMax)
  );

  // Hover state
  let hoveredIndex = $state<number | null>(null);
  let mousePosition = $state({ x: 0, y: 0 });

  // Get hovered data point info for tooltip
  const hoveredData = $derived.by(() => {
    if (hoveredIndex === null) return null;
    const point = dataPoints[hoveredIndex];
    const norm = normalizedData[hoveredIndex];
    if (!point || !norm) return null;

    const date = new Date(point.capturedAt);
    return {
      date: date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }),
      wipHealth: Math.round(norm.wipHealth ?? 0),
      projectHealth: Math.round(norm.projectHealth ?? 0),
      productivity: Math.round(norm.productivity ?? 0),
      quality: Math.round(norm.quality ?? 0),
      hygiene: norm.hygiene !== null ? Math.round(norm.hygiene) : null,
    };
  });

  // Tooltip positioning - flip to left side when near right edge
  const TOOLTIP_WIDTH = 180; // Approximate tooltip width
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

    // Track mouse position relative to the scroll container for tooltip positioning
    if (scrollContainer) {
      const containerRect = scrollContainer.getBoundingClientRect();
      mousePosition = {
        x: event.clientX - containerRect.left,
        y: event.clientY - containerRect.top,
      };
    }

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
    { key: "hygiene", label: "Hygiene", color: colors.hygiene },
  ];
</script>

<div class="relative pt-2 pb-1">
  <!-- Optional title -->
  {#if title}
    <div class="mb-2 text-xs font-medium text-black-400">{title}</div>
  {/if}

  <!-- Max-width wrapper to constrain chart and make trends more visible -->
  <div class="mx-auto" style="max-width: {compact ? '100%' : '900px'};">
    <!-- Scrollable Chart Container -->
    <div
      bind:this={scrollContainer}
      class="overflow-x-auto scrollbar-thin scrollbar-thumb-black-700 scrollbar-track-transparent"
      style="max-width: 100%;"
    >
      <!-- Chart -->
      <svg
        width={chartWidth}
        height={chartHeight}
        viewBox="0 0 {chartWidth} {chartHeight}"
        class="cursor-default"
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
              class="stroke-black-200 dark:stroke-white/3"
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
              class="stroke-black-300 dark:stroke-white/6"
              stroke-width="1"
            />
          {/each}
        </g>

        <!-- Y-axis labels (all ticks for dynamic range) -->
        <g class="y-axis">
          {#each yAxisTicks as y (y)}
            <text
              x={padding.left - 10}
              y={getY(y) ?? 0}
              text-anchor="end"
              dominant-baseline="middle"
              class="fill-black-400 text-[11px] font-medium"
            >
              {y}%
            </text>
          {/each}
        </g>

        <!-- X-axis labels (rotated for readability) -->
        <g class="x-axis">
          {#each xLabels as { x, label }, idx (`${x}-${idx}`)}
            <text
              {x}
              y={chartHeight - padding.bottom + 12}
              text-anchor="end"
              transform="rotate(-45, {x}, {chartHeight - padding.bottom + 12})"
              class="fill-black-400 text-[10px] font-medium"
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
            />
          {/if}

          <!-- Hygiene line -->
          {#if paths.hygiene}
            <path
              d={paths.hygiene}
              fill="none"
              stroke={colors.hygiene}
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
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
    </div>
  </div>

  <!-- Hover Card Tooltip -->
  {#if hoveredData}
    <div
      class="absolute z-10 px-3 py-2 text-xs bg-black-900 border border-white/10 rounded-lg shadow-xl pointer-events-none"
      style="left: {tooltipPosition.x}px; top: {tooltipPosition.y}px;"
    >
      <div class="mb-1.5 text-black-400">{hoveredData.date}</div>
      <div class="grid grid-cols-2 gap-x-4 gap-y-1">
        <div class="flex items-center gap-1.5">
          <span
            class="w-2 h-2 rounded-full"
            style="background-color: {colors.wipHealth}"
          ></span>
          <span class="text-black-700 dark:text-black-300">WIP Health</span>
          <span class="ml-auto font-medium text-black-900 dark:text-white"
            >{hoveredData.wipHealth}%</span
          >
        </div>
        <div class="flex items-center gap-1.5">
          <span
            class="w-2 h-2 rounded-full"
            style="background-color: {colors.projectHealth}"
          ></span>
          <span class="text-black-700 dark:text-black-300">Project Health</span>
          <span class="ml-auto font-medium text-black-900 dark:text-white"
            >{hoveredData.projectHealth}%</span
          >
        </div>
        <div class="flex items-center gap-1.5">
          <span
            class="w-2 h-2 rounded-full"
            style="background-color: {colors.productivity}"
          ></span>
          <span class="text-black-700 dark:text-black-300">Velocity</span>
          <span class="ml-auto font-medium text-black-900 dark:text-white"
            >{hoveredData.productivity}%</span
          >
        </div>
        <div class="flex items-center gap-1.5">
          <span
            class="w-2 h-2 rounded-full"
            style="background-color: {colors.quality}"
          ></span>
          <span class="text-black-700 dark:text-black-300">Quality</span>
          <span class="ml-auto font-medium text-black-900 dark:text-white"
            >{hoveredData.quality}%</span
          >
        </div>
        {#if hoveredData.hygiene !== null}
          <div class="flex items-center gap-1.5">
            <span
              class="w-2 h-2 rounded-full"
              style="background-color: {colors.hygiene}"
            ></span>
            <span class="text-black-700 dark:text-black-300">Hygiene</span>
            <span class="ml-auto font-medium text-black-900 dark:text-white"
              >{hoveredData.hygiene}%</span
            >
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Empty state -->
  {#if normalizedData.length === 0}
    <div
      class="flex absolute inset-0 justify-center items-center text-sm text-black-500"
    >
      No trend data available
    </div>
  {/if}

  <!-- Legend (bottom) -->
  <div
    class="flex flex-wrap justify-center pt-3 mt-2 text-xs border-t border-white/5 {compact
      ? 'gap-3'
      : 'gap-6'}"
  >
    {#each legendItems as item (item.key)}
      <div class="flex gap-1.5 items-center">
        <div
          class="h-[2px] rounded-full {compact ? 'w-3' : 'w-5'}"
          style="background-color: {item.color}"
        ></div>
        <span class="text-black-400 {compact ? 'text-[10px]' : ''}"
          >{item.label}</span
        >
      </div>
    {/each}
  </div>
</div>

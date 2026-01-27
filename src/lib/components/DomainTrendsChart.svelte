<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import type {
    TrendDataPoint,
    TrendsResponse,
  } from "../../routes/api/metrics/trends/+server";

  interface Domain {
    name: string;
    teams: { teamKey: string; teamName: string | null }[];
  }

  interface Props {
    domains: Domain[];
    height?: number;
  }

  let { domains, height = 180 }: Props = $props();

  // 10 carefully selected colors from the design system palette
  const baseColors = [
    "#8661D2", // brand-500
    "#49AA7C", // success-500
    "#E7B24F", // warning-500
    "#2563EB", // blue-600
    "#EC4899", // pink-500
    "#0EA5E9", // sky-500
    "#FE6030", // hot-take-600
    "#84CC16", // lime-500
    "#9333EA", // purple-600
    "#14B8A6", // teal-500
  ];

  // Generate color for domain index - cycles through base colors with slight hue shift
  function getDomainColor(index: number): string {
    if (index < baseColors.length) {
      return baseColors[index];
    }
    // For additional domains, cycle through base colors with brightness variation
    const baseIndex = index % baseColors.length;
    const cycle = Math.floor(index / baseColors.length);
    const baseColor = baseColors[baseIndex];

    // Parse hex and adjust lightness
    const r = parseInt(baseColor.slice(1, 3), 16);
    const g = parseInt(baseColor.slice(3, 5), 16);
    const b = parseInt(baseColor.slice(5, 7), 16);

    // Alternate between lighter and darker variants
    const factor = cycle % 2 === 0 ? 0.7 : 1.3;
    const newR = Math.min(255, Math.max(0, Math.round(r * factor)));
    const newG = Math.min(255, Math.max(0, Math.round(g * factor)));
    const newB = Math.min(255, Math.max(0, Math.round(b * factor)));

    return `rgb(${newR}, ${newG}, ${newB})`;
  }

  // Metric options
  type MetricKey =
    | "overall"
    | "wipHealth"
    | "projectHealth"
    | "productivity"
    | "quality"
    | "hygiene";

  const metricOptions: { key: MetricKey; label: string }[] = [
    { key: "overall", label: "Overall" },
    { key: "wipHealth", label: "WIP Health" },
    { key: "projectHealth", label: "Project Health" },
    { key: "productivity", label: "Productivity" },
    { key: "quality", label: "Quality" },
    { key: "hygiene", label: "Hygiene" },
  ];

  let selectedMetric = $state<MetricKey>("overall");

  // Domain trend data - keyed by domain name
  let domainTrendData = $state<Map<string, TrendDataPoint[]>>(new Map());
  let loading = $state(false);
  let error = $state<string | null>(null);

  // Reference to container for measuring
  let container: HTMLDivElement | undefined = $state();
  let containerWidth = $state(300);

  // Chart dimensions (increased bottom for rotated x-axis labels)
  const padding = { top: 16, right: 24, bottom: 48, left: 48 };
  const chartHeight = height;
  const innerHeight = chartHeight - padding.top - padding.bottom;

  // Measure container width
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

  // Fetch all domain trends when domains change
  $effect(() => {
    if (!browser || domains.length === 0) return;

    const fetchAllDomainTrends = async () => {
      loading = true;
      error = null;

      try {
        const newData = new Map<string, TrendDataPoint[]>();

        // Fetch trends for each domain in parallel
        const promises = domains.map(async (domain) => {
          const response = await fetch(
            `/api/metrics/trends?level=domain&levelId=${encodeURIComponent(domain.name)}&limit=10000`
          );
          const data = (await response.json()) as TrendsResponse;

          if (data.success && data.dataPoints) {
            const sorted = data.dataPoints.sort(
              (a, b) =>
                new Date(a.capturedAt).getTime() -
                new Date(b.capturedAt).getTime()
            );
            return { name: domain.name, points: sorted };
          }
          return { name: domain.name, points: [] };
        });

        const results = await Promise.all(promises);
        for (const result of results) {
          if (result.points.length > 0) {
            newData.set(result.name, result.points);
          }
        }

        domainTrendData = newData;
      } catch (e) {
        console.error("Failed to fetch domain trends:", e);
        error =
          e instanceof Error ? e.message : "Failed to fetch domain trends";
      } finally {
        loading = false;
      }
    };

    fetchAllDomainTrends();
  });

  // Extract metric value from a data point
  // Extract and normalize metric value from a data point
  // WIP, Project, Quality, Hygiene, Overall: capped at 100
  // Productivity: capped at 150 (can exceed 100% of target)
  function getMetricValue(
    point: TrendDataPoint,
    metric: MetricKey
  ): number | null {
    switch (metric) {
      case "wipHealth":
        return Math.min(point.teamHealth.healthyWorkloadPercent, 100);
      case "projectHealth":
        return Math.min(point.velocityHealth.onTrackPercent, 100);
      case "productivity": {
        const val = point.productivity.trueThroughputPerEngineer;
        if (val === null) return null;
        // Normalize: 6 per 2 weeks = 100%, cap at 150%
        return Math.min((val / 6) * 100, 150);
      }
      case "quality":
        return Math.min(point.quality.compositeScore, 100);
      case "hygiene": {
        const hygieneScore = point.linearHygiene?.hygieneScore;
        if (hygieneScore === undefined || hygieneScore === null) return null;
        return Math.min(hygieneScore, 100);
      }
      case "overall": {
        // Average of all 5 pillars, each capped at 100 for fairness
        const wip = Math.min(point.teamHealth.healthyWorkloadPercent, 100);
        const proj = Math.min(point.velocityHealth.onTrackPercent, 100);
        const prod = point.productivity.trueThroughputPerEngineer;
        const qual = Math.min(point.quality.compositeScore, 100);
        const hyg = point.linearHygiene?.hygieneScore;

        const values: number[] = [wip, proj, qual];
        if (prod !== null) {
          values.push(Math.min((prod / 6) * 100, 100));
        }
        if (hyg !== undefined && hyg !== null) {
          values.push(Math.min(hyg, 100));
        }

        if (values.length === 0) return null;
        // Overall is also capped at 100
        return Math.min(values.reduce((a, b) => a + b, 0) / values.length, 100);
      }
    }
  }

  // Get all timestamps across all domains for consistent X-axis
  const allTimestamps = $derived.by(() => {
    const timestamps = new Set<number>();
    for (const points of domainTrendData.values()) {
      for (const p of points) {
        timestamps.add(new Date(p.capturedAt).getTime());
      }
    }
    return Array.from(timestamps).sort((a, b) => a - b);
  });

  // Time range for X-axis
  const timeRange = $derived.by(() => {
    if (allTimestamps.length === 0) return { min: 0, max: 1 };
    return {
      min: allTimestamps[0],
      max: allTimestamps[allTimestamps.length - 1],
    };
  });

  // Calculate Y-axis range based on all visible data
  // Snap to 25% increments for clean labels
  const yRange = $derived.by(() => {
    const allValues: number[] = [];

    for (const points of domainTrendData.values()) {
      for (const p of points) {
        const val = getMetricValue(p, selectedMetric);
        if (val !== null) allValues.push(val);
      }
    }

    if (allValues.length === 0) return { min: 0, max: 100 };

    const dataMin = Math.min(...allValues);
    const dataMax = Math.max(...allValues);

    // Snap to 25% increments (down for min, up for max)
    const yMin = Math.max(0, Math.floor(dataMin / 25) * 25);

    // Only Productivity can exceed 100; all other metrics cap at 100
    const canExceed100 = selectedMetric === "productivity";
    const effectiveMax = canExceed100 ? dataMax : Math.min(dataMax, 100);
    const yMax = Math.ceil(effectiveMax / 25) * 25;

    // Ensure the max doesn't exceed 100 for capped metrics
    const clampedMax = canExceed100 ? yMax : Math.min(yMax, 100);

    return { min: yMin, max: Math.max(clampedMax, yMin + 25) }; // Ensure at least 25-point range
  });

  const yMin = $derived(yRange.min);
  const yMax = $derived(yRange.max);

  // Calculate positions
  function getX(timestamp: number): number {
    const range = timeRange.max - timeRange.min;
    if (range === 0) return padding.left + innerWidth / 2;
    return padding.left + ((timestamp - timeRange.min) / range) * innerWidth;
  }

  function getY(value: number | null): number | null {
    if (value === null) return null;
    const clampedValue = Math.max(yMin, Math.min(value, yMax));
    const range = yMax - yMin;
    if (range === 0) return padding.top + innerHeight / 2;
    return (
      padding.top + innerHeight - ((clampedValue - yMin) / range) * innerHeight
    );
  }

  // Generate path for a domain
  function generatePath(points: TrendDataPoint[]): string {
    const validPoints: { x: number; y: number }[] = [];

    for (const point of points) {
      const val = getMetricValue(point, selectedMetric);
      const y = getY(val);
      if (y !== null) {
        validPoints.push({ x: getX(new Date(point.capturedAt).getTime()), y });
      }
    }

    if (validPoints.length === 0) return "";
    if (validPoints.length === 1)
      return `M ${validPoints[0].x} ${validPoints[0].y}`;

    // Simple line path
    let path = `M ${validPoints[0].x} ${validPoints[0].y}`;
    for (let i = 1; i < validPoints.length; i++) {
      path += ` L ${validPoints[i].x} ${validPoints[i].y}`;
    }
    return path;
  }

  // Domains with data and their colors
  const domainLines = $derived.by(() => {
    const lines: { name: string; color: string; path: string }[] = [];
    let index = 0;

    for (const [name, points] of domainTrendData) {
      const path = generatePath(points);
      if (path) {
        lines.push({
          name,
          color: getDomainColor(index),
          path,
        });
      }
      index++;
    }

    return lines;
  });

  // Y-axis ticks - snap to 25% increments
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

  // X-axis labels - only Mondays and 1st of month
  const xLabels = $derived.by(() => {
    if (allTimestamps.length === 0) return [];

    const range = timeRange.max - timeRange.min;
    if (range === 0) return [];

    const startDate = new Date(timeRange.min);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(timeRange.max);
    endDate.setHours(0, 0, 0, 0);

    const labels: { x: number; label: string }[] = [];
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const isMonday = currentDate.getDay() === 1;
      const isFirstOfMonth = currentDate.getDate() === 1;

      if (isMonday || isFirstOfMonth) {
        const noonTimestamp = new Date(currentDate).setHours(12, 0, 0, 0);
        const x =
          padding.left + ((noonTimestamp - timeRange.min) / range) * innerWidth;

        if (x >= padding.left && x <= chartWidth - padding.right) {
          labels.push({
            x,
            label: currentDate.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            }),
          });
        }
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return labels;
  });

  // Hover state
  let hoveredDomain = $state<string | null>(null);
  let mousePosition = $state({ x: 0, y: 0 });

  const hoveredData = $derived.by(() => {
    if (!hoveredDomain) return null;
    const points = domainTrendData.get(hoveredDomain);
    if (!points || points.length === 0) return null;

    // Get latest value
    const latest = points[points.length - 1];
    const val = getMetricValue(latest, selectedMetric);

    return {
      domain: hoveredDomain,
      value: val !== null ? Math.round(val) : null,
      color: getDomainColor(
        Array.from(domainTrendData.keys()).indexOf(hoveredDomain)
      ),
    };
  });

  const TOOLTIP_WIDTH = 140;
  const TOOLTIP_OFFSET = 12;
  const tooltipPosition = $derived.by(() => {
    const shouldFlipLeft =
      mousePosition.x + TOOLTIP_WIDTH + TOOLTIP_OFFSET > containerWidth;
    return {
      x: shouldFlipLeft
        ? mousePosition.x - TOOLTIP_WIDTH - TOOLTIP_OFFSET
        : mousePosition.x + TOOLTIP_OFFSET,
      y: Math.max(10, mousePosition.y - 40),
    };
  });

  function handleMouseMove(event: MouseEvent) {
    if (container) {
      const containerRect = container.getBoundingClientRect();
      mousePosition = {
        x: event.clientX - containerRect.left,
        y: event.clientY - containerRect.top,
      };
    }
  }

  function handleMouseLeave() {
    hoveredDomain = null;
  }

  function handleLineHover(domain: string) {
    hoveredDomain = domain;
  }
</script>

<div class="relative" bind:this={container}>
  <!-- Header with metric selector -->
  <div class="flex items-center justify-between mb-2">
    <span class="text-xs font-medium text-black-400">Domain Trends</span>

    <select
      bind:value={selectedMetric}
      class="text-xs bg-ambient-700 dark:bg-black-800 border border-black-200 dark:border-white/10 rounded px-2 py-1 text-black-700 dark:text-black-300 focus:outline-none focus:ring-1 focus:ring-violet-500/50 cursor-pointer"
    >
      {#each metricOptions as option (option.key)}
        <option value={option.key}>{option.label}</option>
      {/each}
    </select>
  </div>

  <!-- Chart content -->
  {#if loading}
    <div
      class="flex justify-center items-center"
      style="height: {height + 60}px;"
    ></div>
  {:else if error}
    <div
      class="flex justify-center items-center text-sm text-red-400"
      style="height: {height + 60}px;"
    >
      {error}
    </div>
  {:else if domainLines.length > 0}
    <!-- Chart -->
    <svg
      width={chartWidth}
      height={chartHeight}
      viewBox="0 0 {chartWidth} {chartHeight}"
      class="cursor-default"
      role="img"
      aria-label="Domain trends comparison chart"
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
            class="stroke-black-200 dark:stroke-white/5"
            stroke-width="1"
          />
        {/each}
      </g>

      <!-- Y-axis labels -->
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

      <!-- Domain lines -->
      {#each domainLines as line (line.name)}
        <path
          d={line.path}
          fill="none"
          stroke={line.color}
          stroke-width={hoveredDomain === line.name ? 2.5 : 1.5}
          stroke-linecap="round"
          stroke-linejoin="round"
          opacity={hoveredDomain === null || hoveredDomain === line.name
            ? 1
            : 0.3}
          class="transition-opacity duration-150"
          role="img"
          aria-label="Trend line for {line.name}"
          onmouseenter={() => handleLineHover(line.name)}
        />
      {/each}
    </svg>

    <!-- Hover Tooltip -->
    {#if hoveredData}
      <div
        class="absolute z-10 px-3 py-2 text-xs bg-black-900 border border-white/10 rounded-lg shadow-xl pointer-events-none"
        style="left: {tooltipPosition.x}px; top: {tooltipPosition.y}px;"
      >
        <div class="flex items-center gap-2">
          <span
            class="w-2 h-2 rounded-full"
            style="background-color: {hoveredData.color}"
          ></span>
          <span class="text-black-700 dark:text-black-300"
            >{hoveredData.domain}</span
          >
          {#if hoveredData.value !== null}
            <span class="ml-auto font-medium text-black-900 dark:text-white"
              >{hoveredData.value}%</span
            >
          {/if}
        </div>
      </div>
    {/if}

    <!-- Legend (bottom) - show domain names with colors -->
    <div
      class="flex flex-wrap gap-3 justify-center pt-3 mt-2 text-xs border-t border-white/5"
    >
      {#each domainLines as line (line.name)}
        <button
          type="button"
          class="flex gap-1.5 items-center hover:opacity-100 transition-opacity cursor-pointer {hoveredDomain ===
            null || hoveredDomain === line.name
            ? 'opacity-100'
            : 'opacity-40'}"
          onmouseenter={() => handleLineHover(line.name)}
          onmouseleave={handleMouseLeave}
        >
          <div
            class="w-3 h-[2px] rounded-full"
            style="background-color: {line.color}"
          ></div>
          <span class="text-black-400 text-[10px]">{line.name}</span>
        </button>
      {/each}
    </div>
  {:else if domains.length === 0}
    <div
      class="flex justify-center items-center text-sm text-black-500"
      style="height: {height + 60}px;"
    >
      No domains configured
    </div>
  {:else}
    <div
      class="flex justify-center items-center text-sm text-black-500"
      style="height: {height + 60}px;"
    >
      No trend data available
    </div>
  {/if}
</div>

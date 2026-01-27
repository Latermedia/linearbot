<script lang="ts">
  interface Props {
    direction: "up" | "down" | "flat" | "stable";
    percentChange: number;
    period: string;
    higherIsBetter?: boolean;
    /** Whether the data is limited (actual range differs from expected) */
    isLimited?: boolean;
    /** Tooltip text to show on hover (for limited data explanation) */
    tooltip?: string;
  }

  let {
    direction,
    percentChange,
    period,
    higherIsBetter = true,
    isLimited = false,
    tooltip,
  }: Props = $props();

  // Normalize direction (stable and flat are equivalent)
  const normalizedDirection = $derived(
    direction === "stable" ? "flat" : direction
  );

  // Determine if the trend is positive (good) or negative (bad)
  const isPositive = $derived(
    (normalizedDirection === "up" && higherIsBetter) ||
      (normalizedDirection === "down" && !higherIsBetter)
  );

  const isNegative = $derived(
    (normalizedDirection === "down" && higherIsBetter) ||
      (normalizedDirection === "up" && !higherIsBetter)
  );

  // Format the percent change for display
  const displayPercent = $derived(Math.abs(percentChange).toFixed(0));

  // Arrow symbol based on direction
  const arrow = $derived(
    normalizedDirection === "up"
      ? "↑"
      : normalizedDirection === "down"
        ? "↓"
        : "→"
  );
</script>

<span
  class="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium rounded {isPositive
    ? 'bg-success-100 dark:bg-success-900 text-success-700 dark:text-success-400'
    : isNegative
      ? 'bg-danger-100 dark:bg-danger-900 text-danger-700 dark:text-danger-400'
      : 'bg-black-100 dark:bg-black-800 text-black-500 dark:text-black-400'}"
  title={tooltip}
>
  <span>{arrow}</span>
  <span>{displayPercent}%</span>
  <span class="text-black-500 dark:text-black-400"
    >{period}{#if isLimited}*{/if}</span
  >
</span>

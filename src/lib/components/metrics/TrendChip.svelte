<script lang="ts">
  interface Props {
    direction: "up" | "down" | "flat";
    percentChange: number;
    period: string;
    higherIsBetter?: boolean;
  }

  let {
    direction,
    percentChange,
    period,
    higherIsBetter = true,
  }: Props = $props();

  // Determine if the trend is positive (good) or negative (bad)
  const isPositive = $derived(
    (direction === "up" && higherIsBetter) ||
      (direction === "down" && !higherIsBetter)
  );

  const isNegative = $derived(
    (direction === "down" && higherIsBetter) ||
      (direction === "up" && !higherIsBetter)
  );

  // Format the percent change for display
  const displayPercent = $derived(Math.abs(percentChange).toFixed(0));

  // Arrow symbol based on direction
  const arrow = $derived(
    direction === "up" ? "↑" : direction === "down" ? "↓" : "→"
  );
</script>

<span
  class="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium rounded {isPositive
    ? 'bg-emerald-500/10 text-emerald-400'
    : isNegative
      ? 'bg-red-500/10 text-red-400'
      : 'bg-neutral-500/10 text-neutral-400'}"
>
  <span>{arrow}</span>
  <span>{displayPercent}%</span>
  <span class="text-neutral-500">{period}</span>
</span>

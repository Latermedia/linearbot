<script lang="ts">
  import type {
    PillarStatus,
    ProductivityStatus,
  } from "../../../types/metrics-snapshot";

  interface Props {
    title: string;
    value: string | number;
    subtitle?: string;
    status: PillarStatus | ProductivityStatus;
    onClick?: () => void;
    notAvailable?: boolean;
  }

  let {
    title,
    value,
    subtitle,
    status,
    onClick,
    notAvailable = false,
  }: Props = $props();

  function getStatusClasses(status: PillarStatus | ProductivityStatus): {
    bg: string;
    border: string;
    text: string;
    dot: string;
  } {
    switch (status) {
      case "healthy":
        return {
          bg: "bg-emerald-500/5 dark:bg-emerald-500/10",
          border: "border-emerald-500/20",
          text: "text-emerald-600 dark:text-emerald-400",
          dot: "bg-emerald-500",
        };
      case "warning":
        return {
          bg: "bg-amber-500/5 dark:bg-amber-500/10",
          border: "border-amber-500/20",
          text: "text-amber-600 dark:text-amber-400",
          dot: "bg-amber-500",
        };
      case "critical":
        return {
          bg: "bg-red-500/5 dark:bg-red-500/10",
          border: "border-red-500/20",
          text: "text-red-600 dark:text-red-400",
          dot: "bg-red-500",
        };
      case "unknown":
        return {
          bg: "bg-blue-500/5 dark:bg-blue-500/10",
          border: "border-blue-500/20",
          text: "text-blue-600 dark:text-blue-400",
          dot: "bg-blue-500",
        };
      case "pending":
      default:
        return {
          bg: "bg-neutral-500/5 dark:bg-neutral-500/10",
          border: "border-neutral-500/20",
          text: "text-neutral-600 dark:text-neutral-400",
          dot: "bg-neutral-500",
        };
    }
  }

  const classes = $derived(getStatusClasses(status));
</script>

<button
  type="button"
  onclick={onClick}
  class="flex flex-col p-4 rounded-md border transition-all duration-150 text-left min-w-[140px]
    {classes.bg} {classes.border}
    hover:scale-[1.02] hover:shadow-md
    focus:outline-none focus:ring-2 focus:ring-violet-500/50"
>
  <div class="flex items-center gap-2 mb-2">
    <div class="w-2 h-2 rounded-full {classes.dot}"></div>
    <span
      class="text-xs font-medium text-neutral-600 dark:text-neutral-400 uppercase tracking-wider"
    >
      {title}
    </span>
  </div>

  {#if notAvailable}
    <span class="text-lg font-semibold text-neutral-400 dark:text-neutral-500">
      N/A
    </span>
    <span class="text-xs text-neutral-500 dark:text-neutral-500 mt-1">
      Not available
    </span>
  {:else}
    <span class="text-2xl font-semibold {classes.text}">
      {value}
    </span>
    {#if subtitle}
      <span class="text-xs text-neutral-500 dark:text-neutral-500 mt-1">
        {subtitle}
      </span>
    {/if}
  {/if}
</button>

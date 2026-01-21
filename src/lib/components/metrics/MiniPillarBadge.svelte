<script lang="ts">
  import type {
    PillarStatus,
    ProductivityStatus,
  } from "../../../types/metrics-snapshot";

  interface Props {
    title: string;
    status: PillarStatus | ProductivityStatus;
    value: string | number;
    underConstruction?: boolean;
  }

  let { title, status, value, underConstruction = false }: Props = $props();

  // Get status color for the dot
  function getStatusDotClass(
    status: PillarStatus | ProductivityStatus
  ): string {
    switch (status) {
      case "healthy":
        return "bg-emerald-500";
      case "warning":
        return "bg-amber-500";
      case "critical":
        return "bg-red-500";
      case "unknown":
        return "bg-blue-500";
      case "pending":
      default:
        return "bg-neutral-500";
    }
  }

  // Get status text color
  function getStatusTextClass(
    status: PillarStatus | ProductivityStatus
  ): string {
    switch (status) {
      case "healthy":
        return "text-emerald-400";
      case "warning":
        return "text-amber-400";
      case "critical":
        return "text-red-400";
      case "unknown":
        return "text-blue-400";
      case "pending":
      default:
        return "text-neutral-400";
    }
  }

  const dotClass = $derived(getStatusDotClass(status));
  const textClass = $derived(getStatusTextClass(status));
</script>

<div
  class="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs {underConstruction
    ? 'opacity-50'
    : ''}"
>
  <div
    class="w-1.5 h-1.5 rounded-full {underConstruction
      ? 'bg-neutral-500'
      : dotClass}"
  ></div>
  <span class="text-neutral-400 font-medium">{title}:</span>
  {#if underConstruction}
    <span class="text-neutral-500 italic">TBD</span>
  {:else}
    <span class="font-semibold {textClass}">{value}</span>
  {/if}
</div>

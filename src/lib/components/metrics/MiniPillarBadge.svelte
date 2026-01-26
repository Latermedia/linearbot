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

  // Get status text color
  function getStatusTextClass(
    status: PillarStatus | ProductivityStatus
  ): string {
    switch (status) {
      case "peakFlow":
        return "text-success-400";
      case "strongRhythm":
        return "text-success-500";
      case "steadyProgress":
        return "text-warning-500";
      case "earlyTraction":
        return "text-danger-500";
      case "lowTraction":
        return "text-danger-600";
      case "unknown":
        return "text-blue-400";
      case "pending":
      default:
        return "text-neutral-400";
    }
  }

  const textClass = $derived(getStatusTextClass(status));
</script>

<div
  class="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs {underConstruction
    ? 'opacity-50'
    : ''}"
>
  <span class="text-neutral-400 font-medium">{title}:</span>
  {#if underConstruction}
    <span class="text-neutral-500 italic">TBD</span>
  {:else}
    <span class="font-semibold {textClass}">{value}</span>
  {/if}
</div>

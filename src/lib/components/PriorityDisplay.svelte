<script lang="ts">
  import {
    Minus,
    CircleAlert,
    SignalHigh,
    SignalMedium,
    SignalLow,
  } from "lucide-svelte";

  let { priority }: { priority: number } = $props();

  const config = $derived.by(() => {
    switch (priority) {
      case 0:
        return {
          icon: Minus,
          label: "No priority",
          color: "text-neutral-300",
        };
      case 1:
        return {
          icon: CircleAlert,
          label: "Urgent",
          color: "text-neutral-300",
        };
      case 2:
        return {
          icon: SignalHigh,
          label: "High",
          color: "text-neutral-300",
        };
      case 3:
        return {
          icon: SignalMedium,
          label: "Medium",
          color: "text-neutral-300",
        };
      case 4:
        return {
          icon: SignalLow,
          label: "Low",
          color: "text-neutral-300",
        };
      default:
        return {
          icon: Minus,
          label: "No priority",
          color: "text-neutral-300",
        };
    }
  });

  const Icon = $derived(config.icon);
</script>

<div class="flex justify-end items-center" title={config.label}>
  <Icon class={config.color + " shrink-0"} size={14} />
</div>

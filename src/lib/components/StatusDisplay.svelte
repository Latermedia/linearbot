<script lang="ts">
  import { CircleCheck, Circle, CircleX } from "lucide-svelte";

  interface StatusDisplayProps {
    stateName: string;
    stateType: string;
    showWarnings?: boolean;
    warnings?: Array<{ type: string; message: string }>;
  }

  let {
    stateName,
    stateType,
    showWarnings = false,
    warnings = [],
  }: StatusDisplayProps = $props();

  type StatusConfig = {
    iconType: "started" | "completed" | "canceled" | "default";
    color: string;
    bgColor: string;
  };

  const config: StatusConfig = $derived.by(() => {
    const name = stateName?.toLowerCase() || "";
    const type = stateType?.toLowerCase() || "";

    if (
      name.includes("done") ||
      name.includes("completed") ||
      type === "completed"
    ) {
      return {
        iconType: "completed" as const,
        color: "text-green-400",
        bgColor: "bg-green-400/10",
      };
    }
    if (
      type === "started" ||
      name.includes("progress") ||
      name.includes("started")
    ) {
      return {
        iconType: "started" as const,
        color: "text-violet-400",
        bgColor: "bg-violet-400/10",
      };
    }
    if (name.includes("cancel") || type === "canceled") {
      return {
        iconType: "canceled" as const,
        color: "text-neutral-500",
        bgColor: "bg-neutral-500/10",
      };
    }
    // Default/unstarted
    return {
      iconType: "default" as const,
      color: "text-neutral-400",
      bgColor: "bg-neutral-400/10",
    };
  });
</script>

<div class="flex gap-1.5 items-center">
  <div class="flex gap-1 items-center" title={stateName}>
    {#if config.iconType === "started"}
      <!-- Partial pie chart icon for in-progress -->
      <svg
        class="text-violet-400 shrink-0"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <path
          d="M12 2 A10 10 0 0 1 20.66 17 L12 12 Z"
          fill="currentColor"
          stroke="none"
        />
      </svg>
    {:else if config.iconType === "completed"}
      <CircleCheck class={config.color + " shrink-0"} size={14} />
    {:else if config.iconType === "canceled"}
      <CircleX class={config.color + " shrink-0"} size={14} />
    {:else}
      <Circle class={config.color + " shrink-0"} size={14} />
    {/if}
    <span class="text-neutral-300 text-xs truncate max-w-[100px]">
      {stateName}
    </span>
  </div>
  {#if showWarnings && warnings.length > 0}
    {@const statusMismatchWarning = warnings.find(
      (w) => w.type === "status-mismatch"
    )}
    {#if statusMismatchWarning}
      <div class="flex gap-0.5 items-center">
        <span
          class="text-amber-400 shrink-0"
          title={statusMismatchWarning.message}>⚠️</span
        >
      </div>
    {/if}
  {/if}
</div>

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

  const config = $derived.by(() => {
    const name = stateName?.toLowerCase() || "";
    const type = stateType?.toLowerCase() || "";

    if (
      name.includes("done") ||
      name.includes("completed") ||
      type === "completed"
    ) {
      return {
        icon: CircleCheck,
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
        icon: Circle,
        color: "text-blue-400",
        bgColor: "bg-blue-400/10",
      };
    }
    if (name.includes("cancel") || type === "canceled") {
      return {
        icon: CircleX,
        color: "text-neutral-500",
        bgColor: "bg-neutral-500/10",
      };
    }
    // Default/unstarted
    return {
      icon: Circle,
      color: "text-neutral-400",
      bgColor: "bg-neutral-400/10",
    };
  });

  const Icon = $derived(config.icon);
</script>

<div class="flex gap-1.5 items-center">
  <div class="flex gap-1 items-center" title={stateName}>
    <Icon class={config.color + " shrink-0"} size={14} />
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

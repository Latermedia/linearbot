<script lang="ts">
  import { cn } from "$lib/utils.js";
  import type { HTMLAttributes } from "svelte/elements";

  let {
    ref = $bindable(null),
    orientation = "horizontal",
    class: className,
    ...restProps
  }: {
    ref?: HTMLDivElement | null;
    orientation?: "horizontal" | "vertical";
    class?: string;
  } & HTMLAttributes<HTMLDivElement> = $props();
</script>

<div
  bind:this={ref}
  role="separator"
  aria-orientation={orientation}
  data-orientation={orientation}
  class={cn(
    "bg-white/5 shrink-0",
    orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
    className
  )}
  {...restProps}
></div>

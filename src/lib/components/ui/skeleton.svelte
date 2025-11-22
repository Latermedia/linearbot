<script lang="ts">
  import { cn, type WithElementRef } from "$lib/utils.js";
  import type { HTMLAttributes } from "svelte/elements";

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<div
  bind:this={ref}
  data-slot="skeleton"
  class={cn(
    "bg-neutral-200 dark:bg-neutral-800 animate-pulse rounded-md",
    className
  )}
  {...restProps}
></div>

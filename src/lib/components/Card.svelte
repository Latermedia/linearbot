<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "$lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<div
  bind:this={ref}
  class={cn(
    "bg-ambient-600 dark:bg-black-900 text-black-900 dark:text-white flex flex-col border border-border rounded-md px-4 py-3 transition-colors duration-150",
    className
  )}
  {...restProps}
>
  {@render children?.()}
</div>

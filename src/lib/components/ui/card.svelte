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
    "bg-neutral-900 text-white flex flex-col border border-white/10 rounded-md p-4 transition-colors duration-150",
    className
  )}
  {...restProps}
>
  {@render children?.()}
</div>

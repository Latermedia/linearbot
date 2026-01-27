<script lang="ts">
  import { setToggleGroupCtx } from "./ToggleGroup.svelte";
  import { cn } from "$lib/utils";
  import { tick } from "svelte";
  import { tweened } from "svelte/motion";
  import { cubicOut } from "svelte/easing";

  type Variant = "default" | "outline";
  type Size = "default" | "sm" | "lg";
  type Type = "single" | "multiple";

  let {
    value = $bindable(),
    variant = "default",
    size = "default",
    type = "single",
    class: className,
    children,
    ...restProps
  }: {
    value?: string | string[];
    variant?: Variant;
    size?: Size;
    type?: Type;
    class?: string;
    children?: import("svelte").Snippet;
    [key: string]: any;
  } = $props();

  let containerRef: HTMLDivElement | null = $state(null);
  let isInitialLoad = $state(true);

  // Use Svelte tweened stores for smooth animation
  const indicatorLeft = tweened(0, { duration: 200, easing: cubicOut });
  const indicatorWidth = tweened(0, { duration: 200, easing: cubicOut });
  const indicatorOpacity = tweened(0, { duration: 150, easing: cubicOut });

  function isSelected(itemValue: string): boolean {
    if (type === "multiple") {
      return Array.isArray(value) && value.includes(itemValue);
    }
    return value === itemValue;
  }

  function handleClick(itemValue: string) {
    if (type === "multiple") {
      const current = Array.isArray(value) ? value : [];
      if (current.includes(itemValue)) {
        value = current.filter((v) => v !== itemValue);
      } else {
        value = [...current, itemValue];
      }
    } else {
      value = itemValue;
    }
  }

  async function updateIndicator() {
    if (!containerRef || type !== "single" || variant !== "outline") {
      indicatorOpacity.set(0);
      return;
    }

    await tick();

    const selectedButton = containerRef.querySelector(
      '[data-selected="true"]'
    ) as HTMLElement;

    if (!selectedButton) {
      indicatorOpacity.set(0);
      return;
    }

    // Use offsetLeft/offsetWidth instead of getBoundingClientRect
    // These are not affected by CSS transforms (like modal scale animations)
    const newLeft = selectedButton.offsetLeft;
    const newWidth = selectedButton.offsetWidth;

    // Animate all properties simultaneously (skip animation on initial load)
    if (isInitialLoad) {
      indicatorLeft.set(newLeft, { duration: 0 });
      indicatorWidth.set(newWidth, { duration: 0 });
      indicatorOpacity.set(1, { duration: 0 });
      isInitialLoad = false;
    } else {
      indicatorLeft.set(newLeft);
      indicatorWidth.set(newWidth);
      indicatorOpacity.set(1);
    }
  }

  $effect(() => {
    value;
    updateIndicator();
  });

  setToggleGroupCtx({
    variant,
    size,
    type,
    value,
    isSelected,
    handleClick,
  });
</script>

<div
  bind:this={containerRef}
  class={cn(
    "group/toggle-group relative flex w-fit items-center",
    variant === "outline" &&
      "bg-ambient-700 dark:bg-white/5 rounded-md p-1 gap-1",
    className
  )}
  role="group"
  {...restProps}
>
  {#if variant === "outline" && type === "single"}
    <!-- Sliding indicator with Svelte tweened animation -->
    <div
      class="absolute rounded-md bg-ambient-300 dark:bg-white/10 pointer-events-none z-0"
      style="top: 0.25rem; bottom: 0.25rem; left: {$indicatorLeft}px; width: {$indicatorWidth}px; opacity: {$indicatorOpacity};"
      aria-hidden="true"
    ></div>
  {/if}
  {@render children?.()}
</div>

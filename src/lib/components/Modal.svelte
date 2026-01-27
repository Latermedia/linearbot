<script lang="ts">
  import { onMount } from "svelte";
  import { scale, fade } from "svelte/transition";
  import { quintOut } from "svelte/easing";
  import { X } from "lucide-svelte";
  import type { Snippet } from "svelte";
  import { portal } from "$lib/utils/portal";

  let {
    title,
    onclose,
    size = "md",
    maxHeight,
    scrollable = false,
    topAligned = false,
    header,
    children,
    background = "bg-white dark:bg-black-900",
  }: {
    title?: string;
    onclose: () => void;
    size?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "full";
    maxHeight?: string;
    scrollable?: boolean;
    topAligned?: boolean;
    header?: Snippet;
    children?: Snippet;
    background?: string;
  } = $props();

  const sizeClasses = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
    "2xl": "max-w-4xl lg:max-w-6xl xl:max-w-7xl",
    "3xl": "max-w-5xl lg:max-w-7xl xl:max-w-[90vw]",
    full: "max-w-[95vw]",
  };

  const hasCustomHeader = $derived(header !== undefined);
  const hasTitle = $derived(title !== undefined);

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      onclose();
    }
  }

  function handleBackdropClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (target.classList.contains("modal-backdrop")) {
      onclose();
    }
  }

  function handleBackdropKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const target = event.target as HTMLElement;
      if (target.classList.contains("modal-backdrop")) {
        onclose();
      }
    }
  }

  onMount(() => {
    document.addEventListener("keydown", handleKeydown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeydown);
      document.body.style.overflow = "";
    };
  });
</script>

<div
  use:portal={document.body}
  class="flex fixed inset-0 z-9999 justify-center modal-backdrop bg-black/70 {topAligned
    ? 'items-start pt-8 overflow-y-auto'
    : 'items-center'}"
  style="position: fixed; top: 0; left: 0; right: 0; bottom: 0;"
  onclick={handleBackdropClick}
  onkeydown={handleBackdropKeydown}
  role="dialog"
  aria-modal="true"
  aria-labelledby="modal-title"
  tabindex="-1"
  in:fade={{ duration: 400, easing: quintOut }}
  out:fade={{ duration: 800, easing: quintOut }}
>
  <div
    class="w-full {sizeClasses[
      size
    ]} rounded-md border shadow-2xl {background} border-black-200 dark:border-white/10 shadow-black/20 dark:shadow-black/50 m-4 {topAligned
      ? 'mb-8'
      : ''} {scrollable ? 'flex flex-col' : ''}"
    style={maxHeight ? `max-height: ${maxHeight}` : ""}
    role="document"
    in:scale={{ duration: 400, opacity: 0, start: 3, easing: quintOut }}
    out:scale={{ duration: 800, opacity: 0, start: 2, easing: quintOut }}
  >
    {#if hasCustomHeader && header}
      <!-- Custom Header -->
      <div class="shrink-0">
        {@render header()}
      </div>
      <!-- Scrollable Content -->
      {#if scrollable}
        <div class="overflow-y-auto flex-1">
          <div class="p-6 pt-6">
            {#if children}
              {@render children()}
            {/if}
          </div>
        </div>
      {:else}
        <div class="p-6 pt-6">
          {#if children}
            {@render children()}
          {/if}
        </div>
      {/if}
    {:else}
      <!-- Default Header -->
      <div
        class="{scrollable ? 'flex flex-col overflow-hidden h-full' : ''} p-5"
      >
        {#if hasTitle}
          <div class="flex justify-between items-center mb-5 shrink-0">
            <h2
              id="modal-title"
              class="text-sm font-medium text-black-900 dark:text-white"
            >
              {title}
            </h2>
            <button
              class="inline-flex justify-center items-center p-1.5 rounded transition-colors duration-150 cursor-pointer text-black-500 hover:text-black-900 dark:hover:text-white hover:bg-black-100 dark:hover:bg-white/10"
              onclick={onclose}
              aria-label="Close modal"
            >
              <X class="w-4 h-4" />
            </button>
          </div>
        {/if}

        <!-- Content -->
        <div class="{scrollable ? 'overflow-y-auto flex-1' : ''} space-y-5">
          {#if children}
            {@render children()}
          {/if}
        </div>
      </div>
    {/if}
  </div>
</div>

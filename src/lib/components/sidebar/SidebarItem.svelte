<script lang="ts">
  import { page } from "$app/stores";
  import { sidebarCollapsed } from "$lib/stores/sidebar";
  import { pageLoading } from "$lib/stores/page-loading";
  import type { Component, ComponentType } from "svelte";

  interface Props {
    href: string;
    icon: ComponentType<any> | Component<any>;
    label: string;
    exactMatch?: boolean;
    indent?: boolean;
  }

  let {
    href,
    icon: Icon,
    label,
    exactMatch = true,
    indent = false,
  }: Props = $props();

  const isActive = $derived(
    exactMatch
      ? $page.url.pathname === href
      : $page.url.pathname.startsWith(href)
  );
  const isCollapsed = $derived($sidebarCollapsed);

  // Check if this specific route is loading
  const isLoading = $derived(
    $pageLoading.loading && $pageLoading.path === href
  );

  // Track when loading just finished for blur-out animation
  let wasLoading = $state(false);
  let showBlurOut = $state(false);

  $effect(() => {
    if (isLoading && !wasLoading) {
      wasLoading = true;
      showBlurOut = false;
    } else if (!isLoading && wasLoading) {
      // Loading just finished - trigger blur out
      showBlurOut = true;
      wasLoading = false;
      // Clear the blur-out state after animation
      setTimeout(() => {
        showBlurOut = false;
      }, 200);
    }
  });

  // Animation delays for the 3x3 grid loader
  const delays = [0.0, 0.15, 0.3, 0.15, 0.3, 0.45, 0.3, 0.45, 0.6];
</script>

<a
  {href}
  data-active={isActive}
  class="group relative z-10 flex items-center py-2 text-sm font-medium rounded no-color-transition
    {isActive
    ? 'text-black-900 dark:text-white'
    : 'text-black-600 dark:text-black-400 hover:text-black-900 dark:hover:text-white'}"
  title={isCollapsed ? label : undefined}
>
  <!-- Hover indicator (matches active indicator styling but less visible) -->
  {#if !isActive}
    <div
      class="absolute inset-y-0 left-2 right-2 rounded-md bg-ambient-700 dark:bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-150 -z-10"
      aria-hidden="true"
    ></div>
  {/if}

  <div
    class="w-16 flex justify-center shrink-0 relative"
    style="padding-left: {indent && !isCollapsed
      ? '16px'
      : '0'}; transition: padding-left 250ms cubic-bezier(0.25, 1, 0.5, 1)"
  >
    {#if isLoading}
      <!-- Loading animation (3x3 grid) - matches active icon color, consistent size -->
      <div class="loader-container grid grid-cols-3 w-4 h-4 gap-0.5">
        {#each Array(9) as _, i}
          <div
            class="loader-block w-full h-full rounded-[1px] bg-black-900 dark:bg-white"
            style="animation-delay: {delays[i]}s;"
          ></div>
        {/each}
      </div>
    {:else}
      <!-- Regular icon with optional blur-out from loading -->
      <div class={showBlurOut ? "icon-blur-in" : ""}>
        <Icon class={indent ? "w-4 h-4" : "w-5 h-5"} />
      </div>
    {/if}
  </div>
  <div
    class="sidebar-text overflow-hidden text-left"
    style="width: {isCollapsed ? '0' : '176px'}; opacity: {isCollapsed
      ? 0
      : 1}; filter: blur({isCollapsed ? '8px' : '0'})"
  >
    <span class="truncate whitespace-nowrap">{label}</span>
  </div>

  <!-- Tooltip when collapsed -->
  {#if isCollapsed}
    <div
      class="absolute left-full ml-2 px-2 py-1 text-xs font-medium text-white bg-black-800 rounded shadow-lg
        opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 whitespace-nowrap z-50"
    >
      {label}
    </div>
  {/if}
</a>

<style>
  /* Explicitly set instant color transition to prevent lag */
  .no-color-transition {
    transition: color 0s !important;
  }

  /* Sidebar text blur poof transition */
  .sidebar-text {
    transition:
      width 250ms cubic-bezier(0.25, 1, 0.5, 1),
      opacity 250ms cubic-bezier(0.25, 1, 0.5, 1),
      filter 250ms cubic-bezier(0.25, 1, 0.5, 1);
  }

  /* Fade in the loader container */
  @keyframes loader-fade-in {
    0% {
      opacity: 0;
    }
    100% {
      opacity: 1;
    }
  }

  .loader-container {
    animation: loader-fade-in 0.15s ease-out forwards;
  }

  /* Loading animation for 3x3 grid - starts at peak, pulses down */
  @keyframes loader-pulse {
    0% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.25;
      transform: scale(0.85);
    }
    100% {
      opacity: 1;
      transform: scale(1);
    }
  }

  .loader-block {
    animation: loader-pulse 1.2s ease-in-out infinite;
  }

  /* Blur-in animation when loading completes */
  @keyframes blur-in {
    0% {
      opacity: 0;
      filter: blur(8px);
      transform: scale(1.2);
    }
    100% {
      opacity: 1;
      filter: blur(0);
      transform: scale(1);
    }
  }

  .icon-blur-in {
    animation: blur-in 0.2s cubic-bezier(0.25, 1, 0.5, 1) forwards;
  }
</style>

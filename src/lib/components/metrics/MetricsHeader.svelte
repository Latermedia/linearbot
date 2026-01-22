<script lang="ts">
  import { browser } from "$app/environment";

  // Engineering principles - rotates every 5 seconds
  const principles = [
    "Principles over process",
    "Don't Make Me Think",
    "WIP Constraints",
    "Work in public",
    "Async First",
    "Doings > Meetings",
    "Velocity > Predictability",
    "Single Source of Truth",
    "Iterate to innovate",
    "Clear, concise, complete",
    "Ship value daily",
    "POC is worth 1k meetings",
    "Go slow to go fast",
    "Mind the gaps",
  ];

  interface Props {
    title?: string;
    showTrends?: boolean;
    onToggleTrends?: () => void;
  }

  let {
    title = "Engineering Metrics",
    showTrends = false,
    onToggleTrends,
  }: Props = $props();

  // Rotating principle state
  let principleIndex = $state(Math.floor(Math.random() * principles.length));
  let isAnimating = $state(false);
  const currentPrinciple = $derived(principles[principleIndex]);

  // Rotate principles every 5 seconds with blur poof animation
  $effect(() => {
    if (!browser) return;

    const interval = setInterval(() => {
      isAnimating = true;
      setTimeout(() => {
        principleIndex = (principleIndex + 1) % principles.length;
        isAnimating = false;
      }, 400); // Swap text at peak of blur
    }, 5000);

    return () => clearInterval(interval);
  });
</script>

<div class="relative">
  <div class="flex justify-between items-center">
    <h1 class="text-2xl font-semibold tracking-tight text-white">
      {title}
    </h1>
    {#if onToggleTrends}
      <div class="flex gap-2 items-center">
        <span class="text-xs text-neutral-400">Trends</span>
        <button
          type="button"
          role="switch"
          aria-checked={showTrends}
          onclick={onToggleTrends}
          class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20 {showTrends
            ? 'bg-violet-600'
            : 'bg-neutral-700'}"
        >
          <span class="sr-only">Show trends</span>
          <span
            class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out {showTrends
              ? 'translate-x-4'
              : 'translate-x-0.5'}"
          ></span>
        </button>
      </div>
    {/if}
  </div>
  <div class="relative mt-1 h-6">
    <p
      class="absolute left-0 right-0 top-0 z-50 text-sm text-neutral-400 italic pointer-events-none principle-text {isAnimating
        ? 'principle-exit'
        : 'principle-enter'}"
    >
      {currentPrinciple}
    </p>
  </div>
</div>

<style>
  /* Blur poof animation for rotating principles */
  .principle-text {
    transition:
      opacity 400ms cubic-bezier(0.76, 0, 0.24, 1),
      filter 400ms cubic-bezier(0.76, 0, 0.24, 1),
      transform 400ms cubic-bezier(0.76, 0, 0.24, 1);
  }

  .principle-enter {
    opacity: 1;
    filter: blur(0px);
    transform: scale(1);
  }

  .principle-exit {
    opacity: 0;
    filter: blur(12px);
    transform: scale(1.08);
  }
</style>

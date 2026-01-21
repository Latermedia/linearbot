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
    showHistoryIndicator?: boolean;
    historyTimestamp?: string | null;
  }

  let {
    title = "Engineering Metrics",
    showHistoryIndicator = false,
    historyTimestamp = null,
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
  <div class="flex items-center justify-between">
    <h1 class="text-2xl font-semibold tracking-tight text-white">
      {title}
    </h1>
    {#if showHistoryIndicator && historyTimestamp}
      <div
        class="px-3 py-1.5 text-sm rounded-md border bg-violet-500/10 border-violet-500/30 text-violet-300"
      >
        Viewing <span class="font-medium">{historyTimestamp}</span>
      </div>
    {/if}
  </div>
  <div class="overflow-hidden relative pr-4 pl-4 mt-1 -mr-4 -ml-4 h-6">
    <p
      class="absolute left-4 right-4 top-0 text-sm text-neutral-400 italic principle-text {isAnimating
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

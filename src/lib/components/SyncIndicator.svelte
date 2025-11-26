<script lang="ts">
  import { browser } from "$app/environment";
  import { onMount, onDestroy } from "svelte";
  import { tweened } from "svelte/motion";
  import { cubicOut } from "svelte/easing";

  let syncStatus = $state<"idle" | "syncing" | "error">("idle");
  let isRunning = $state(false);
  let progressPercent = $state<number | null>(null);
  let pollIntervalId: number | undefined;

  // Animated progress value for smooth transitions
  const animatedProgress = tweened(0, { duration: 300, easing: cubicOut });

  async function checkSyncStatus() {
    if (!browser) return;

    try {
      const response = await fetch("/api/sync/status");
      if (response.ok) {
        const data = await response.json();
        syncStatus = data.status || "idle";
        isRunning = data.isRunning || false;
        const newProgress = data.progressPercent ?? 0;
        if (newProgress !== progressPercent) {
          progressPercent = newProgress;
          animatedProgress.set(newProgress);
        }
      }
    } catch (error) {
      console.debug("Sync status poll error:", error);
    }
  }

  onMount(() => {
    if (!browser) return;

    // Initial check
    checkSyncStatus();

    // Poll every 2 seconds
    pollIntervalId = setInterval(checkSyncStatus, 2000) as unknown as number;
  });

  onDestroy(() => {
    if (pollIntervalId) {
      clearInterval(pollIntervalId);
    }
  });

  const isSyncing = $derived(syncStatus === "syncing" || isRunning);
  const displayProgress = $derived($animatedProgress);

  // Animation delays for each block in the 3x3 grid
  // Creates a sequential wave effect similar to Linear's sync indicator
  // Blocks light up in a pattern: top-left → top-right → middle → bottom
  const delays = [0.0, 0.15, 0.3, 0.15, 0.3, 0.45, 0.3, 0.45, 0.6];
</script>

{#if isSyncing}
  <div
    class="flex relative items-center text-sm text-neutral-600 dark:text-neutral-400"
  >
    <!-- Container with progress bar background -->
    <div
      class="relative px-3 py-1.5 overflow-clip rounded-md sync-container bg-neutral-100 dark:bg-white/5"
    >
      <!-- Progress bar fill -->
      <div
        class="absolute inset-0 rounded-l-md transition-all duration-300 ease-out bg-gray-500/15 dark:bg-gray-500/25"
        style="width: {displayProgress}%;"
      ></div>

      <!-- Content overlay -->
      <div class="flex relative gap-2 items-center">
        <!-- 3x3 grid animation (Linear-style) -->
        <div class="grid grid-cols-3 gap-0.5 w-4 h-4">
          {#each Array(9) as _, i}
            <div
              class="sync-block w-full h-full rounded-[1px] bg-current"
              style="animation-delay: {delays[i]}s;"
            ></div>
          {/each}
        </div>
        <span class="text-xs font-medium whitespace-nowrap"> Syncing... </span>
      </div>
    </div>
  </div>
{/if}

<style>
  @keyframes sync-pulse {
    0% {
      opacity: 0.2;
      transform: scale(0.9);
    }
    50% {
      opacity: 1;
      transform: scale(1);
    }
    100% {
      opacity: 0.2;
      transform: scale(0.9);
    }
  }

  .sync-block {
    animation: sync-pulse 1.2s ease-in-out infinite;
  }

  .sync-container {
    box-shadow:
      inset 0 1px 2px 0 rgb(0 0 0 / 0.05),
      inset 0 0 0 1px rgb(0 0 0 / 0.05);
  }

  .dark .sync-container {
    box-shadow:
      inset 0 1px 2px 0 rgb(0 0 0 / 0.2),
      inset 0 0 0 1px rgb(255 255 255 / 0.05);
  }
</style>

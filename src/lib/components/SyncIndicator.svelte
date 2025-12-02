<script lang="ts">
  import { browser } from "$app/environment";
  import { onMount, onDestroy } from "svelte";
  import { tweened } from "svelte/motion";
  import { cubicOut } from "svelte/easing";
  import SyncModal from "./SyncModal.svelte";

  let {
    projectId,
  }: {
    projectId?: string;
  } = $props();

  let showSyncModal = $state(false);

  let syncStatus = $state<"idle" | "syncing" | "error">("idle");
  let isRunning = $state(false);
  let progressPercent = $state<number | null>(null);
  let error = $state<string | null>(null);
  let hasPartialSync = $state(false);
  let partialSyncProgress = $state<{ completed: number; total: number } | null>(
    null
  );
  let syncingProjectId = $state<string | null>(null);
  let pollIntervalId: number | undefined;

  // Keyboard shortcut: Cmd+Shift+S (Mac) or Ctrl+Shift+S (Windows/Linux)
  $effect(() => {
    if (!browser) return;

    function handleKeydown(event: KeyboardEvent) {
      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const keyLower = event.key.toLowerCase();

      // Check for shortcut: Cmd+Shift+S (Mac) or Ctrl+Shift+S (Windows/Linux)
      const modifierPressed = isMac
        ? event.metaKey && event.shiftKey && !event.altKey && !event.ctrlKey
        : event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey;

      if (modifierPressed && keyLower === "s") {
        event.preventDefault();
        event.stopPropagation();
        if (!isSyncing) {
          showSyncModal = true;
        }
        return false;
      }
    }

    document.addEventListener("keydown", handleKeydown, {
      capture: true,
      passive: false,
    });

    return () => {
      document.removeEventListener("keydown", handleKeydown, {
        capture: true,
      });
    };
  });

  // Animated progress value for smooth transitions
  const animatedProgress = tweened(0, { duration: 300, easing: cubicOut });

  async function checkSyncStatus() {
    if (!browser) return;

    try {
      const response = await fetch("/api/sync/status");
      if (response.ok) {
        const data = await response.json();
        syncingProjectId = data.syncingProjectId || null;

        // If this is a project-specific indicator, only show if syncing this project or full sync
        // If no projectId prop, show for any sync
        const shouldShow = projectId
          ? syncingProjectId === projectId || syncingProjectId === null
          : true;

        if (!shouldShow) {
          syncStatus = "idle";
          isRunning = false;
          return;
        }

        syncStatus = data.status || "idle";
        isRunning = data.isRunning || false;
        error = data.error || null;
        hasPartialSync = data.hasPartialSync || false;
        partialSyncProgress = data.partialSyncProgress || null;
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
  // Only show error if there's an actual error status, not just partial sync state
  // Partial sync state is saved during normal operation for resumability
  const hasError = $derived(syncStatus === "error");
  const displayProgress = $derived($animatedProgress);

  // Build tooltip text
  const tooltipText = $derived(() => {
    const syncType = syncingProjectId
      ? `project (${syncingProjectId})`
      : "all projects";
    if (hasPartialSync && partialSyncProgress) {
      return `Partial sync: ${partialSyncProgress.completed} of ${partialSyncProgress.total} projects completed. ${error || "Will resume on next sync."}`;
    }
    if (error) {
      return `Sync error (${syncType}): ${error}`;
    }
    if (isSyncing) {
      return `Syncing ${syncType}...`;
    }
    return null;
  });

  // Animation delays for each block in the 3x3 grid
  // Creates a sequential wave effect similar to Linear's sync indicator
  // Blocks light up in a pattern: top-left → top-right → middle → bottom
  const delays = [0.0, 0.15, 0.3, 0.15, 0.3, 0.45, 0.3, 0.45, 0.6];
</script>

<!-- Always show sync indicator, but with different styles based on state -->
<div
  class="flex relative items-center text-sm text-neutral-600 dark:text-neutral-400 m-0"
>
  <!-- Container with progress bar background -->
  <div
    class="relative px-3 py-1.5 overflow-clip rounded-md sync-container bg-neutral-100 dark:bg-white/5 {hasError
      ? 'border border-red-500/50'
      : isSyncing
        ? ''
        : 'cursor-pointer hover:bg-neutral-200 dark:hover:bg-white/10'} transition-colors"
    title={tooltipText() || (isSyncing ? undefined : "Click to sync (Cmd+Shift+S)")}
    onclick={() => {
      if (!isSyncing) {
        showSyncModal = true;
      }
    }}
    role={isSyncing ? undefined : "button"}
    tabindex={isSyncing ? undefined : 0}
    onkeydown={(e) => {
      if (!isSyncing && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        showSyncModal = true;
      }
    }}
  >
    <!-- Progress bar fill (only show when syncing or error) -->
    {#if isSyncing || hasError}
      <div
        class="absolute inset-0 rounded-l-md transition-all duration-300 ease-out {hasError
          ? 'bg-red-500/20 dark:bg-red-500/30'
          : 'bg-gray-500/15 dark:bg-gray-500/25'}"
        style="width: {displayProgress}%;"
      ></div>
    {/if}

    <!-- Content overlay -->
    <div class="flex relative gap-2 items-center">
      {#if isSyncing || hasError}
        <!-- 3x3 grid animation (Linear-style) -->
        <div class="grid grid-cols-3 gap-0.5 w-4 h-4">
          {#each Array(9) as _, i}
            <div
              class="sync-block w-full h-full rounded-[1px] {hasError
                ? 'bg-red-500'
                : 'bg-current'}"
              style="animation-delay: {delays[i]}s;"
            ></div>
          {/each}
        </div>
        <span
          class="text-xs font-medium whitespace-nowrap {hasError
            ? 'text-red-600 dark:text-red-400'
            : ''}"
        >
          {hasError
            ? hasPartialSync
              ? "Partial sync"
              : "Sync error"
            : "Syncing..."}
        </span>
      {:else}
        <!-- Idle state: show sync button -->
        <svg
          class="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          ></path>
        </svg>
        <span class="text-xs font-medium whitespace-nowrap">Sync</span>
      {/if}
    </div>
  </div>
</div>

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
</style>

{#if showSyncModal}
  <SyncModal onclose={() => (showSyncModal = false)} />
{/if}

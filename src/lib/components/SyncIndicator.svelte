<script lang="ts">
  import { browser } from "$app/environment";
  import { onMount, onDestroy } from "svelte";
  import { tweened } from "svelte/motion";
  import { cubicOut } from "svelte/easing";
  import SyncModal from "./SyncModal.svelte";
  import { isAuthenticated } from "$lib/stores/auth";
  import { syncStatusStore } from "$lib/stores/sync-status";
  import { sidebarCollapsed } from "$lib/stores/sidebar";

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

  const isCollapsed = $derived($sidebarCollapsed);

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
        if ($isAuthenticated && !isSyncing) {
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

  // Centralize polling in `syncStatusStore` to avoid duplicate `/api/sync/status` requests.
  $effect(() => {
    if (!browser) return;
    if (!$isAuthenticated) return;

    const data = $syncStatusStore;
    syncingProjectId = data.syncingProjectId || null;

    const shouldShow = projectId
      ? syncingProjectId === projectId || syncingProjectId === null
      : true;

    if (!shouldShow) {
      syncStatus = "idle";
      isRunning = false;
      error = null;
      hasPartialSync = false;
      partialSyncProgress = null;
      progressPercent = null;
      animatedProgress.set(0);
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
  });

  onMount(() => {
    if (!browser) return;
    // Polling handled elsewhere (store)
  });

  onDestroy(() => {
    // No-op: store manages polling lifecycle
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

{#if $isAuthenticated}
  <!-- Sync button styled like other nav items -->
  <button
    type="button"
    class="group relative w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded transition-colors duration-150 cursor-pointer overflow-hidden
      {hasError
      ? 'text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/30'
      : isSyncing
        ? 'text-neutral-400'
        : 'text-neutral-400 hover:text-white hover:bg-white/5'}
      {isCollapsed ? 'justify-center' : ''}"
    title={isCollapsed
      ? tooltipText() ||
        (isSyncing ? "Syncing..." : hasError ? "Sync error" : "Sync (⌘⇧S)")
      : undefined}
    onclick={() => {
      showSyncModal = true;
    }}
  >
    <!-- Progress bar fill (only show when syncing or error) -->
    {#if isSyncing || hasError}
      <div
        class="absolute inset-0 rounded transition-all duration-300 ease-out {hasError
          ? 'bg-red-500/10'
          : 'bg-white/5'}"
        style="width: {displayProgress}%;"
      ></div>
    {/if}

    <!-- Icon -->
    <div class="relative shrink-0">
      {#if isSyncing || hasError}
        <!-- 3x3 grid animation (Linear-style) -->
        <div class="grid grid-cols-3 gap-0.5 w-5 h-5">
          {#each Array(9) as _, i}
            <div
              class="sync-block w-full h-full rounded-[1px] {hasError
                ? 'bg-red-500'
                : 'bg-current'}"
              style="animation-delay: {delays[i]}s;"
            ></div>
          {/each}
        </div>
      {:else}
        <!-- Idle state: sync icon -->
        <svg
          class="w-5 h-5"
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
      {/if}
    </div>

    <!-- Label (hidden when collapsed) -->
    {#if !isCollapsed}
      <span class="relative whitespace-nowrap {hasError ? 'text-red-400' : ''}">
        {hasError
          ? hasPartialSync
            ? "Partial sync"
            : "Sync error"
          : isSyncing
            ? "Syncing..."
            : "Sync"}
      </span>
    {/if}

    <!-- Tooltip when collapsed -->
    {#if isCollapsed}
      <div
        class="absolute left-full ml-2 px-2 py-1 text-xs font-medium text-white bg-neutral-800 rounded shadow-lg
          opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 whitespace-nowrap z-50"
      >
        {hasError
          ? hasPartialSync
            ? "Partial sync"
            : "Sync error"
          : isSyncing
            ? "Syncing..."
            : "Sync (⌘⇧S)"}
      </div>
    {/if}
  </button>

  {#if showSyncModal}
    <SyncModal onclose={() => (showSyncModal = false)} />
  {/if}
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
</style>

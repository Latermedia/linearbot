<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { browser } from "$app/environment";
  import Button from "$lib/components/Button.svelte";
  import { databaseStore } from "../stores/database";
  import { RefreshCw } from "lucide-svelte";
  import { csrfPost } from "$lib/utils/csrf";
  import { isAuthenticated } from "$lib/stores/auth";
  import { syncStatusStore } from "$lib/stores/sync-status";

  let syncStatus = $state<"idle" | "syncing" | "error">("idle");
  let isRefreshing = $state(false);
  let serverLastSyncTime: number | null = $state(null);
  let progressPercent = $state<number | null>(null);
  let errorMessage = $state<string | null>(null);
  // Centralize polling in `syncStatusStore` to avoid duplicate `/api/sync/status` requests.
  $effect(() => {
    if (!browser) return;
    if (!$isAuthenticated) return;

    const data = $syncStatusStore;
    const wasSyncing = syncStatus === "syncing" || isRefreshing;
    const prevLastSyncTime = serverLastSyncTime;

    syncStatus = data.status;
    serverLastSyncTime = data.lastSyncTime;
    progressPercent = data.progressPercent ?? null;
    errorMessage = data.error || null;

    // If sync completed (was syncing, now idle), reload data
    if (wasSyncing && data.status === "idle" && data.lastSyncTime) {
      isRefreshing = false;
      void databaseStore.load();
    } else if (
      data.status === "idle" &&
      data.lastSyncTime !== null &&
      prevLastSyncTime !== null &&
      data.lastSyncTime !== prevLastSyncTime
    ) {
      // Automatic sync completed - reload data
      void databaseStore.load();
    } else if (data.status === "error" && isRefreshing) {
      isRefreshing = false;
      // Clear error after 5 seconds
      setTimeout(() => {
        if (syncStatus === "error") {
          errorMessage = null;
        }
      }, 5000);
    } else if (data.status === "idle" && !data.isRunning) {
      isRefreshing = false;
    }
  });

  async function handleRefresh() {
    if (!browser || isRefreshing || syncStatus === "syncing") return;

    isRefreshing = true;
    errorMessage = null;

    // Optimistically update UI immediately
    syncStatusStore.setOptimisticSyncing();

    try {
      const response = await csrfPost("/api/sync");

      const data = await response.json();

      if (!response.ok) {
        isRefreshing = false;
        // Rate limited or already syncing
        if (response.status === 429 || response.status === 409) {
          errorMessage = data.message || "Sync not available";
        } else {
          errorMessage = data.message || "Failed to start sync";
          syncStatus = "error";
        }
        return;
      }

      // Sync started successfully, polling will handle the rest
    } catch (error) {
      errorMessage =
        error instanceof Error ? error.message : "Failed to start sync";
      isRefreshing = false;
      syncStatus = "error";
    }
  }

  // Convert server timestamp to Date for display
  const lastSyncDate = $derived(
    serverLastSyncTime ? new Date(serverLastSyncTime) : null
  );

  function formatLastSync(date: Date | null): string {
    if (!date) return "Never synced";

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));

    if (diffMins < 1) return "Just now";
    if (diffMins === 1) return "1 minute ago";
    if (diffMins < 60) return `${diffMins} minutes ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours === 1) return "1 hour ago";
    return `${diffHours} hours ago`;
  }

  function _formatDateTime(date: Date | null): string {
    if (!date) return "Never";

    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }

  // Only run in browser
  onMount(() => {
    // Store manages status polling.
    return () => {};
  });

  onDestroy(() => {
    // No-op
  });
</script>

<div class="flex flex-col gap-1 items-end">
  <Button
    onclick={handleRefresh}
    disabled={isRefreshing || syncStatus === "syncing"}
    variant="secondary"
    size="sm"
  >
    <RefreshCw
      class={`h-4 w-4 ${isRefreshing || syncStatus === "syncing" ? "animate-spin" : ""}`}
    />
    {#if syncStatus === "syncing" || isRefreshing}
      Syncing...
    {:else}
      Sync now
    {/if}
  </Button>
  {#if syncStatus === "syncing" && progressPercent !== null}
    <div class="text-xs text-black-500 dark:text-black-500">
      {progressPercent.toFixed(2)}%
    </div>
  {:else if syncStatus === "error" && errorMessage}
    <div class="text-xs text-danger-600 dark:text-danger-400">
      {errorMessage}
    </div>
  {:else}
    <div class="text-xs text-black-500 dark:text-black-500">
      Last sync: {formatLastSync(lastSyncDate)}
    </div>
  {/if}
</div>

<style>
  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  :global(.animate-spin) {
    animation: spin 1s linear infinite;
  }
</style>

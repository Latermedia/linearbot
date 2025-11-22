<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { browser } from "$app/environment";
  import Button from "$lib/components/ui/button.svelte";
  import { databaseStore } from "../stores/database";
  import { RefreshCw } from "lucide-svelte";

  const POLL_INTERVAL = 1000; // Poll every 1 second when syncing
  const STATUS_POLL_INTERVAL = 5000; // Poll status every 5 seconds when idle

  let syncStatus = $state<"idle" | "syncing" | "error">("idle");
  let isRefreshing = $state(false);
  let serverLastSyncTime: number | null = $state(null);
  let progressPercent = $state<number | null>(null);
  let pollIntervalId: number | undefined;
  let statusPollIntervalId: number | undefined;
  let errorMessage = $state<string | null>(null);

  async function checkSyncStatus() {
    if (!browser) return;

    try {
      const response = await fetch("/api/sync/status");
      if (response.ok) {
        const data = await response.json();
        const wasSyncing = syncStatus === "syncing" || isRefreshing;
        syncStatus = data.status;
        serverLastSyncTime = data.lastSyncTime;
        progressPercent = data.progressPercent ?? null;
        errorMessage = data.error || null;

        // If sync completed (was syncing, now idle), reload data
        if (wasSyncing && syncStatus === "idle" && serverLastSyncTime) {
          isRefreshing = false;
          await databaseStore.load();
        } else if (syncStatus === "error" && isRefreshing) {
          isRefreshing = false;
          // Clear error after 5 seconds
          setTimeout(() => {
            if (syncStatus === "error") {
              errorMessage = null;
            }
          }, 5000);
        } else if (syncStatus === "idle" && !data.isRunning) {
          // Make sure isRefreshing is false when server says idle
          isRefreshing = false;
        }
      }
    } catch (error) {
      console.debug("Status poll error:", error);
    }
  }

  async function handleRefresh() {
    if (!browser || isRefreshing || syncStatus === "syncing") return;

    isRefreshing = true;
    errorMessage = null;

    try {
      const response = await fetch("/api/sync", {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        isRefreshing = false;
        // Rate limited or already syncing
        if (response.status === 429 || response.status === 409) {
          errorMessage = data.message || "Sync not available";
          // Still check status to get accurate state
          await checkSyncStatus();
        } else {
          errorMessage = data.message || "Failed to start sync";
          syncStatus = "error";
        }
        return;
      }

      // Sync started, begin polling
      syncStatus = "syncing";
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

  function formatDateTime(date: Date | null): string {
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
    // Initial status check
    checkSyncStatus();

    // Poll status periodically when idle
    statusPollIntervalId = setInterval(
      checkSyncStatus,
      STATUS_POLL_INTERVAL
    ) as unknown as number;

    return () => {
      if (pollIntervalId) clearInterval(pollIntervalId);
      if (statusPollIntervalId) clearInterval(statusPollIntervalId);
    };
  });

  // Poll more frequently when syncing
  $effect(() => {
    if (!browser) return;

    if (syncStatus === "syncing" && !pollIntervalId) {
      pollIntervalId = setInterval(
        checkSyncStatus,
        POLL_INTERVAL
      ) as unknown as number;
    } else if (syncStatus !== "syncing" && pollIntervalId) {
      clearInterval(pollIntervalId);
      pollIntervalId = undefined;
    }

    return () => {
      if (pollIntervalId) {
        clearInterval(pollIntervalId);
        pollIntervalId = undefined;
      }
    };
  });

  onDestroy(() => {
    if (pollIntervalId) clearInterval(pollIntervalId);
    if (statusPollIntervalId) clearInterval(statusPollIntervalId);
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
    <div class="text-xs text-neutral-500 dark:text-neutral-500">
      {progressPercent}%
    </div>
  {:else if syncStatus === "error" && errorMessage}
    <div class="text-xs text-red-600 dark:text-red-400">
      {errorMessage}
    </div>
  {:else}
    <div class="text-xs text-neutral-500 dark:text-neutral-500">
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

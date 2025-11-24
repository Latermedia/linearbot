<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { browser } from "$app/environment";
  import Button from "$lib/components/ui/button.svelte";
  import { databaseStore } from "../stores/database";
  import { Trash2, X, RefreshCw } from "lucide-svelte";

  let {
    onclose,
  }: {
    onclose: () => void;
  } = $props();

  const POLL_INTERVAL = 1000; // Poll every 1 second when syncing
  const STATUS_POLL_INTERVAL = 5000; // Poll status every 5 seconds when idle

  let isResetting = $state(false);
  let resetError = $state<string | null>(null);
  let resetSuccess = $state(false);
  
  let syncStatus = $state<"idle" | "syncing" | "error">("idle");
  let isRefreshing = $state(false);
  let serverLastSyncTime: number | null = $state(null);
  let progressPercent = $state<number | null>(null);
  let pollIntervalId: number | undefined;
  let statusPollIntervalId: number | undefined;
  let syncErrorMessage = $state<string | null>(null);

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
        syncErrorMessage = data.error || null;

        // If sync completed (was syncing, now idle), reload data
        if (wasSyncing && syncStatus === "idle" && serverLastSyncTime) {
          isRefreshing = false;
          await databaseStore.load();
        } else if (syncStatus === "error" && isRefreshing) {
          isRefreshing = false;
        } else if (syncStatus === "idle" && !data.isRunning) {
          isRefreshing = false;
        }
      }
    } catch (error) {
      console.debug("Status poll error:", error);
    }
  }

  async function handleSync() {
    if (!browser || isRefreshing || syncStatus === "syncing") return;

    isRefreshing = true;
    syncErrorMessage = null;

    try {
      const response = await fetch("/api/sync", {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        isRefreshing = false;
        if (response.status === 429 || response.status === 409) {
          syncErrorMessage = data.message || "Sync not available";
          await checkSyncStatus();
        } else {
          syncErrorMessage = data.message || "Failed to start sync";
          syncStatus = "error";
        }
        return;
      }

      syncStatus = "syncing";
    } catch (error) {
      syncErrorMessage = error instanceof Error ? error.message : "Failed to start sync";
      isRefreshing = false;
      syncStatus = "error";
    }
  }

  async function handleResetDatabase() {
    if (!browser || isResetting) return;
    
    if (!confirm("⚠️ Are you sure you want to reset the database?\n\nThis will delete ALL synced data. You'll need to sync again after this.")) {
      return;
    }

    isResetting = true;
    resetError = null;
    resetSuccess = false;

    try {
      const response = await fetch("/api/db/reset", {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        resetError = data.error || "Failed to reset database";
        return;
      }

      resetSuccess = true;
      // Reload data after reset
      await databaseStore.load();
    } catch (error) {
      resetError = error instanceof Error ? error.message : "Failed to reset database";
    } finally {
      isResetting = false;
    }
  }

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

  const lastSyncDate = $derived(
    serverLastSyncTime ? new Date(serverLastSyncTime) : null
  );

  onMount(() => {
    document.addEventListener("keydown", handleKeydown);
    document.body.style.overflow = "hidden";
    
    // Initial status check
    checkSyncStatus();

    // Poll status periodically when idle
    statusPollIntervalId = setInterval(
      checkSyncStatus,
      STATUS_POLL_INTERVAL
    ) as unknown as number;

    return () => {
      document.removeEventListener("keydown", handleKeydown);
      document.body.style.overflow = "";
      if (pollIntervalId) clearInterval(pollIntervalId);
      if (statusPollIntervalId) clearInterval(statusPollIntervalId);
    };
  });

  // Poll more frequently when syncing
  $effect(() => {
    if (!browser) return;

    if (syncStatus === "syncing" && !pollIntervalId) {
      pollIntervalId = setInterval(checkSyncStatus, POLL_INTERVAL) as unknown as number;
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

<div
  class="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/60"
  onclick={handleBackdropClick}
  onkeydown={handleBackdropKeydown}
  role="dialog"
  aria-modal="true"
  aria-labelledby="modal-title"
  tabindex="-1"
>
  <div
    class="w-full max-w-md rounded-md border shadow-2xl bg-neutral-900 border-white/10 shadow-black/50 m-4"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => e.stopPropagation()}
    role="document"
  >
    <div class="p-6">
      <!-- Header -->
      <div class="flex items-start justify-between mb-6">
        <div class="flex-1">
          <h2
            id="modal-title"
            class="text-lg font-medium text-white mb-1"
          >
            🔧 Dev Menu
          </h2>
          <p class="text-xs text-neutral-400">
            Developer tools and utilities
          </p>
        </div>
        <button
          class="text-neutral-400 hover:text-white transition-colors duration-150"
          onclick={onclose}
          aria-label="Close modal"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- Sync Section -->
      <div class="space-y-4">
        <div>
          <h3 class="text-sm font-medium text-white mb-2">Sync</h3>
          <div class="p-3 rounded-md bg-neutral-800/50 border border-neutral-700/50">
            <p class="text-xs text-neutral-400 mb-3">
              Sync data from Linear API. This will fetch all started issues and project data.
            </p>
            {#if syncStatus === "syncing" && progressPercent !== null}
              <div class="mb-3 p-2 rounded bg-blue-500/10 border border-blue-500/20">
                <p class="text-xs text-blue-400">Syncing... {progressPercent}%</p>
              </div>
            {/if}
            {#if syncErrorMessage}
              <div class="mb-3 p-2 rounded bg-red-500/10 border border-red-500/20">
                <p class="text-xs text-red-400">{syncErrorMessage}</p>
              </div>
            {/if}
            {#if lastSyncDate}
              <p class="text-xs text-neutral-500 mb-3">
                Last sync: {formatLastSync(lastSyncDate)}
              </p>
            {/if}
            <Button
              onclick={handleSync}
              disabled={isRefreshing || syncStatus === "syncing"}
              variant="default"
              size="sm"
              class="w-full"
            >
              <RefreshCw class={`h-4 w-4 mr-2 ${isRefreshing || syncStatus === "syncing" ? "animate-spin" : ""}`} />
              {#if syncStatus === "syncing" || isRefreshing}
                Syncing...
              {:else}
                Sync Now
              {/if}
            </Button>
          </div>
        </div>

        <!-- Reset Database Section -->
        <div>
          <h3 class="text-sm font-medium text-white mb-2">Database</h3>
          <div class="p-3 rounded-md bg-neutral-800/50 border border-neutral-700/50">
            <p class="text-xs text-neutral-400 mb-3">
              Reset the database to fix schema issues or start fresh. All synced data will be deleted.
            </p>
            {#if resetSuccess}
              <div class="mb-3 p-2 rounded bg-green-500/10 border border-green-500/20">
                <p class="text-xs text-green-400">✅ Database reset successfully!</p>
              </div>
            {/if}
            {#if resetError}
              <div class="mb-3 p-2 rounded bg-red-500/10 border border-red-500/20">
                <p class="text-xs text-red-400">{resetError}</p>
              </div>
            {/if}
            <Button
              onclick={handleResetDatabase}
              disabled={isResetting}
              variant="destructive"
              size="sm"
              class="w-full"
            >
              <Trash2 class="h-4 w-4 mr-2" />
              {#if isResetting}
                Resetting...
              {:else}
                Reset Database
              {/if}
            </Button>
          </div>
        </div>
      </div>

      <!-- Footer hint -->
      <div class="mt-6 pt-4 border-t border-white/10">
        <p class="text-xs text-center text-neutral-500">
          Press <kbd class="px-1.5 py-0.5 rounded bg-neutral-800 border border-neutral-700 text-neutral-300">Esc</kbd> to close
        </p>
      </div>
    </div>
  </div>
</div>


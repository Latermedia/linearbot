<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { browser } from "$app/environment";
  import Button from "$lib/components/ui/button.svelte";
  import { databaseStore } from "../stores/database";
  import { Trash2, X, RefreshCw, AlertTriangle } from "lucide-svelte";

  let {
    onclose,
  }: {
    onclose: () => void;
  } = $props();

  const POLL_INTERVAL = 1000; // Poll every 1 second when syncing
  const STATUS_POLL_INTERVAL = 5000; // Poll status every 5 seconds when idle
  const DELETE_CONFIRMATION_TEXT = "DELETE";

  let isResetting = $state(false);
  let resetError = $state<string | null>(null);
  let resetSuccess = $state(false);

  let syncStatus = $state<"idle" | "syncing" | "error">("idle");
  let isRefreshing = $state(false);
  let serverLastSyncTime: number | null = $state(null);
  let previousLastSyncTime: number | null = $state(null);
  let progressPercent = $state<number | null>(null);
  let pollIntervalId: number | undefined;
  let statusPollIntervalId: number | undefined;
  let syncErrorMessage = $state<string | null>(null);

  // Sync stats
  interface SyncStats {
    startedIssuesCount: number;
    totalProjectsCount: number;
    currentProjectIndex: number;
    currentProjectName: string | null;
    projectIssuesCount: number;
  }
  let syncStats = $state<SyncStats | null>(null);

  // Delete confirmation state
  let showDeleteSection = $state(false);
  let deleteConfirmationInput = $state("");
  let deleteInputRef: HTMLInputElement | null = null;

  const canDelete = $derived(
    deleteConfirmationInput === DELETE_CONFIRMATION_TEXT
  );

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      if (showDeleteSection) {
        showDeleteSection = false;
        deleteConfirmationInput = "";
      } else {
        onclose();
      }
    }
    // Shift+D to toggle delete section
    if (event.shiftKey && event.key === "D" && !showDeleteSection) {
      event.preventDefault();
      showDeleteSection = true;
      // Focus the input after the section appears
      setTimeout(() => {
        deleteInputRef?.focus();
      }, 50);
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
        const previousSyncTime = serverLastSyncTime;

        syncStatus = data.status;
        serverLastSyncTime = data.lastSyncTime;
        progressPercent = data.progressPercent ?? null;
        syncErrorMessage = data.error || null;
        syncStats = data.stats ?? null;

        // Detect if lastSyncTime changed (sync completed, either manual or automatic)
        const syncTimeChanged =
          serverLastSyncTime !== null &&
          previousSyncTime !== null &&
          serverLastSyncTime !== previousSyncTime;

        const isNewSync =
          serverLastSyncTime !== null && previousSyncTime === null;

        // If sync completed (was syncing, now idle) OR sync time changed (automatic sync), reload data
        if (
          (wasSyncing && syncStatus === "idle" && serverLastSyncTime) ||
          (syncStatus === "idle" && (syncTimeChanged || isNewSync))
        ) {
          isRefreshing = false;
          previousLastSyncTime = serverLastSyncTime;
          syncStats = null;
          await databaseStore.load();
        } else if (syncStatus === "error" && isRefreshing) {
          isRefreshing = false;
          syncStats = null;
        } else if (syncStatus === "idle" && !data.isRunning) {
          isRefreshing = false;
          syncStats = null;
        }

        // Update previous sync time if it changed
        if (serverLastSyncTime !== previousSyncTime) {
          previousLastSyncTime = serverLastSyncTime;
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
      syncErrorMessage =
        error instanceof Error ? error.message : "Failed to start sync";
      isRefreshing = false;
      syncStatus = "error";
    }
  }

  async function handleResetDatabase() {
    if (!browser || isResetting || !canDelete) return;

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
      deleteConfirmationInput = "";
      showDeleteSection = false;
      // Reload data after reset
      await databaseStore.load();
    } catch (error) {
      resetError =
        error instanceof Error ? error.message : "Failed to reset database";
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

<div
  class="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/70"
  onclick={handleBackdropClick}
  onkeydown={handleBackdropKeydown}
  role="dialog"
  aria-modal="true"
  aria-labelledby="modal-title"
  tabindex="-1"
>
  <div
    class="w-full max-w-sm rounded-lg bg-neutral-900 shadow-2xl shadow-black/60 m-4"
    role="document"
  >
    <div class="p-5">
      <!-- Header -->
      <div class="flex items-center justify-between mb-5">
        <h2 id="modal-title" class="text-sm font-medium text-white">Tools</h2>
        <button
          class="text-neutral-500 hover:text-white transition-colors"
          onclick={onclose}
          aria-label="Close modal"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Sync Section -->
      <div class="space-y-5">
        <div class="space-y-4">
          {#if syncStatus === "syncing"}
            <!-- Syncing state -->
            <div class="space-y-3">
              {#if progressPercent !== null}
                <div class="space-y-2">
                  <div class="flex items-center justify-between">
                    <span class="text-sm text-white">Syncing</span>
                    <span class="text-sm text-neutral-400 tabular-nums"
                      >{progressPercent}%</span
                    >
                  </div>
                  <div class="w-full bg-neutral-800 rounded-full h-1">
                    <div
                      class="bg-indigo-500 h-1 rounded-full transition-all duration-300"
                      style="width: {progressPercent}%"
                    ></div>
                  </div>
                </div>
              {/if}

              {#if syncStats}
                <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  {#if syncStats.startedIssuesCount > 0}
                    <span class="text-neutral-500">WIP Issues</span>
                    <span class="text-neutral-300 tabular-nums"
                      >{syncStats.startedIssuesCount}</span
                    >
                  {/if}
                  {#if syncStats.totalProjectsCount > 0}
                    <span class="text-neutral-500">Projects</span>
                    <span class="text-neutral-300 tabular-nums"
                      >{syncStats.currentProjectIndex}/{syncStats.totalProjectsCount}</span
                    >
                  {/if}
                  {#if syncStats.projectIssuesCount > 0}
                    <span class="text-neutral-500">Project Issues</span>
                    <span class="text-neutral-300 tabular-nums"
                      >{syncStats.projectIssuesCount}</span
                    >
                  {/if}
                </div>
                {#if syncStats.currentProjectName}
                  <p
                    class="text-xs text-neutral-500 truncate"
                    title={syncStats.currentProjectName}
                  >
                    {syncStats.currentProjectName}
                  </p>
                {/if}
              {/if}
            </div>
          {:else}
            <!-- Idle state -->
            <p class="text-sm text-neutral-400">Sync data from Linear API</p>
          {/if}

          {#if syncErrorMessage}
            <p class="text-xs text-red-400">{syncErrorMessage}</p>
          {/if}

          <div class="flex items-center justify-between">
            <Button
              onclick={handleSync}
              disabled={isRefreshing || syncStatus === "syncing"}
              variant="default"
              size="sm"
            >
              <RefreshCw
                class={`h-3.5 w-3.5 mr-1.5 ${isRefreshing || syncStatus === "syncing" ? "animate-spin" : ""}`}
              />
              {#if syncStatus === "syncing" || isRefreshing}
                Syncing
              {:else}
                Sync Now
              {/if}
            </Button>
            {#if lastSyncDate && syncStatus !== "syncing"}
              <span class="text-xs text-neutral-600"
                >{formatLastSync(lastSyncDate)}</span
              >
            {/if}
          </div>
        </div>

        <!-- Reset Database Section (Hidden by default, Shift+D to reveal) -->
        {#if showDeleteSection}
          <div class="pt-4 border-t border-neutral-800 space-y-3">
            <div class="flex items-center gap-2 text-red-400">
              <AlertTriangle class="h-3.5 w-3.5" />
              <span class="text-xs font-medium">Danger Zone</span>
            </div>

            <p class="text-xs text-neutral-500">
              Reset database and delete all synced data.
            </p>

            {#if resetSuccess}
              <p class="text-xs text-green-400">Database reset successfully</p>
            {/if}
            {#if resetError}
              <p class="text-xs text-red-400">{resetError}</p>
            {/if}

            <div class="space-y-2">
              <input
                id="delete-confirm"
                type="text"
                bind:value={deleteConfirmationInput}
                bind:this={deleteInputRef}
                class="w-full px-2.5 py-1.5 text-xs rounded bg-neutral-800/50 text-white placeholder-neutral-600 focus:outline-none focus:ring-1 focus:ring-red-500/50"
                placeholder="Type DELETE to confirm"
                autocomplete="off"
                spellcheck="false"
              />
              <div class="flex gap-2">
                <button
                  onclick={() => {
                    showDeleteSection = false;
                    deleteConfirmationInput = "";
                  }}
                  class="flex-1 px-3 py-1.5 text-xs text-neutral-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onclick={handleResetDatabase}
                  disabled={isResetting || !canDelete}
                  class="flex-1 px-3 py-1.5 text-xs rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {#if isResetting}
                    Resetting...
                  {:else}
                    Reset
                  {/if}
                </button>
              </div>
            </div>
          </div>
        {/if}
      </div>

      <!-- Footer hint -->
      <div class="mt-5 pt-4 border-t border-neutral-800">
        <p class="text-xs text-center text-neutral-500">
          <kbd
            class="px-1.5 py-0.5 rounded bg-neutral-800 border border-neutral-700 text-neutral-300"
            >Esc</kbd
          >
          to close
          {#if !showDeleteSection}
            <span class="mx-1.5">·</span>
            <kbd
              class="px-1.5 py-0.5 rounded bg-neutral-800 border border-neutral-700 text-neutral-300"
              >Shift+D</kbd
            > danger zone
          {/if}
        </p>
      </div>
    </div>
  </div>
</div>

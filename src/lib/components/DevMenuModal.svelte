<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { browser } from "$app/environment";
  import Modal from "$lib/components/Modal.svelte";
  import StatusScroller from "$lib/components/StatusScroller.svelte";
  import Button from "$lib/components/Button.svelte";
  import { databaseStore } from "../stores/database";
  import { AlertTriangle, RefreshCw } from "lucide-svelte";

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
  let pollIntervalId: number | undefined;
  let statusPollIntervalId: number | undefined;
  let syncErrorMessage = $state<string | null>(null);
  let syncProgressPercent = $state<number | null>(null);
  let hasPartialSync = $state(false);
  let partialSyncProgress = $state<{ completed: number; total: number } | null>(
    null
  );
  let _syncingProjectId = $state<string | null>(null);
  let apiQueryCount = $state<number | null>(null);

  // Sync stats
  interface SyncStats {
    startedIssuesCount: number;
    totalProjectsCount: number;
    currentProjectIndex: number;
    currentProjectName: string | null;
    projectIssuesCount: number;
  }
  let syncStats = $state<SyncStats | null>(null);

  // Status messages for streaming display
  let statusMessages = $state<string[]>([]);

  // System statistics
  interface SystemStats {
    totalIssues: number;
    totalProjects: number;
    totalEngineers: number;
    totalTeams: number;
    startedIssues: number;
  }
  let systemStats = $state<SystemStats | null>(null);

  // Delete confirmation state
  let showDeleteSection = $state(false);
  let deleteConfirmationInput = $state("");
  let deleteInputRef = $state<HTMLInputElement | null>(null);

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

  function addStatusMessage(message: string) {
    statusMessages = [...statusMessages, message].slice(-5); // Keep last 5 messages
  }

  async function fetchSystemStats() {
    if (!browser) return;

    try {
      const response = await fetch("/api/system/stats");
      if (response.ok) {
        const data = await response.json();
        systemStats = data;
      }
    } catch (error) {
      console.debug("System stats poll error:", error);
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
        syncErrorMessage = data.error || null;
        syncProgressPercent = data.progressPercent ?? null;
        hasPartialSync = data.hasPartialSync ?? false;
        partialSyncProgress = data.partialSyncProgress ?? null;
        _syncingProjectId = data.syncingProjectId ?? null;
        syncStats = data.stats ?? null;
        apiQueryCount = data.apiQueryCount ?? null;

        // Generate status message for streaming display
        if (syncStatus === "syncing" && syncStats) {
          // Prioritize most relevant status message
          if (syncStats.currentProjectName) {
            addStatusMessage(`Syncing: ${syncStats.currentProjectName}`);
          } else if (syncStats.totalProjectsCount > 0) {
            addStatusMessage(
              `Processing project ${syncStats.currentProjectIndex} of ${syncStats.totalProjectsCount}`
            );
          } else if (syncStats.startedIssuesCount > 0) {
            addStatusMessage(
              `Synced ${syncStats.startedIssuesCount} WIP issues`
            );
          }
        }

        // Detect if lastSyncTime changed (sync completed, either manual or automatic)
        const syncTimeChanged =
          serverLastSyncTime !== null &&
          previousSyncTime !== null &&
          serverLastSyncTime !== previousSyncTime;

        // Only reload if we were actually syncing and it just completed, or if sync time changed
        // Don't reload on initial modal open (when previousSyncTime is null)
        if (wasSyncing && syncStatus === "idle" && serverLastSyncTime) {
          // Sync just completed - reload data
          isRefreshing = false;
          previousLastSyncTime = serverLastSyncTime;
          syncStats = null;
          statusMessages = [];
          syncProgressPercent = null;
          await databaseStore.load();
          await fetchSystemStats(); // Refresh system stats after sync
        } else if (
          syncStatus === "idle" &&
          syncTimeChanged &&
          previousSyncTime !== null
        ) {
          // Automatic sync completed (time changed) - reload data
          previousLastSyncTime = serverLastSyncTime;
          syncStats = null;
          statusMessages = [];
          syncProgressPercent = null;
          await databaseStore.load();
          await fetchSystemStats();
        } else if (syncStatus === "error" && isRefreshing) {
          isRefreshing = false;
          syncStats = null;
          if (syncErrorMessage) {
            addStatusMessage(`Error: ${syncErrorMessage}`);
          }
        } else if (syncStatus === "idle" && !data.isRunning) {
          isRefreshing = false;
          syncStats = null;
          syncProgressPercent = null;
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
    statusMessages = [];

    try {
      const response = await fetch("/api/sync", {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        isRefreshing = false;
        if (response.status === 429 || response.status === 409) {
          syncErrorMessage = data.message || "Sync not available";
          addStatusMessage(`Sync unavailable: ${syncErrorMessage}`);
          await checkSyncStatus();
        } else {
          syncErrorMessage = data.message || "Failed to start sync";
          syncStatus = "error";
          addStatusMessage(`Sync failed: ${syncErrorMessage}`);
        }
        return;
      }

      syncStatus = "syncing";
      // Status messages will be generated by checkSyncStatus polling
    } catch (error) {
      syncErrorMessage =
        error instanceof Error ? error.message : "Failed to start sync";
      isRefreshing = false;
      syncStatus = "error";
      addStatusMessage(`Sync error: ${syncErrorMessage}`);
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

  const isSyncing = $derived(syncStatus === "syncing" || isRefreshing);

  onMount(() => {
    document.addEventListener("keydown", handleKeydown);

    // Initial status check and system stats
    // Initialize previousLastSyncTime to prevent false reload on modal open
    checkSyncStatus().then(() => {
      // After first check, set previousLastSyncTime to current to prevent false reloads
      if (serverLastSyncTime !== null && previousLastSyncTime === null) {
        previousLastSyncTime = serverLastSyncTime;
      }
    });
    fetchSystemStats();

    // Poll status periodically when idle
    statusPollIntervalId = setInterval(
      checkSyncStatus,
      STATUS_POLL_INTERVAL
    ) as unknown as number;

    // Poll system stats periodically
    const statsPollIntervalId = setInterval(
      fetchSystemStats,
      STATUS_POLL_INTERVAL * 2
    ) as unknown as number;

    return () => {
      document.removeEventListener("keydown", handleKeydown);
      if (pollIntervalId) clearInterval(pollIntervalId);
      if (statusPollIntervalId) clearInterval(statusPollIntervalId);
      clearInterval(statsPollIntervalId);
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

<Modal title="Tools" {onclose} size="sm" children={childrenSnippet}>
  {#snippet childrenSnippet()}
    <div class="space-y-6">
      <!-- Sync Section -->
      <div class="space-y-3">
        <div class="flex items-center justify-between gap-2">
          <span class="text-xs font-medium text-neutral-400">Sync Status</span>
        </div>

        <!-- Status message or last sync time -->
        <div class="min-h-[3rem] space-y-1.5">
          {#if isSyncing && statusMessages.length > 0}
            <StatusScroller messages={statusMessages} />
            {#if syncProgressPercent !== null}
              <div class="flex items-center gap-2">
                <div
                  class="flex-1 h-1 bg-neutral-800 rounded-full overflow-hidden"
                >
                  <div
                    class="h-full bg-violet-500 transition-all duration-300"
                    style="width: {syncProgressPercent}%"
                  ></div>
                </div>
                <span class="text-xs text-neutral-500 tabular-nums shrink-0">
                  {syncProgressPercent}%
                </span>
              </div>
            {/if}
          {:else if syncErrorMessage}
            <div class="space-y-1">
              <p class="text-xs text-red-400">{syncErrorMessage}</p>
              {#if hasPartialSync && partialSyncProgress}
                <p class="text-xs text-amber-400">
                  Partial sync: {partialSyncProgress.completed} of {partialSyncProgress.total}
                  projects completed
                </p>
              {/if}
            </div>
          {:else if hasPartialSync && partialSyncProgress}
            <div class="space-y-1">
              <p class="text-xs text-amber-400">
                Partial sync detected: {partialSyncProgress.completed} of {partialSyncProgress.total}
                projects completed
              </p>
              {#if lastSyncDate}
                <p class="text-xs text-neutral-500">
                  Last synced {formatLastSync(lastSyncDate)}
                </p>
              {/if}
              {#if apiQueryCount !== null}
                <p class="text-xs text-neutral-500">
                  API Queries: {apiQueryCount}
                </p>
              {/if}
            </div>
          {:else if lastSyncDate}
            <div>
              <p class="text-xs text-neutral-500">
                Last synced {formatLastSync(lastSyncDate)}
              </p>
              {#if apiQueryCount !== null}
                <p class="text-xs text-neutral-500">
                  API Queries: {apiQueryCount}
                </p>
              {/if}
            </div>
          {:else}
            <div>
              <p class="text-xs text-neutral-500">Never synced</p>
              {#if apiQueryCount !== null}
                <p class="text-xs text-neutral-500">
                  API Queries: {apiQueryCount}
                </p>
              {/if}
            </div>
          {/if}
        </div>

        <!-- Sync Now Button -->
        <Button
          onclick={handleSync}
          disabled={isSyncing}
          variant="default"
          size="sm"
          class="w-full"
        >
          <RefreshCw
            class={`h-3.5 w-3.5 mr-1.5 ${isSyncing ? "animate-spin" : ""}`}
          />
          {isSyncing ? "Syncing..." : "Sync Now"}
        </Button>
      </div>

      <!-- System Statistics -->
      {#if systemStats}
        <div class="pt-4 border-t border-neutral-800 space-y-3">
          <h3 class="text-xs font-medium text-neutral-400">
            System Statistics
          </h3>
          <div class="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <span class="text-neutral-500">Total Issues</span>
            <span class="text-neutral-300 tabular-nums text-right">
              {systemStats.totalIssues.toLocaleString()}
            </span>
            <span class="text-neutral-500">Started Issues</span>
            <span class="text-neutral-300 tabular-nums text-right">
              {systemStats.startedIssues.toLocaleString()}
            </span>
            <span class="text-neutral-500">Projects</span>
            <span class="text-neutral-300 tabular-nums text-right">
              {systemStats.totalProjects.toLocaleString()}
            </span>
            <span class="text-neutral-500">Engineers</span>
            <span class="text-neutral-300 tabular-nums text-right">
              {systemStats.totalEngineers.toLocaleString()}
            </span>
            <span class="text-neutral-500">Teams</span>
            <span class="text-neutral-300 tabular-nums text-right">
              {systemStats.totalTeams.toLocaleString()}
            </span>
          </div>
        </div>
      {/if}

      <!-- Reset Database Section -->
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
                {isResetting ? "Resetting..." : "Reset"}
              </button>
            </div>
          </div>
        </div>
      {/if}

      <!-- Footer hint -->
      <div class="pt-4 border-t border-neutral-800">
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
            >
            danger zone
          {/if}
        </p>
      </div>
    </div>
  {/snippet}
</Modal>

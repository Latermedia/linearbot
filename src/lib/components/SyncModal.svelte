<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { browser } from "$app/environment";
  import Modal from "$lib/components/Modal.svelte";
  import Button from "$lib/components/Button.svelte";
  import { csrfPost } from "$lib/utils/csrf";
  import { databaseStore } from "../stores/database";
  import { isAuthenticated } from "$lib/stores/auth";
  import { ExponentialBackoff } from "$lib/utils/backoff";

  let {
    onclose,
  }: {
    onclose: () => void;
  } = $props();

  type SyncPhase =
    | "initial_issues"
    | "recently_updated_issues"
    | "active_projects"
    | "planned_projects"
    | "completed_projects"
    | "initiative_projects"
    | "initiatives"
    | "computing_metrics";

  interface PhaseOption {
    phase: SyncPhase;
    label: string;
    description: string;
  }

  const phaseOptions: PhaseOption[] = [
    {
      phase: "initial_issues",
      label: "Started Issues",
      description: "Fetch all currently started issues",
    },
    {
      phase: "recently_updated_issues",
      label: "Recently Updated Issues",
      description: "Fetch issues updated in the last 7 days",
    },
    {
      phase: "active_projects",
      label: "Active Projects",
      description:
        "Sync projects with active work (from started/recently updated issues)",
    },
    {
      phase: "planned_projects",
      label: "Planned Projects",
      description: "Sync projects in planning state",
    },
    {
      phase: "completed_projects",
      label: "Completed Projects",
      description: "Sync recently completed projects",
    },
    {
      phase: "initiatives",
      label: "Initiatives",
      description: "Sync initiative metadata",
    },
    {
      phase: "initiative_projects",
      label: "Initiative Projects",
      description:
        "Sync projects associated with initiatives that aren't already synced",
    },
    {
      phase: "computing_metrics",
      label: "Compute Metrics",
      description: "Calculate project and engineer metrics (always required)",
    },
  ];

  // Computing metrics is always required
  const REQUIRED_PHASE: SyncPhase = "computing_metrics";

  // Polling intervals
  const POLL_INTERVAL_SYNCING = 1000; // Poll every 1 second when syncing
  const POLL_INTERVAL_IDLE = 5000; // Poll every 5 seconds when idle

  // Form state
  let isFullSync = $state(true);
  let selectedPhases = $state<Set<SyncPhase>>(
    new Set(phaseOptions.map((p) => p.phase))
  );
  let adminPassword = $state("");
  let isSubmitting = $state(false);
  let error = $state<string | null>(null);

  // Sync status state
  let syncStatus = $state<"idle" | "syncing" | "error">("idle");
  let syncProgressPercent = $state<number | null>(null);
  let syncErrorMessage = $state<string | null>(null);
  let statusMessage = $state<string | null>(null);
  let apiQueryCount = $state<number | null>(null);
  let phases = $state<
    Array<{
      phase: string;
      label: string;
      status: "pending" | "in_progress" | "complete";
    }>
  >([]);
  let serverLastSyncTime: number | null = $state(null);
  let previousLastSyncTime: number | null = $state(null);
  let hasInitialStatus = $state(false); // Track if initial status check completed

  let pollIntervalId: number | undefined;
  let backoff = new ExponentialBackoff();
  let nextPollTimeoutId: number | undefined;

  const isSyncing = $derived(syncStatus === "syncing");

  function togglePhase(phase: SyncPhase) {
    // Don't allow deselecting the required phase
    if (phase === REQUIRED_PHASE) {
      return;
    }
    const newSelected = new Set(selectedPhases);
    if (newSelected.has(phase)) {
      newSelected.delete(phase);
    } else {
      newSelected.add(phase);
    }
    selectedPhases = newSelected;
  }

  function toggleFullSync() {
    isFullSync = !isFullSync;
    if (isFullSync) {
      // Select all phases
      selectedPhases = new Set(phaseOptions.map((p) => p.phase));
    } else {
      // Clear all selections except required phase
      selectedPhases = new Set([REQUIRED_PHASE]);
    }
  }

  function handlePhaseToggle(phase: SyncPhase) {
    // Don't allow deselecting the required phase
    if (phase === REQUIRED_PHASE) {
      return;
    }
    togglePhase(phase);
    // If unchecking a phase, disable full sync mode
    if (!selectedPhases.has(phase)) {
      isFullSync = false;
    }
    // If all phases are selected, enable full sync mode
    if (selectedPhases.size === phaseOptions.length) {
      isFullSync = true;
    }
  }

  function stopPolling() {
    if (pollIntervalId) {
      clearInterval(pollIntervalId);
      pollIntervalId = undefined;
    }
    if (nextPollTimeoutId) {
      clearTimeout(nextPollTimeoutId);
      nextPollTimeoutId = undefined;
    }
  }

  function scheduleNextPoll(delay: number) {
    if (nextPollTimeoutId) {
      clearTimeout(nextPollTimeoutId);
    }
    nextPollTimeoutId = setTimeout(() => {
      checkSyncStatus();
    }, delay) as unknown as number;
  }

  async function checkSyncStatus() {
    if (!browser) return;

    // Check authentication before making request
    if (!$isAuthenticated) {
      stopPolling();
      hasInitialStatus = true; // Mark as checked to avoid hanging
      return;
    }

    try {
      const response = await fetch("/api/sync/status");

      // Handle 401 Unauthorized - stop polling if not authenticated
      if (response.status === 401) {
        stopPolling();
        isAuthenticated.set(false);
        hasInitialStatus = true; // Mark as checked to avoid hanging
        return;
      }

      if (response.ok) {
        // Success - reset backoff
        const wasInBackoff = backoff.getFailureCount() > 0;
        backoff.recordSuccess();
        const data = await response.json();
        const wasSyncing = syncStatus === "syncing";
        const previousSyncTime = serverLastSyncTime;

        syncStatus = data.status;
        serverLastSyncTime = data.lastSyncTime;
        syncErrorMessage = data.error || null;
        syncProgressPercent = data.progressPercent ?? null;
        statusMessage = data.statusMessage ?? null;
        apiQueryCount = data.apiQueryCount ?? null;
        phases = data.phases ?? [];
        hasInitialStatus = true; // Mark initial status check as complete

        // If we were in backoff mode, ensure intervals restart
        // The $effect will handle setting up the correct intervals based on syncStatus
        if (wasInBackoff && !pollIntervalId) {
          const interval = isSyncing
            ? POLL_INTERVAL_SYNCING
            : POLL_INTERVAL_IDLE;
          pollIntervalId = setInterval(
            checkSyncStatus,
            interval
          ) as unknown as number;
        }

        // Detect if sync just completed
        const syncTimeChanged =
          serverLastSyncTime !== null &&
          previousSyncTime !== null &&
          serverLastSyncTime !== previousSyncTime;

        if (wasSyncing && syncStatus === "idle" && serverLastSyncTime) {
          // Sync just completed - reload data
          previousLastSyncTime = serverLastSyncTime;
          await databaseStore.load();
        } else if (
          syncStatus === "idle" &&
          syncTimeChanged &&
          previousSyncTime !== null
        ) {
          // Automatic sync completed - reload data
          previousLastSyncTime = serverLastSyncTime;
          await databaseStore.load();
        }

        // Update previous sync time
        if (serverLastSyncTime !== previousSyncTime) {
          previousLastSyncTime = serverLastSyncTime;
        }
      } else {
        // Request failed - record failure and use backoff
        const delay = backoff.recordFailure();
        console.debug(
          `Sync status poll failed (${response.status}), retrying in ${delay}ms`
        );
        stopPolling();
        scheduleNextPoll(delay);
        hasInitialStatus = true; // Mark as checked to avoid hanging
      }
    } catch (err) {
      // Network error - record failure and use backoff
      const delay = backoff.recordFailure();
      console.debug("Status poll error:", err, `retrying in ${delay}ms`);
      stopPolling();
      scheduleNextPoll(delay);
      // Even on error, mark as checked so we don't hang on loading state
      hasInitialStatus = true;
    }
  }

  async function handleSubmit() {
    if (!adminPassword) {
      error = "Admin password is required";
      return;
    }

    if (!isFullSync && selectedPhases.size === 0) {
      error = "Please select at least one sync phase";
      return;
    }

    // Ensure required phase is always selected
    if (!selectedPhases.has(REQUIRED_PHASE)) {
      selectedPhases = new Set([...selectedPhases, REQUIRED_PHASE]);
    }

    isSubmitting = true;
    error = null;

    try {
      const phasesToRun = isFullSync
        ? phaseOptions.map((p) => p.phase)
        : Array.from(selectedPhases);

      // Always ensure required phase is included
      if (!phasesToRun.includes(REQUIRED_PHASE)) {
        phasesToRun.push(REQUIRED_PHASE);
      }

      const response = await csrfPost("/api/sync", {
        adminPassword,
        syncOptions: {
          phases: phasesToRun,
          isFullSync,
        },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || data.message || "Failed to start sync");
      }

      // Sync started - status polling will handle the rest
      syncStatus = "syncing";
      adminPassword = ""; // Clear password
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to start sync";
    } finally {
      isSubmitting = false;
    }
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      onclose();
    }
    if (
      event.key === "Enter" &&
      (event.ctrlKey || event.metaKey) &&
      !isSyncing
    ) {
      event.preventDefault();
      if (adminPassword && (isFullSync || selectedPhases.size > 0)) {
        handleSubmit();
      }
    }
  }

  function formatLastSync(timestamp: number | null): string {
    if (!timestamp) return "Never synced";

    const date = new Date(timestamp);
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

  onMount(() => {
    if (!browser) return;

    // Initial status check
    checkSyncStatus().then(() => {
      // Initialize previousLastSyncTime to prevent false reload on modal open
      if (serverLastSyncTime !== null && previousLastSyncTime === null) {
        previousLastSyncTime = serverLastSyncTime;
      }
    });

    // Start polling
    pollIntervalId = setInterval(
      () => {
        checkSyncStatus();
      },
      isSyncing ? POLL_INTERVAL_SYNCING : POLL_INTERVAL_IDLE
    ) as unknown as number;
  });

  // Adjust polling frequency based on sync status
  $effect(() => {
    if (!browser) return;

    // Only set up intervals if authenticated and no backoff is active
    if (!$isAuthenticated || backoff.getFailureCount() > 0) {
      return;
    }

    // Clear existing interval and set new one with appropriate frequency
    if (pollIntervalId) {
      clearInterval(pollIntervalId);
    }
    const interval = isSyncing ? POLL_INTERVAL_SYNCING : POLL_INTERVAL_IDLE;
    pollIntervalId = setInterval(
      checkSyncStatus,
      interval
    ) as unknown as number;

    return () => {
      if (pollIntervalId) {
        clearInterval(pollIntervalId);
        pollIntervalId = undefined;
      }
    };
  });

  onDestroy(() => {
    stopPolling();
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<Modal title="Sync" {onclose} size="lg">
  <div class="space-y-6">
    {#if !hasInitialStatus}
      <!-- Loading state while checking initial sync status -->
      <div class="flex justify-center items-center py-8">
        <div class="flex gap-2 items-center text-sm text-neutral-400">
          <div class="w-2 h-2 bg-violet-500 rounded-full animate-pulse"></div>
          <span>Checking sync status...</span>
        </div>
      </div>
    {:else if isSyncing}
      <!-- Sync In Progress View -->
      <div class="space-y-4">
        <!-- Status Message -->
        <div class="space-y-2">
          <div class="flex gap-2 items-center">
            <div class="w-2 h-2 bg-violet-500 rounded-full animate-pulse"></div>
            <span class="text-sm font-medium text-white">Sync in progress</span>
          </div>
          {#if statusMessage}
            <p class="pl-4 text-sm text-neutral-300">{statusMessage}</p>
          {/if}
        </div>

        <!-- Progress Bar -->
        {#if syncProgressPercent !== null}
          <div class="space-y-1.5">
            <div class="flex justify-between text-xs text-neutral-400">
              <span>Progress</span>
              <span class="tabular-nums"
                >{syncProgressPercent !== null
                  ? syncProgressPercent.toFixed(2)
                  : "0.00"}%</span
              >
            </div>
            <div class="overflow-hidden h-2 rounded-full bg-neutral-800">
              <div
                class="h-full bg-violet-500 transition-all duration-300 ease-out"
                style="width: {syncProgressPercent}%"
              ></div>
            </div>
          </div>
        {/if}

        <!-- Phase Indicators -->
        {#if phases.length > 0}
          <div class="pt-2 space-y-2">
            <h4 class="text-xs font-medium text-neutral-400">Phases</h4>
            <div class="grid grid-cols-2 gap-2">
              {#each phases as phase (phase.phase)}
                <div class="flex gap-2 items-center text-xs">
                  {#if phase.status === "complete"}
                    <div
                      class="w-1.5 h-1.5 bg-green-500 rounded-full shrink-0"
                    ></div>
                    <span class="text-neutral-400">{phase.label}</span>
                  {:else if phase.status === "in_progress"}
                    <div
                      class="w-1.5 h-1.5 bg-violet-500 rounded-full animate-pulse shrink-0"
                    ></div>
                    <span class="font-medium text-violet-400"
                      >{phase.label}</span
                    >
                  {:else}
                    <div
                      class="w-1.5 h-1.5 rounded-full bg-neutral-600 shrink-0"
                    ></div>
                    <span class="text-neutral-500">{phase.label}</span>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- API Query Count -->
        {#if apiQueryCount !== null}
          <div class="pt-2 border-t border-neutral-800">
            <p class="text-xs text-neutral-500">
              API Queries: <span class="tabular-nums text-neutral-300"
                >{apiQueryCount}</span
              >
            </p>
          </div>
        {/if}
      </div>
    {:else}
      <!-- Sync Configuration Form -->

      <!-- Last Sync Info -->
      {#if serverLastSyncTime}
        <div class="text-xs text-neutral-500">
          Last synced {formatLastSync(serverLastSyncTime)}
        </div>
      {/if}

      <!-- Error from previous sync -->
      {#if syncErrorMessage && syncStatus === "error"}
        <div class="p-3 rounded-md border bg-red-900/20 border-red-800/50">
          <p class="text-sm text-red-400">{syncErrorMessage}</p>
        </div>
      {/if}

      <!-- Full Sync Toggle -->
      <div
        class="flex gap-3 items-start p-4 rounded-lg border transition-colors cursor-pointer border-neutral-700 bg-neutral-800/50 hover:bg-neutral-800/70"
        onclick={toggleFullSync}
        role="button"
        tabindex="0"
        onkeydown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggleFullSync();
          }
        }}
      >
        <input
          type="checkbox"
          id="fullSync"
          checked={isFullSync}
          onchange={toggleFullSync}
          class="mt-1 w-4 h-4 text-blue-600 rounded pointer-events-none border-neutral-600 bg-neutral-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0 focus:ring-offset-neutral-900"
        />
        <div class="flex-1">
          <label
            for="fullSync"
            class="block text-sm font-medium text-white cursor-pointer"
          >
            Full Sync
          </label>
          <p class="mt-1 text-xs text-neutral-400">
            Run all sync phases ({phaseOptions.length} phases). Uncheck to select
            specific phases.
          </p>
        </div>
      </div>

      <!-- Phase Options -->
      <div class="space-y-2">
        <div class="flex justify-between items-center">
          <h3 class="text-sm font-medium text-white">Sync Phases</h3>
          {#if !isFullSync}
            <span class="text-xs text-neutral-400">
              {selectedPhases.size} of {phaseOptions.length} selected
            </span>
          {/if}
        </div>
        <div class="overflow-y-auto space-y-2 max-h-64">
          {#each phaseOptions as option}
            {@const isRequired = option.phase === REQUIRED_PHASE}
            <div
              class="flex items-start gap-3 p-3 rounded-lg border border-neutral-700 bg-neutral-800/30 {isRequired
                ? 'opacity-75 cursor-not-allowed'
                : isFullSync
                  ? ''
                  : 'hover:bg-neutral-800/50 cursor-pointer'} transition-colors"
              onclick={() => {
                if (!isFullSync && !isRequired) {
                  handlePhaseToggle(option.phase);
                }
              }}
              {...isFullSync || isRequired
                ? {}
                : { role: "button", tabindex: 0 }}
              onkeydown={(e) => {
                if (
                  !isFullSync &&
                  !isRequired &&
                  (e.key === "Enter" || e.key === " ")
                ) {
                  e.preventDefault();
                  handlePhaseToggle(option.phase);
                }
              }}
            >
              <input
                type="checkbox"
                id="phase-{option.phase}"
                checked={selectedPhases.has(option.phase)}
                onchange={() => handlePhaseToggle(option.phase)}
                disabled={isFullSync || isRequired}
                class="mt-0.5 w-4 h-4 text-blue-600 rounded pointer-events-none border-neutral-600 bg-neutral-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0 focus:ring-offset-neutral-900 disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <div class="flex-1 min-w-0">
                <label
                  for="phase-{option.phase}"
                  class="block text-sm font-medium text-white {isFullSync ||
                  isRequired
                    ? 'opacity-50 cursor-not-allowed'
                    : 'cursor-pointer'}"
                >
                  {option.label}
                </label>
                <p class="mt-1 text-xs text-neutral-400">
                  {option.description}
                </p>
              </div>
            </div>
          {/each}
        </div>
      </div>

      <!-- Admin Password -->
      <div class="space-y-2">
        <label for="adminPassword" class="block text-sm font-medium text-white">
          Admin Password <span class="text-red-400">*</span>
        </label>
        <input
          type="password"
          id="adminPassword"
          bind:value={adminPassword}
          placeholder="Enter admin password"
          class="px-3 py-2 w-full text-sm text-white rounded-md border border-neutral-600 bg-neutral-800 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          disabled={isSubmitting}
          autocomplete="current-password"
        />
      </div>

      <!-- Form Error Message -->
      {#if error}
        <div class="p-3 rounded-md border bg-red-900/20 border-red-800/50">
          <p class="text-sm text-red-400">{error}</p>
        </div>
      {/if}

      <!-- Actions -->
      <div class="flex gap-3 justify-end pt-2">
        <Button variant="outline" onclick={onclose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          onclick={handleSubmit}
          disabled={isSubmitting ||
            !adminPassword ||
            (!isFullSync && selectedPhases.size === 0)}
        >
          {isSubmitting
            ? "Starting..."
            : isFullSync
              ? `Start Full Sync (${phaseOptions.length} phases)`
              : `Start Sync (${selectedPhases.size} phase${selectedPhases.size === 1 ? "" : "s"})`}
        </Button>
      </div>
    {/if}

    <!-- Footer hint -->
    <div class="pt-4 border-t border-neutral-800">
      <p class="text-xs text-center text-neutral-500">
        <kbd
          class="px-1.5 py-0.5 rounded border bg-neutral-800 border-neutral-700 text-neutral-300"
          >Esc</kbd
        >
        to close
        {#if !isSyncing}
          <span class="mx-1.5">·</span>
          <kbd
            class="px-1.5 py-0.5 rounded border bg-neutral-800 border-neutral-700 text-neutral-300"
            >Cmd+Enter</kbd
          >
          to start
        {/if}
      </p>
    </div>
  </div>
</Modal>

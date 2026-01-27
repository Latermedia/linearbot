<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import Modal from "$lib/components/Modal.svelte";
  import Button from "$lib/components/Button.svelte";
  import { csrfPost } from "$lib/utils/csrf";
  import { databaseStore } from "../stores/database";
  import { isAuthenticated } from "$lib/stores/auth";
  import { syncStatusStore } from "$lib/stores/sync-status";

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

  // Form state
  let isFullSync = $state(true);
  let deepHistorySync = $state(false);
  let incrementalSync = $state(false);
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
  let hasInitialStatus = $state(false); // Track if initial status check completed

  const isSyncing = $derived(syncStatus === "syncing");

  // Centralize polling in `syncStatusStore` to avoid multiple components hammering
  // `/api/sync/status`. This modal reacts to store updates instead.
  $effect(() => {
    if (!browser) return;

    if (!$isAuthenticated) {
      hasInitialStatus = true;
      return;
    }

    const data = $syncStatusStore;
    const prevStatus = syncStatus;
    const prevLastSyncTime = serverLastSyncTime;

    syncStatus = data.status;
    serverLastSyncTime = data.lastSyncTime;
    syncErrorMessage = data.error || null;
    syncProgressPercent = data.progressPercent ?? null;
    statusMessage = data.statusMessage ?? null;
    apiQueryCount = data.apiQueryCount ?? null;
    phases = data.phases ?? [];
    hasInitialStatus = true;

    const wasSyncing = prevStatus === "syncing";
    const isNowIdle = data.status === "idle" && !data.isRunning;

    // Detect if sync just completed and reload data.
    if (wasSyncing && isNowIdle && serverLastSyncTime) {
      void databaseStore.load();
    } else if (
      isNowIdle &&
      serverLastSyncTime !== null &&
      prevLastSyncTime !== null &&
      serverLastSyncTime !== prevLastSyncTime
    ) {
      void databaseStore.load();
    }
  });

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

      // Optimistically update UI immediately before making the request
      syncStatusStore.setOptimisticSyncing();

      const response = await csrfPost("/api/sync", {
        adminPassword,
        syncOptions: {
          phases: phasesToRun,
          isFullSync,
          deepHistorySync,
          incrementalSync,
        },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || data.message || "Failed to start sync");
      }

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
    // Store drives status updates.
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<Modal title="Sync" {onclose} size="lg" maxHeight="90vh" scrollable>
  <div class="space-y-6">
    {#if !hasInitialStatus}
      <!-- Loading state while checking initial sync status -->
      <div class="flex justify-center items-center py-8">
        <div class="flex gap-2 items-center text-sm text-black-400">
          <div class="w-2 h-2 bg-brand-500 rounded-full animate-pulse"></div>
          <span>Checking sync status...</span>
        </div>
      </div>
    {:else if isSyncing}
      <!-- Sync In Progress View -->
      <div class="space-y-4">
        <!-- Status Message -->
        <div class="space-y-2">
          <div class="flex gap-2 items-center">
            <div class="w-2 h-2 bg-brand-500 rounded-full animate-pulse"></div>
            <span class="text-sm font-medium text-black-900 dark:text-white"
              >Sync in progress</span
            >
          </div>
          {#if statusMessage}
            <p class="pl-4 text-sm text-black-300">{statusMessage}</p>
          {/if}
        </div>

        <!-- Progress Bar -->
        {#if syncProgressPercent !== null}
          <div class="space-y-1.5">
            <div class="flex justify-between text-xs text-black-400">
              <span>Progress</span>
              <span class="tabular-nums"
                >{syncProgressPercent !== null
                  ? syncProgressPercent.toFixed(2)
                  : "0.00"}%</span
              >
            </div>
            <div class="overflow-hidden h-2 rounded-full bg-black-800">
              <div
                class="h-full bg-brand-500 transition-all duration-300 ease-out"
                style="width: {syncProgressPercent}%"
              ></div>
            </div>
          </div>
        {/if}

        <!-- Phase Indicators -->
        {#if phases.length > 0}
          <div class="pt-2 space-y-2">
            <h4 class="text-xs font-medium text-black-400">Phases</h4>
            <div class="grid grid-cols-2 gap-2">
              {#each phases as phase (phase.phase)}
                <div class="flex gap-2 items-center text-xs">
                  {#if phase.status === "complete"}
                    <div
                      class="w-1.5 h-1.5 bg-success-500 rounded-full shrink-0"
                    ></div>
                    <span class="text-black-400">{phase.label}</span>
                  {:else if phase.status === "in_progress"}
                    <div
                      class="w-1.5 h-1.5 bg-brand-500 rounded-full animate-pulse shrink-0"
                    ></div>
                    <span class="font-medium text-brand-400">{phase.label}</span
                    >
                  {:else}
                    <div
                      class="w-1.5 h-1.5 rounded-full bg-black-600 shrink-0"
                    ></div>
                    <span class="text-black-500">{phase.label}</span>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- API Query Count -->
        {#if apiQueryCount !== null}
          <div class="pt-2 border-t border-black-800">
            <p class="text-xs text-black-500">
              API Queries: <span class="tabular-nums text-black-300"
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
        <div class="text-xs text-black-500">
          Last synced {formatLastSync(serverLastSyncTime)}
          {#if apiQueryCount !== null}
            <span class="text-black-400">
              · {apiQueryCount.toLocaleString()} queries</span
            >
          {/if}
        </div>
      {/if}

      <!-- Error from previous sync -->
      {#if syncErrorMessage && syncStatus === "error"}
        <div
          class="p-3 rounded-md border bg-danger-900/20 border-danger-800/50"
        >
          <p class="text-sm text-danger-400">{syncErrorMessage}</p>
        </div>
      {/if}

      <!-- Full Sync Toggle -->
      <div
        class="flex gap-3 items-start p-4 rounded-lg border transition-colors cursor-pointer border-black-700 bg-black-800/50 hover:bg-black-800/70"
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
          class="mt-1 w-4 h-4 text-blue-600 rounded pointer-events-none border-black-600 bg-black-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0 focus:ring-offset-black-900"
        />
        <div class="flex-1">
          <label
            for="fullSync"
            class="block text-sm font-medium text-white cursor-pointer"
          >
            Full Sync
          </label>
          <p class="mt-1 text-xs text-black-400">
            Run all sync phases ({phaseOptions.length} phases). Uncheck to select
            specific phases.
          </p>
        </div>
      </div>

      <!-- Sync Mode Options -->
      <div class="space-y-2">
        <h3 class="text-sm font-medium text-black-900 dark:text-white">
          Sync Mode
        </h3>

        <!-- Incremental Sync Toggle -->
        <div
          class="flex gap-3 items-start p-4 rounded-lg border transition-colors cursor-pointer border-success-800/50 bg-success-900/20 hover:bg-success-900/30"
          onclick={() => {
            incrementalSync = !incrementalSync;
            if (incrementalSync) deepHistorySync = false;
          }}
          role="button"
          tabindex="0"
          onkeydown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              incrementalSync = !incrementalSync;
              if (incrementalSync) deepHistorySync = false;
            }
          }}
        >
          <input
            type="checkbox"
            id="incrementalSync"
            checked={incrementalSync}
            onchange={() => {
              incrementalSync = !incrementalSync;
              if (incrementalSync) deepHistorySync = false;
            }}
            class="mt-1 w-4 h-4 text-success-600 rounded pointer-events-none border-black-600 bg-black-700 focus:ring-2 focus:ring-success-500 focus:ring-offset-0 focus:ring-offset-black-900"
          />
          <div class="flex-1">
            <label
              for="incrementalSync"
              class="block text-sm font-medium text-success-300 cursor-pointer"
            >
              Incremental Sync
            </label>
            <p class="mt-1 text-xs text-success-200/70">
              Only fetch issues updated since the last successful sync.
              <span class="font-medium text-success-400"
                >Fastest option - uses fewest API calls.</span
              >
            </p>
          </div>
        </div>

        <!-- Deep History Sync Toggle -->
        <div
          class="flex gap-3 items-start p-4 rounded-lg border transition-colors cursor-pointer border-warning-800/50 bg-warning-900/20 hover:bg-warning-900/30"
          onclick={() => {
            deepHistorySync = !deepHistorySync;
            if (deepHistorySync) incrementalSync = false;
          }}
          role="button"
          tabindex="0"
          onkeydown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              deepHistorySync = !deepHistorySync;
              if (deepHistorySync) incrementalSync = false;
            }
          }}
        >
          <input
            type="checkbox"
            id="deepHistorySync"
            checked={deepHistorySync}
            onchange={() => {
              deepHistorySync = !deepHistorySync;
              if (deepHistorySync) incrementalSync = false;
            }}
            class="mt-1 w-4 h-4 text-warning-600 rounded pointer-events-none border-black-600 bg-black-700 focus:ring-2 focus:ring-warning-500 focus:ring-offset-0 focus:ring-offset-black-900"
          />
          <div class="flex-1">
            <label
              for="deepHistorySync"
              class="block text-sm font-medium text-warning-300 cursor-pointer"
            >
              Deep History Sync
            </label>
            <p class="mt-1 text-xs text-warning-200/70">
              Fetch issues updated in the last year (365 days) instead of 14
              days.
              <span class="font-medium text-warning-400"
                >Slowest option - uses most API calls.</span
              >
            </p>
          </div>
        </div>
      </div>

      <!-- Phase Options -->
      <div class="space-y-2">
        <div class="flex justify-between items-center">
          <h3 class="text-sm font-medium text-black-900 dark:text-white">
            Sync Phases
          </h3>
          {#if !isFullSync}
            <span class="text-xs text-black-400">
              {selectedPhases.size} of {phaseOptions.length} selected
            </span>
          {/if}
        </div>
        <div class="overflow-y-auto space-y-2 max-h-64">
          {#each phaseOptions as option (option.phase)}
            {@const isRequired = option.phase === REQUIRED_PHASE}
            <div
              class="flex items-start gap-3 p-3 rounded-lg border border-black-700 bg-black-800/30 {isRequired
                ? 'opacity-75 cursor-not-allowed'
                : isFullSync
                  ? ''
                  : 'hover:bg-black-800/50 cursor-pointer'} transition-colors"
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
                class="mt-0.5 w-4 h-4 text-blue-600 rounded pointer-events-none border-black-600 bg-black-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0 focus:ring-offset-black-900 disabled:opacity-50 disabled:cursor-not-allowed"
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
                <p class="mt-1 text-xs text-black-400">
                  {option.description}
                </p>
              </div>
            </div>
          {/each}
        </div>
      </div>

      <!-- Admin Password -->
      <div class="space-y-2">
        <label
          for="adminPassword"
          class="block text-sm font-medium text-black-900 dark:text-white"
        >
          Admin Password <span class="text-danger-400">*</span>
        </label>
        <input
          type="password"
          id="adminPassword"
          bind:value={adminPassword}
          placeholder="Enter admin password"
          class="px-3 py-2 w-full text-sm text-white rounded-md border border-black-600 bg-black-800 placeholder-black-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          disabled={isSubmitting}
          autocomplete="off"
        />
      </div>

      <!-- Form Error Message -->
      {#if error}
        <div
          class="p-3 rounded-md border bg-danger-900/20 border-danger-800/50"
        >
          <p class="text-sm text-danger-400">{error}</p>
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
          {#if isSubmitting}
            Starting...
          {:else if incrementalSync}
            {isFullSync
              ? `Start Incremental Sync (${phaseOptions.length} phases)`
              : `Start Incremental Sync (${selectedPhases.size} phase${selectedPhases.size === 1 ? "" : "s"})`}
          {:else if deepHistorySync}
            {isFullSync
              ? `Start Deep History Sync (${phaseOptions.length} phases, 1 year)`
              : `Start Deep History Sync (${selectedPhases.size} phase${selectedPhases.size === 1 ? "" : "s"}, 1 year)`}
          {:else}
            {isFullSync
              ? `Start Full Sync (${phaseOptions.length} phases)`
              : `Start Sync (${selectedPhases.size} phase${selectedPhases.size === 1 ? "" : "s"})`}
          {/if}
        </Button>
      </div>
    {/if}

    <!-- Footer hint -->
    <div class="pt-4 border-t border-black-800">
      <p class="text-xs text-center text-black-500">
        <kbd
          class="px-1.5 py-0.5 rounded border bg-black-800 border-black-700 text-black-300"
          >Esc</kbd
        >
        to close
        {#if !isSyncing}
          <span class="mx-1.5">·</span>
          <kbd
            class="px-1.5 py-0.5 rounded border bg-black-800 border-black-700 text-black-300"
            >Cmd+Enter</kbd
          >
          to start
        {/if}
      </p>
    </div>
  </div>
</Modal>

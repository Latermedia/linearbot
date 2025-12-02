<script lang="ts">
  import Modal from "$lib/components/Modal.svelte";
  import Button from "$lib/components/Button.svelte";
  import { csrfPost } from "$lib/utils/csrf";

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

  let isFullSync = $state(true);
  let selectedPhases = $state<Set<SyncPhase>>(
    new Set(phaseOptions.map((p) => p.phase))
  );
  let adminPassword = $state("");
  let isSubmitting = $state(false);
  let error = $state<string | null>(null);

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

      // Close modal on success
      onclose();
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
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      if (adminPassword && (isFullSync || selectedPhases.size > 0)) {
        handleSubmit();
      }
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<Modal title="Sync Options" {onclose} size="lg">
  <div class="space-y-6">
    <!-- Full Sync Toggle -->
    <div
      class="flex items-start gap-3 p-4 rounded-lg border border-neutral-700 bg-neutral-800/50 cursor-pointer hover:bg-neutral-800/70 transition-colors"
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
        class="mt-1 w-4 h-4 rounded border-neutral-600 bg-neutral-700 text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0 focus:ring-offset-neutral-900 pointer-events-none"
      />
      <div class="flex-1">
        <label
          for="fullSync"
          class="block text-sm font-medium text-white cursor-pointer"
        >
          Full Sync
        </label>
        <p class="mt-1 text-xs text-neutral-400">
          Run all sync phases ({phaseOptions.length} phases). Uncheck to select specific
          phases.
        </p>
      </div>
    </div>

    <!-- Phase Options -->
    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-medium text-white">Sync Phases</h3>
        {#if !isFullSync}
          <span class="text-xs text-neutral-400">
            {selectedPhases.size} of {phaseOptions.length} selected
          </span>
        {/if}
      </div>
      <div class="space-y-2 max-h-96 overflow-y-auto">
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
            role={isFullSync || isRequired ? undefined : "button"}
            tabindex={isFullSync || isRequired ? undefined : 0}
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
              class="mt-0.5 w-4 h-4 rounded border-neutral-600 bg-neutral-700 text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0 focus:ring-offset-neutral-900 disabled:opacity-50 disabled:cursor-not-allowed pointer-events-none"
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
              <p class="mt-1 text-xs text-neutral-400">{option.description}</p>
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
        class="w-full px-3 py-2 text-sm rounded-md border border-neutral-600 bg-neutral-800 text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        disabled={isSubmitting}
        autocomplete="current-password"
      />
    </div>

    <!-- Error Message -->
    {#if error}
      <div class="p-3 rounded-md bg-red-900/20 border border-red-800/50">
        <p class="text-sm text-red-400">{error}</p>
      </div>
    {/if}

    <!-- Actions -->
    <div class="flex justify-end gap-3 pt-2">
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
  </div>
</Modal>

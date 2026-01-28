<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { projectsStore } from "$lib/stores/database";
  import { presentationMode } from "$lib/stores/presentation";
  import Card from "$lib/components/Card.svelte";
  import { pageLoading } from "$lib/stores/page-loading";
  import Badge from "$lib/components/Badge.svelte";
  import InitiativesTable from "$lib/components/InitiativesTable.svelte";
  import InitiativeDetailModal from "$lib/components/InitiativeDetailModal.svelte";
  import {
    teamFilterStore,
    teamsMatchFullFilter,
  } from "$lib/stores/team-filter";

  interface InitiativeData {
    id: string;
    name: string;
    description: string | null;
    content: string | null;
    status: string | null;
    target_date: string | null;
    completed_at: string | null;
    started_at: string | null;
    archived_at: string | null;
    health: string | null;
    health_updated_at: string | null;
    health_updates: string | null;
    owner_id: string | null;
    owner_name: string | null;
    creator_id: string | null;
    creator_name: string | null;
    project_ids: string | null;
    created_at: string;
    updated_at: string;
  }

  // Initiative state
  let initiatives = $state<InitiativeData[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let selectedInitiative = $state<InitiativeData | null>(null);

  // Load initiatives
  async function loadInitiatives() {
    if (!browser) return;
    pageLoading.startLoading("/executive");
    try {
      loading = true;
      error = null;
      const response = await fetch("/api/initiatives");
      if (!response.ok) {
        throw new Error("Failed to fetch initiatives");
      }
      const data = await response.json();
      initiatives = data.initiatives || [];
    } catch (e) {
      error = e instanceof Error ? e.message : "Unknown error";
    } finally {
      loading = false;
      pageLoading.stopLoading("/executive");
    }
  }

  // Load data on mount
  onMount(() => {
    loadInitiatives();
  });

  // Secret executive view shortcut: Ctrl+Shift+E (Windows/Linux) or Cmd+Shift+E (Mac)
  $effect(() => {
    if (!browser) return;

    function handleKeydown(event: KeyboardEvent) {
      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const keyLower = event.key.toLowerCase();

      // Check for shortcut: Cmd+Shift+E (Mac) or Ctrl+Shift+E (Windows/Linux)
      const modifierPressed = isMac
        ? event.metaKey && event.shiftKey && !event.altKey && !event.ctrlKey
        : event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey;

      if (modifierPressed && keyLower === "e") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        presentationMode.set(false);
        goto("/");
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
      } as any);
    };
  });

  // Get projects store for team filtering
  const projects = $derived($projectsStore);

  // Get current team filter
  const filter = $derived($teamFilterStore);

  // Filter initiatives: [EXEC] in name + active (not archived, not completed)
  const executiveInitiatives = $derived.by(() => {
    if (!browser || initiatives.length === 0) return [];

    return initiatives
      .filter((initiative) => {
        // Check for [EXEC] in name
        const hasExecTag = initiative.name.includes("[EXEC]");

        // Check if active (not archived, not completed)
        const isActive = !initiative.archived_at && !initiative.completed_at;

        // Apply domain/team filter (check if any linked project matches filter)
        let matchesFilter = true;
        if (filter.domain !== null || filter.teamKey !== null) {
          let projectIds: string[] = [];
          try {
            projectIds = initiative.project_ids
              ? JSON.parse(initiative.project_ids)
              : [];
          } catch {
            return false;
          }

          matchesFilter = false;
          for (const projectId of projectIds) {
            const project = projects.get(projectId);
            if (project && teamsMatchFullFilter(project.teams, filter)) {
              matchesFilter = true;
              break;
            }
          }
        }

        return hasExecTag && isActive && matchesFilter;
      })
      .sort((a, b) => {
        // Sort by updated_at descending
        const aUpdated = new Date(a.updated_at).getTime();
        const bUpdated = new Date(b.updated_at).getTime();
        return bUpdated - aUpdated;
      });
  });

  function handleInitiativeClick(initiative: InitiativeData): void {
    selectedInitiative = initiative;
  }

  function closeModal(): void {
    selectedInitiative = null;
  }
</script>

<div class="space-y-6">
  <!-- Header -->
  <div>
    <h1 class="text-3xl font-bold text-black-900 dark:text-white">
      Executive Focus
    </h1>
    <div class="flex flex-wrap gap-x-2 gap-y-1 items-center mt-2">
      <p class="text-sm text-black-600 dark:text-black-400">
        High-level overview for initiatives with
      </p>
      <Badge variant="outline">[EXEC]</Badge>
      <p class="text-sm text-black-600 dark:text-black-400">in their name</p>
    </div>
  </div>

  <!-- Stats summary -->
  {#if !loading && !error && executiveInitiatives.length > 0}
    <div class="flex flex-wrap gap-4">
      <Card class="max-w-[200px]">
        <div class="mb-1 text-xs text-black-500 dark:text-black-300">
          Active Initiatives
        </div>
        <div class="text-2xl font-semibold text-black-900 dark:text-white">
          {executiveInitiatives.length}
        </div>
      </Card>
    </div>
  {/if}

  <!-- Main content -->
  {#if loading}
    <div class="py-24"></div>
  {:else if error}
    <Card class="border-danger-500/50">
      <div
        class="mb-3 text-sm font-medium text-danger-600 dark:text-danger-400"
      >
        Error Loading Data
      </div>
      <p class="mb-3 text-black-700 dark:text-black-400">{error}</p>
      <p class="text-sm text-black-600 dark:text-black-500">
        Make sure the database is synced. Run: <code
          class="px-2 py-1 font-mono text-xs rounded bg-ambient-700 dark:bg-black-800 text-black-700 dark:text-black-300"
          >bun run sync</code
        >
      </p>
    </Card>
  {:else if executiveInitiatives.length === 0}
    <Card>
      <div class="mb-3 text-sm font-medium text-black-900 dark:text-white">
        No Executive Initiatives Found
      </div>
      <p class="text-black-700 dark:text-black-400">
        No initiatives found with "[EXEC]" in their name that are currently
        active.
      </p>
    </Card>
  {:else}
    <Card class="p-0 overflow-hidden">
      <InitiativesTable
        initiatives={executiveInitiatives}
        onInitiativeClick={handleInitiativeClick}
      />
    </Card>
  {/if}
</div>

<!-- Initiative Detail Modal -->
{#if selectedInitiative}
  <InitiativeDetailModal initiative={selectedInitiative} onclose={closeModal} />
{/if}

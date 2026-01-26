<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import Card from "$lib/components/Card.svelte";
  import Skeleton from "$lib/components/Skeleton.svelte";
  import InitiativesTable from "$lib/components/InitiativesTable.svelte";
  import InitiativeDetailModal from "$lib/components/InitiativeDetailModal.svelte";
  import { projectsStore } from "$lib/stores/database";
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
    owner_id: string | null;
    owner_name: string | null;
    creator_id: string | null;
    creator_name: string | null;
    project_ids: string | null;
    created_at: string;
    updated_at: string;
  }

  let initiatives = $state<InitiativeData[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let selectedInitiative = $state<InitiativeData | null>(null);

  async function loadInitiatives() {
    if (!browser) return;
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
    }
  }

  onMount(() => {
    loadInitiatives();
  });

  function handleInitiativeClick(initiative: InitiativeData): void {
    selectedInitiative = initiative;
  }

  function closeModal(): void {
    selectedInitiative = null;
  }

  // Get stores
  const projects = $derived($projectsStore);
  const filter = $derived($teamFilterStore);

  // Filter initiatives by team
  const filteredInitiatives = $derived.by(() => {
    let filtered = initiatives;

    // Filter by domain/team (check if any linked project matches the filter)
    if (filter.domain !== null || filter.teamKey !== null) {
      filtered = filtered.filter((initiative) => {
        let projectIds: string[] = [];
        try {
          projectIds = initiative.project_ids
            ? JSON.parse(initiative.project_ids)
            : [];
        } catch {
          return false;
        }

        for (const projectId of projectIds) {
          const project = projects.get(projectId);
          if (project && teamsMatchFullFilter(project.teams, filter)) {
            return true;
          }
        }
        return false;
      });
    }

    return filtered;
  });

  // Computed stats
  const totalInitiatives = $derived(filteredInitiatives.length);
  const activeInitiatives = $derived(
    filteredInitiatives.filter((i) => !i.archived_at && !i.completed_at).length
  );
  const completedInitiatives = $derived(
    filteredInitiatives.filter((i) => i.completed_at !== null).length
  );
  const initiativesWithProjects = $derived(
    filteredInitiatives.filter((i) => {
      try {
        const projectIds = i.project_ids ? JSON.parse(i.project_ids) : [];
        return Array.isArray(projectIds) && projectIds.length > 0;
      } catch {
        return false;
      }
    }).length
  );

  // Sort initiatives: active first, then by updated_at descending
  const sortedInitiatives = $derived.by(() => {
    return [...filteredInitiatives].sort((a, b) => {
      const aActive = !a.archived_at && !a.completed_at;
      const bActive = !b.archived_at && !b.completed_at;
      if (aActive !== bActive) {
        return aActive ? -1 : 1;
      }
      const aUpdated = new Date(a.updated_at).getTime();
      const bUpdated = new Date(b.updated_at).getTime();
      return bUpdated - aUpdated;
    });
  });
</script>

<div class="space-y-6">
  <!-- Stats summary -->
  {#if !loading && !error && filteredInitiatives.length > 0}
    <div class="flex flex-wrap gap-4">
      <Card class="max-w-[180px]">
        <div class="mb-1 text-xs text-neutral-500 dark:text-neutral-300">
          Total Initiatives
        </div>
        <div class="text-2xl font-semibold text-neutral-900 dark:text-white">
          {totalInitiatives}
        </div>
        <div class="text-xs text-neutral-500">in Linear</div>
      </Card>
      <Card class="max-w-[180px]">
        <div class="mb-1 text-xs text-neutral-500 dark:text-neutral-300">
          Active
        </div>
        <div class="text-2xl font-semibold text-neutral-900 dark:text-white">
          {activeInitiatives}
        </div>
        <div class="text-xs text-neutral-500">in progress</div>
      </Card>
      <Card class="max-w-[180px]">
        <div class="mb-1 text-xs text-neutral-500 dark:text-neutral-300">
          Completed
        </div>
        <div class="text-2xl font-semibold text-neutral-900 dark:text-white">
          {completedInitiatives}
        </div>
        <div class="text-xs text-neutral-500">finished</div>
      </Card>
      <Card class="max-w-[180px]">
        <div class="mb-1 text-xs text-neutral-500 dark:text-neutral-300">
          With Projects
        </div>
        <div class="text-2xl font-semibold text-neutral-900 dark:text-white">
          {initiativesWithProjects}
        </div>
        <div class="text-xs text-neutral-500">linked to projects</div>
      </Card>
    </div>
  {/if}

  <!-- Main content -->
  {#if loading}
    <Card>
      <Skeleton class="mb-4 w-48 h-8" />
      <div class="space-y-3">
        <Skeleton class="w-full h-12" />
        <Skeleton class="w-full h-12" />
        <Skeleton class="w-full h-12" />
        <Skeleton class="w-full h-12" />
      </div>
    </Card>
  {:else if error}
    <Card class="border-red-500/50">
      <div class="mb-3 text-sm font-medium text-red-600 dark:text-red-400">
        Error Loading Data
      </div>
      <p class="mb-3 text-neutral-700 dark:text-neutral-400">{error}</p>
      <p class="text-sm text-neutral-600 dark:text-neutral-500">
        Make sure the database is synced. Run: <code
          class="px-2 py-1 font-mono text-xs rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300"
          >bun run sync</code
        >
      </p>
    </Card>
  {:else if filteredInitiatives.length === 0}
    <Card>
      <div class="mb-3 text-sm font-medium text-neutral-900 dark:text-white">
        {filter.domain || filter.teamKey
          ? "No Initiatives for Selected Filter"
          : "No Initiatives Found"}
      </div>
      <p class="text-neutral-700 dark:text-neutral-400">
        {filter.domain || filter.teamKey
          ? "No initiatives have projects linked to the selected domain/team."
          : "No initiatives found in the database. Sync the database to load data from Linear."}
      </p>
    </Card>
  {:else}
    <Card class="p-0 overflow-hidden">
      <InitiativesTable
        initiatives={sortedInitiatives}
        onInitiativeClick={handleInitiativeClick}
      />
    </Card>
  {/if}
</div>

<!-- Initiative Detail Modal -->
{#if selectedInitiative}
  <InitiativeDetailModal initiative={selectedInitiative} onclose={closeModal} />
{/if}

<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import {
    databaseStore,
    teamsStore,
    domainsStore,
    projectsStore,
  } from "$lib/stores/database";
  import ProjectsTable from "$lib/components/ProjectsTable.svelte";
  import RefreshButton from "$lib/components/RefreshButton.svelte";
  import * as ToggleGroup from "$lib/components/ui/toggle-group";
  import Card from "$lib/components/ui/card.svelte";
  import Skeleton from "$lib/components/ui/skeleton.svelte";
  import Separator from "$lib/components/ui/separator.svelte";

  let groupBy: "team" | "domain" = "team";

  // Initialize with default values for SSR
  let loading = true;
  let error: string | null = null;
  let lastSync: Date | null = null;
  let teams: any[] = [];
  let domains: any[] = [];
  let projects: Map<string, any> = new Map();

  // Only load data in browser
  onMount(() => {
    if (browser) {
      databaseStore.load();
    }
  });

  // Subscribe to stores only in browser
  $: if (browser) {
    ({ loading, error, lastSync } = $databaseStore);
    teams = $teamsStore;
    domains = $domainsStore;
    projects = $projectsStore;
  }
</script>

<div class="space-y-6">
  <!-- Header with controls -->
  <div
    class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
  >
    <div>
      <h2 class="text-xl font-semibold tracking-tight text-white">
        Project Timeline
      </h2>
      <p class="text-neutral-400 text-sm mt-1">
        View active projects across teams and domains
      </p>
    </div>
    <RefreshButton {lastSync} />
  </div>

  <!-- Stats summary -->
  {#if !loading && !error && teams.length > 0}
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card>
        <div class="text-xs text-neutral-500 mb-1">Total Teams</div>
        <div class="text-2xl font-semibold text-white">{teams.length}</div>
      </Card>
      <Card>
        <div class="text-xs text-neutral-500 mb-1">Active Projects</div>
        <div class="text-2xl font-semibold text-white">
          {projects.size}
        </div>
      </Card>
      <Card>
        <div class="text-xs text-neutral-500 mb-1">Domains</div>
        <div class="text-2xl font-semibold text-white">{domains.length}</div>
      </Card>
    </div>
  {/if}

  <Separator />

  <!-- Group by toggle -->
  <ToggleGroup.Root bind:value={groupBy} variant="outline" type="single">
    <ToggleGroup.Item value="team" aria-label="Group by teams">
      Teams
    </ToggleGroup.Item>
    <ToggleGroup.Item value="domain" aria-label="Group by domains">
      Domains
    </ToggleGroup.Item>
  </ToggleGroup.Root>

  <!-- Main content -->
  {#if loading}
    <div class="space-y-4">
      <Card>
        <Skeleton class="h-8 w-48 mb-4" />
        <div class="space-y-3">
          <Skeleton class="h-12 w-full" />
          <Skeleton class="h-12 w-full" />
          <Skeleton class="h-12 w-full" />
          <Skeleton class="h-12 w-full" />
        </div>
      </Card>
    </div>
  {:else if error}
    <Card class="border-red-500/50">
      <div class="text-sm font-medium text-red-400 mb-3">
        Error Loading Data
      </div>
      <p class="text-neutral-400 mb-3">{error}</p>
      <p class="text-sm text-neutral-500">
        Make sure the database is synced. Run: <code
          class="bg-neutral-800 px-2 py-1 rounded font-mono text-xs text-neutral-300"
          >bun run sync</code
        >
      </p>
    </Card>
  {:else if teams.length === 0}
    <Card>
      <div class="text-sm font-medium text-white mb-3">No Projects Found</div>
      <p class="text-neutral-400">
        No active projects with started issues. Sync your Linear data to see
        projects.
      </p>
    </Card>
  {:else}
    <ProjectsTable {teams} {domains} {groupBy} />
  {/if}
</div>

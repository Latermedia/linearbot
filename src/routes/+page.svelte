<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import {
    databaseStore,
    teamsStore,
    domainsStore,
    projectsStore,
  } from "$lib/stores/database";
  import { presentationMode } from "$lib/stores/presentation";
  import ProjectsTable from "$lib/components/ProjectsTable.svelte";
  import GanttChart from "$lib/components/GanttChart.svelte";
  import * as ToggleGroup from "$lib/components/ui/toggle-group";
  import Card from "$lib/components/ui/card.svelte";
  import Skeleton from "$lib/components/ui/skeleton.svelte";

  let groupBy = $state<"team" | "domain">("team");
  let viewType = $state<"table" | "gantt">("table");

  // Load data on mount
  onMount(() => {
    databaseStore.load();
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
        presentationMode.set(true);
        goto("/executive");
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

  // Subscribe to stores (stores handle browser checks internally)
  // In runes mode, access stores in reactive contexts
  // Use $derived to create reactive values from stores
  const loading = $derived($databaseStore.loading);
  const error = $derived($databaseStore.error);
  const lastSync = $derived($databaseStore.lastSync);

  // Create reactive derived values from stores
  // This ensures they update when stores change
  const teams = $derived.by(() => {
    const t = $teamsStore;
    console.log(
      "[+page.svelte] teams derived - length:",
      t.length,
      "teams:",
      t.map((team) => ({ name: team.teamName, projects: team.projects.length }))
    );
    return t;
  });
  const domains = $derived.by(() => {
    const d = $domainsStore;
    console.log("[+page.svelte] domains derived - length:", d.length);
    return d;
  });
  const projects = $derived.by(() => {
    const p = $projectsStore;
    console.log("[+page.svelte] projects derived - size:", p.size);
    return p;
  });

  // Calculate health metrics
  const staleProjectsCount = $derived(
    projects.size > 0
      ? Array.from(projects.values()).filter((p) => p.isStaleUpdate).length
      : 0
  );
  const mismatchedStatusCount = $derived(
    projects.size > 0
      ? Array.from(projects.values()).filter((p) => p.hasStatusMismatch).length
      : 0
  );
  const missingLeadCount = $derived(
    projects.size > 0
      ? Array.from(projects.values()).filter((p) => p.missingLead).length
      : 0
  );
</script>

<div class="space-y-6">
  <!-- Stats summary -->
  {#if !loading && !error && teams.length > 0}
    <div class="flex flex-wrap gap-4">
      <Card class="max-w-[200px]">
        <div class="mb-1 text-xs text-neutral-500 dark:text-neutral-300">
          Total Teams
        </div>
        <div class="text-2xl font-semibold text-neutral-900 dark:text-white">
          {teams.length}
        </div>
      </Card>
      <Card class="max-w-[200px]">
        <div class="mb-1 text-xs text-neutral-500 dark:text-neutral-300">
          Active Projects
        </div>
        <div class="text-2xl font-semibold text-neutral-900 dark:text-white">
          {projects.size}
        </div>
      </Card>
      <Card class="max-w-[200px]">
        <div class="mb-1 text-xs text-neutral-500 dark:text-neutral-300">
          Average Projects/Team
        </div>
        <div class="text-2xl font-semibold text-neutral-900 dark:text-white">
          {(projects.size / teams.length).toFixed(2)}
        </div>
      </Card>
      <Card class="max-w-[200px]">
        <div class="mb-1 text-xs text-neutral-500 dark:text-neutral-300">
          Missing Updates
        </div>
        <div class="text-2xl font-semibold text-neutral-900 dark:text-white">
          {staleProjectsCount}
        </div>
      </Card>
      <Card class="max-w-[200px]">
        <div class="mb-1 text-xs text-neutral-500 dark:text-neutral-300">
          Status Mismatches
        </div>
        <div class="text-2xl font-semibold text-neutral-900 dark:text-white">
          {mismatchedStatusCount}
        </div>
      </Card>
      <Card class="max-w-[200px]">
        <div class="mb-1 text-xs text-neutral-500 dark:text-neutral-300">
          Missing Leads
        </div>
        <div class="text-2xl font-semibold text-neutral-900 dark:text-white">
          {missingLeadCount}
        </div>
      </Card>
    </div>
  {/if}

  <!-- Sticky controls wrapper -->
  <div
    class="sticky top-[60px] z-30 backdrop-blur-sm bg-white/95 dark:bg-neutral-950/95 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pt-1 -mt-1"
  >
    <!-- View controls -->
    <div
      class="flex flex-col gap-4 items-start py-2 sm:flex-row sm:items-center"
    >
      <!-- View type toggle -->
      <ToggleGroup.Root bind:value={viewType} variant="outline" type="single">
        <ToggleGroup.Item value="table" aria-label="Table view">
          Table
        </ToggleGroup.Item>
        <ToggleGroup.Item value="gantt" aria-label="Gantt view">
          Gantt
        </ToggleGroup.Item>
      </ToggleGroup.Root>

      <!-- Group by toggle -->
      <ToggleGroup.Root bind:value={groupBy} variant="outline" type="single">
        <ToggleGroup.Item value="team" aria-label="Group by teams">
          Teams
        </ToggleGroup.Item>
        <ToggleGroup.Item value="domain" aria-label="Group by domains">
          Domains
        </ToggleGroup.Item>
      </ToggleGroup.Root>
    </div>
  </div>

  <!-- Main content -->
  {#if loading}
    <div class="space-y-4">
      <Card>
        <Skeleton class="mb-4 w-48 h-8" />
        <div class="space-y-3">
          <Skeleton class="w-full h-12" />
          <Skeleton class="w-full h-12" />
          <Skeleton class="w-full h-12" />
          <Skeleton class="w-full h-12" />
        </div>
      </Card>
    </div>
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
  {:else if teams.length === 0}
    <Card>
      <div class="mb-3 text-sm font-medium text-neutral-900 dark:text-white">
        No Projects Found
      </div>
      <p class="text-neutral-700 dark:text-neutral-400">
        No active projects with started issues. Sync your Linear data to see
        projects.
      </p>
    </Card>
  {:else if viewType === "table"}
    <ProjectsTable {teams} {domains} {groupBy} />
  {:else}
    <GanttChart {teams} {domains} {groupBy} />
  {/if}
</div>

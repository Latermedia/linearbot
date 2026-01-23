<script lang="ts">
  import { domainsStore } from "$lib/stores/database";
  import { teamFilterStore, hasActiveFilter } from "$lib/stores/team-filter";
  import { ChevronDown, X } from "lucide-svelte";

  // Get domains with teams for grouping
  const domains = $derived($domainsStore);
  const filter = $derived($teamFilterStore);
  const isFilterActive = $derived($hasActiveFilter);

  // Handle team select change
  function handleTeamChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    const value = target.value;
    teamFilterStore.setTeam(value === "" ? null : value);
  }

  // Handle reset
  function handleReset() {
    teamFilterStore.clear();
  }
</script>

<div class="flex items-center gap-2">
  <div class="relative inline-flex">
    <select
      value={filter.teamKey ?? ""}
      onchange={handleTeamChange}
      class="appearance-none bg-neutral-100 dark:bg-white/5 text-neutral-900 dark:text-white text-sm font-medium rounded-md pl-3 pr-8 py-1.5 cursor-pointer hover:bg-neutral-200 dark:hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/50 min-w-[180px]"
      aria-label="Filter by team"
    >
      <option value="">All Teams</option>
      {#each domains as domain (domain.domainName)}
        {#if domain.teams.length > 0}
          <optgroup label={domain.domainName}>
            {#each domain.teams as team (team.teamKey)}
              <option value={team.teamKey}>{team.teamName}</option>
            {/each}
          </optgroup>
        {/if}
      {/each}
    </select>
    <ChevronDown
      class="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500 dark:text-neutral-400 pointer-events-none"
    />
  </div>

  {#if isFilterActive}
    <button
      type="button"
      onclick={handleReset}
      class="inline-flex items-center gap-1 px-2 py-1.5 text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-white rounded hover:bg-neutral-200 dark:hover:bg-white/10 transition-colors cursor-pointer"
      title="Reset filter"
    >
      <X class="w-3 h-3" />
      Reset
    </button>
  {/if}
</div>

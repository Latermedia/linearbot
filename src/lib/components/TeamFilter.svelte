<script lang="ts">
  import { teamsStore } from "$lib/stores/database";
  import { teamFilterStore } from "$lib/stores/team-filter";
  import { ChevronDown } from "lucide-svelte";

  // Get sorted teams from teamsStore
  const sortedTeams = $derived.by(() => {
    const teams = $teamsStore;
    if (!teams || teams.length === 0) return [];
    // Sort alphabetically by team name
    return [...teams].sort((a, b) => a.teamName.localeCompare(b.teamName));
  });

  // Current filter value
  const selectedTeamKey = $derived($teamFilterStore);

  // Handle select change
  function handleChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    const value = target.value;
    teamFilterStore.set(value === "" ? null : value);
  }
</script>

<div class="relative inline-flex">
  <select
    value={selectedTeamKey ?? ""}
    onchange={handleChange}
    class="appearance-none bg-neutral-100 dark:bg-white/5 text-neutral-900 dark:text-white text-sm font-medium rounded-md pl-3 pr-8 py-1.5 cursor-pointer hover:bg-neutral-200 dark:hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/50 min-w-[140px]"
    aria-label="Filter by team"
  >
    <option value="">All Teams</option>
    {#each sortedTeams as team (team.teamKey)}
      <option value={team.teamKey}>{team.teamName}</option>
    {/each}
  </select>
  <ChevronDown
    class="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500 dark:text-neutral-400 pointer-events-none"
  />
</div>

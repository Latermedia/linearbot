<script lang="ts">
  import { sidebarCollapsed } from "$lib/stores/sidebar";
  import { teamFilterStore } from "$lib/stores/team-filter";
  import { teamsStore } from "$lib/stores/database";
  import { ChevronDown, Users } from "lucide-svelte";

  const isCollapsed = $derived($sidebarCollapsed);
  const teams = $derived($teamsStore);
  const selectedTeamKey = $derived($teamFilterStore);

  // Find the selected team name
  const selectedTeamName = $derived.by(() => {
    if (!selectedTeamKey) return "All Teams";
    const team = teams.find((t) => t.teamKey === selectedTeamKey);
    return team?.teamName || selectedTeamKey;
  });

  let isOpen = $state(false);

  function handleSelect(teamKey: string | null) {
    teamFilterStore.set(teamKey);
    isOpen = false;
  }

  function toggleDropdown() {
    isOpen = !isOpen;
  }

  // Close dropdown when clicking outside
  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest("[data-team-filter]")) {
      isOpen = false;
    }
  }

  $effect(() => {
    if (isOpen) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  });
</script>

<div class="relative" data-team-filter>
  <button
    type="button"
    onclick={toggleDropdown}
    class="w-full flex items-center gap-2 px-3 py-2 text-sm rounded transition-colors duration-150 cursor-pointer
      text-neutral-400 hover:text-white hover:bg-white/5
      {isCollapsed ? 'justify-center' : ''}"
    title={isCollapsed ? `Team: ${selectedTeamName}` : undefined}
  >
    <Users class="w-4 h-4 shrink-0" />
    {#if !isCollapsed}
      <span class="flex-1 text-left truncate text-neutral-300">
        {selectedTeamName}
      </span>
      <ChevronDown
        class="w-4 h-4 shrink-0 transition-transform duration-150 {isOpen
          ? 'rotate-180'
          : ''}"
      />
    {/if}
  </button>

  <!-- Dropdown -->
  {#if isOpen}
    <div
      class="absolute top-full mt-1 {isCollapsed
        ? 'left-full ml-2 -mt-10'
        : 'left-0 right-0'} 
        min-w-[180px] max-h-64 overflow-y-auto
        bg-neutral-900 border border-white/10 rounded shadow-xl z-50"
    >
      <div class="py-1">
        <button
          type="button"
          onclick={() => handleSelect(null)}
          class="w-full px-3 py-2 text-left text-sm transition-colors duration-150 cursor-pointer
            {selectedTeamKey === null
            ? 'text-white bg-white/10'
            : 'text-neutral-400 hover:text-white hover:bg-white/5'}"
        >
          All Teams
        </button>
        {#each teams as team (team.teamKey)}
          <button
            type="button"
            onclick={() => handleSelect(team.teamKey)}
            class="w-full px-3 py-2 text-left text-sm transition-colors duration-150 cursor-pointer
              {selectedTeamKey === team.teamKey
              ? 'text-white bg-white/10'
              : 'text-neutral-400 hover:text-white hover:bg-white/5'}"
          >
            {team.teamName}
          </button>
        {/each}
      </div>
    </div>
  {/if}
</div>

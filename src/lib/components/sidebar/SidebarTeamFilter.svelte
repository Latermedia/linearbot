<script lang="ts">
  import { sidebarCollapsed } from "$lib/stores/sidebar";
  import { teamFilterStore, hasActiveFilter } from "$lib/stores/team-filter";
  import { domainsStore } from "$lib/stores/database";
  import { ChevronDown, Users, X, Building2 } from "lucide-svelte";

  const isCollapsed = $derived($sidebarCollapsed);
  const domains = $derived($domainsStore);
  const filter = $derived($teamFilterStore);
  const isFilterActive = $derived($hasActiveFilter);

  // Get display text for the current filter state
  const filterDisplayText = $derived.by(() => {
    if (filter.teamKey) {
      // Find team name from domains
      for (const domain of domains) {
        const team = domain.teams.find((t) => t.teamKey === filter.teamKey);
        if (team) return team.teamName;
      }
      return filter.teamKey;
    }
    if (filter.domain) {
      return filter.domain;
    }
    return "All Teams";
  });

  // Filter teams based on selected domain
  const filteredDomains = $derived.by(() => {
    if (filter.domain) {
      return domains.filter((d) => d.domainName === filter.domain);
    }
    return domains;
  });

  let isOpen = $state(false);

  function handleSelectDomain(domain: string | null) {
    teamFilterStore.setDomain(domain);
    isOpen = false;
  }

  function handleSelectTeam(teamKey: string) {
    teamFilterStore.setTeam(teamKey);
    isOpen = false;
  }

  function handleReset() {
    teamFilterStore.clear();
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
  <div
    class="w-full flex items-center gap-2 px-3 py-2 text-sm rounded transition-colors duration-150
      text-black-600 dark:text-black-400 hover:text-black-900 dark:hover:text-white hover:bg-ambient-700 dark:hover:bg-white/5 overflow-hidden
      {isCollapsed ? 'justify-center' : ''}"
  >
    <button
      type="button"
      onclick={toggleDropdown}
      class="flex-1 min-w-0 flex items-center gap-2 cursor-pointer"
      title={filterDisplayText}
    >
      <Users class="w-4 h-4 shrink-0" />
      {#if !isCollapsed}
        <span
          class="flex-1 min-w-0 text-left truncate text-black-700 dark:text-black-300"
        >
          {filterDisplayText}
        </span>
        <ChevronDown
          class="w-4 h-4 shrink-0 transition-transform duration-150 {isOpen
            ? 'rotate-180'
            : ''}"
        />
      {/if}
    </button>
    {#if !isCollapsed && isFilterActive}
      <button
        type="button"
        onclick={(e) => {
          e.stopPropagation();
          handleReset();
        }}
        class="p-0.5 shrink-0 rounded hover:bg-black-200 dark:hover:bg-white/10 text-black-500 dark:text-black-400 hover:text-black-900 dark:hover:text-white cursor-pointer"
        title="Clear filter"
      >
        <X class="w-3 h-3" />
      </button>
    {/if}
  </div>

  <!-- Dropdown -->
  {#if isOpen}
    <div
      class="absolute top-full mt-1 {isCollapsed
        ? 'left-full ml-2 -mt-10'
        : 'left-0 right-0'} 
        min-w-[220px] max-h-80 overflow-y-auto
        bg-ambient-300 dark:bg-black-900 border border-black-200 dark:border-white/10 rounded shadow-xl z-50"
    >
      <div class="py-1">
        <!-- Domain filter section -->
        <div
          class="px-3 py-1.5 text-xs font-medium text-black-500 uppercase tracking-wide flex items-center gap-1.5"
        >
          <Building2 class="w-3 h-3" />
          Domains
        </div>

        <button
          type="button"
          onclick={() => handleSelectDomain(null)}
          class="w-full px-3 py-2 text-left text-sm transition-colors duration-150 cursor-pointer
            {filter.domain === null && filter.teamKey === null
            ? 'text-black-900 dark:text-white bg-ambient-700 dark:bg-white/10'
            : 'text-black-600 dark:text-black-400 hover:text-black-900 dark:hover:text-white hover:bg-ambient-600 dark:hover:bg-white/5'}"
        >
          All Domains
        </button>

        {#each domains as domain (domain.domainName)}
          <button
            type="button"
            onclick={() => handleSelectDomain(domain.domainName)}
            class="w-full px-3 py-2 text-left text-sm transition-colors duration-150 cursor-pointer
              {filter.domain === domain.domainName && filter.teamKey === null
              ? 'text-black-900 dark:text-white bg-black-100 dark:bg-white/10'
              : 'text-black-600 dark:text-black-400 hover:text-black-900 dark:hover:text-white hover:bg-black-50 dark:hover:bg-white/5'}"
          >
            {domain.domainName}
          </button>
        {/each}

        <!-- Teams section - grouped by domain -->
        <div class="border-t border-black-200 dark:border-white/10 mt-1 pt-1">
          <div
            class="px-3 py-1.5 text-xs font-medium text-black-500 uppercase tracking-wide flex items-center gap-1.5"
          >
            <Users class="w-3 h-3" />
            Teams
          </div>

          {#each filteredDomains as domain (domain.domainName)}
            {#if domain.teams.length > 0}
              <!-- Domain group header -->
              <div
                class="px-3 py-1 text-xs text-black-500 bg-ambient-600 dark:bg-white/2"
              >
                {domain.domainName}
              </div>

              {#each domain.teams as team (team.teamKey)}
                <button
                  type="button"
                  onclick={() => handleSelectTeam(team.teamKey)}
                  class="w-full px-3 py-2 pl-5 text-left text-sm transition-colors duration-150 cursor-pointer
                    {filter.teamKey === team.teamKey
                    ? 'text-black-900 dark:text-white bg-black-100 dark:bg-white/10'
                    : 'text-black-600 dark:text-black-400 hover:text-black-900 dark:hover:text-white hover:bg-black-50 dark:hover:bg-white/5'}"
                >
                  {team.teamName}
                </button>
              {/each}
            {/if}
          {/each}
        </div>
      </div>
    </div>
  {/if}
</div>

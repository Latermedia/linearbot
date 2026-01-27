<script lang="ts">
  import { tick } from "svelte";
  import { slide, fade, scale } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import { sidebarCollapsed } from "$lib/stores/sidebar";
  import { teamFilterStore, hasActiveFilter } from "$lib/stores/team-filter";
  import { domainsStore } from "$lib/stores/database";
  import { ChevronDown, ListFilter, Building2, Users } from "lucide-svelte";

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

  let isOpen = $state(false);
  let dropdownRef: HTMLDivElement | null = $state(null);

  function handleSelectDomain(domain: string | null) {
    teamFilterStore.setDomain(domain);
    isOpen = false;
  }

  function handleSelectTeam(teamKey: string) {
    teamFilterStore.setTeam(teamKey);
    isOpen = false;
  }

  async function toggleDropdown() {
    isOpen = !isOpen;

    // Scroll to selected item when opening
    if (isOpen && (filter.teamKey || filter.domain)) {
      await tick();
      const selectedEl = dropdownRef?.querySelector('[data-selected="true"]');
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
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

<div class="relative group" data-team-filter>
  <!-- Hover indicator (matches nav item styling) -->
  <div
    class="absolute inset-y-0 left-2 right-2 rounded-md bg-ambient-700 dark:bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-150 -z-10"
    aria-hidden="true"
  ></div>
  <div
    class="relative z-10 w-full flex items-center py-2 text-sm rounded transition-colors duration-150
      text-black-600 dark:text-black-400 hover:text-black-900 dark:hover:text-white overflow-hidden"
  >
    <button
      type="button"
      onclick={toggleDropdown}
      class="flex items-center cursor-pointer flex-1 min-w-0 pr-3"
      title={filterDisplayText}
    >
      <div class="w-16 flex justify-center shrink-0 relative">
        <ListFilter class="w-5 h-5" />
        {#if isCollapsed && isFilterActive}
          <div
            in:scale={{ duration: 200, start: 0.5, easing: cubicOut }}
            out:scale={{ duration: 150, start: 0.5, easing: cubicOut }}
            class="filter-dot absolute top-0 right-4 w-2 h-2 bg-black-400 dark:bg-black-400 rounded-full"
            aria-label="Filter active"
          ></div>
        {/if}
      </div>
      <div
        class="flex-1 min-w-0 flex items-center gap-2 overflow-hidden transition-all duration-250 ease-quart-out"
        style="width: {isCollapsed ? '0' : '152px'}; opacity: {isCollapsed
          ? 0
          : 1}"
      >
        <span
          class="flex-1 min-w-0 text-left truncate text-black-700 dark:text-black-300 whitespace-nowrap"
        >
          {filterDisplayText}
        </span>
        <ChevronDown
          class="w-4 h-4 shrink-0 transition-transform duration-150 {isOpen
            ? 'rotate-180'
            : ''}"
        />
      </div>
    </button>
  </div>

  <!-- Tooltip when collapsed -->
  {#if isCollapsed}
    <div
      class="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 text-xs font-medium text-white bg-black-800 rounded shadow-lg
        opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 whitespace-nowrap z-50"
    >
      {filterDisplayText}
    </div>
  {/if}

  <!-- Dropdown -->
  {#if isOpen}
    <div
      bind:this={dropdownRef}
      transition:slide={{ duration: 200, easing: cubicOut }}
      class="absolute top-full mt-1 {isCollapsed
        ? 'left-full ml-2 -mt-10'
        : 'left-0 right-0'} 
        min-w-[220px] max-h-80 overflow-y-auto overflow-x-hidden
        bg-ambient-300 dark:bg-black-900 border border-black-200 dark:border-white/10 rounded-md shadow-xl z-50"
    >
      <div class="py-1" transition:fade={{ duration: 150, delay: 50 }}>
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
          data-selected={filter.domain === null && filter.teamKey === null}
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
            data-selected={filter.domain === domain.domainName &&
              filter.teamKey === null}
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

          {#each domains as domain (domain.domainName)}
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
                  data-selected={filter.teamKey === team.teamKey}
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

<style>
  .duration-250 {
    transition-duration: 250ms;
  }
  .ease-quart-out {
    transition-timing-function: cubic-bezier(0.25, 1, 0.5, 1);
  }

  /* Blur poof animation for filter dot */
  .filter-dot {
    animation: blur-poof-in 0.2s cubic-bezier(0.25, 1, 0.5, 1) forwards;
  }

  @keyframes blur-poof-in {
    0% {
      opacity: 0;
      filter: blur(4px);
      transform: scale(0.5);
    }
    100% {
      opacity: 1;
      filter: blur(0);
      transform: scale(1);
    }
  }
</style>

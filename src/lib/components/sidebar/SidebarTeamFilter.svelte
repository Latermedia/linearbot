<script lang="ts">
  import { tick } from "svelte";
  import { scale } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import { browser } from "$app/environment";
  import { sidebarCollapsed } from "$lib/stores/sidebar";
  import { teamFilterStore, hasActiveFilter } from "$lib/stores/team-filter";
  import { domainsStore } from "$lib/stores/database";
  import { ListFilter } from "lucide-svelte";

  // Detect Mac vs Windows/Linux for keyboard shortcuts
  const isMac = browser
    ? navigator.platform.toUpperCase().includes("MAC")
    : true;

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
  let buttonRef: HTMLButtonElement | null = $state(null);

  // Position for the fixed dropdown (when collapsed)
  let dropdownPosition = $state({ top: 0, left: 0 });

  function handleSelectDomain(domain: string | null) {
    teamFilterStore.setDomain(domain);
    isOpen = false;
  }

  function handleSelectTeam(teamKey: string) {
    teamFilterStore.setTeam(teamKey);
    isOpen = false;
  }

  function handleClearFilter() {
    teamFilterStore.clear();
    isOpen = false;
  }

  function updateDropdownPosition() {
    if (!buttonRef || !browser) return;
    const rect = buttonRef.getBoundingClientRect();
    // Always position to the right of the button
    dropdownPosition = {
      top: rect.top,
      left: rect.right + 8, // 8px gap
    };
  }

  async function toggleDropdown() {
    if (!isOpen) {
      updateDropdownPosition();
    }
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
    if (
      !target.closest("[data-team-filter]") &&
      !target.closest("[data-team-filter-portal]")
    ) {
      isOpen = false;
    }
  }

  // Handle keyboard shortcuts
  function handleKeydown(event: KeyboardEvent) {
    // Cmd/Ctrl + Shift + X to clear filter (when filter is active)
    if (
      event.key.toLowerCase() === "x" &&
      event.shiftKey &&
      (event.metaKey || event.ctrlKey) &&
      isFilterActive
    ) {
      event.preventDefault();
      handleClearFilter();
    }
  }

  $effect(() => {
    if (isOpen) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  });

  $effect(() => {
    if (browser) {
      document.addEventListener("keydown", handleKeydown);
      return () => document.removeEventListener("keydown", handleKeydown);
    }
  });

  // Close dropdown when sidebar collapse state changes
  let prevCollapsed: boolean | null = $state(null);
  $effect(() => {
    if (prevCollapsed !== null && isCollapsed !== prevCollapsed) {
      if (isOpen) {
        isOpen = false;
      }
    }
    prevCollapsed = isCollapsed;
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
      bind:this={buttonRef}
      type="button"
      onclick={toggleDropdown}
      class="flex items-center cursor-pointer flex-1 min-w-0"
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
        class="sidebar-text overflow-hidden text-left"
        style="width: {isCollapsed ? '0' : '176px'}; opacity: {isCollapsed
          ? 0
          : 1}; filter: blur({isCollapsed ? '8px' : '0'})"
      >
        <span class="block truncate">{filterDisplayText}</span>
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
</div>

<!-- Fixed dropdown (portal style) -->
{#if isOpen}
  <div
    bind:this={dropdownRef}
    data-team-filter-portal
    transition:scale={{ duration: 150, start: 0.95, easing: cubicOut }}
    class="fixed flex flex-col
      bg-ambient-300 dark:bg-black-900 border border-black-200 dark:border-white/10 rounded-md shadow-xl z-9999"
    style="top: {dropdownPosition.top}px; left: {dropdownPosition.left}px; width: {isCollapsed
      ? '200px'
      : '260px'};"
  >
    {@render dropdownContent()}
  </div>
{/if}

{#snippet dropdownContent()}
  <!-- Scrollable content area -->
  <div class="py-1 max-h-64 overflow-y-auto overflow-x-hidden">
    <!-- All Teams option -->
    <button
      type="button"
      onclick={() => handleSelectDomain(null)}
      data-selected={filter.domain === null && filter.teamKey === null}
      class="w-full px-3 py-1.5 text-left text-sm font-medium truncate transition-colors duration-150 cursor-pointer
        {filter.domain === null && filter.teamKey === null
        ? 'text-black-900 dark:text-white bg-ambient-700 dark:bg-white/10'
        : 'text-black-600 dark:text-black-400 hover:text-black-900 dark:hover:text-white hover:bg-ambient-600 dark:hover:bg-white/5'}"
    >
      All Teams
    </button>

    <!-- Hierarchical list: Domains with teams indented -->
    {#each domains as domain (domain.domainName)}
      <!-- Domain -->
      <button
        type="button"
        onclick={() => handleSelectDomain(domain.domainName)}
        data-selected={filter.domain === domain.domainName &&
          filter.teamKey === null}
        class="w-full px-3 py-1.5 text-left text-sm font-medium truncate transition-colors duration-150 cursor-pointer
          {filter.domain === domain.domainName && filter.teamKey === null
          ? 'text-black-900 dark:text-white bg-ambient-700 dark:bg-white/10'
          : 'text-black-600 dark:text-black-400 hover:text-black-900 dark:hover:text-white hover:bg-ambient-600 dark:hover:bg-white/5'}"
        title={domain.domainName}
      >
        {domain.domainName}
      </button>

      <!-- Teams under this domain (indented) -->
      {#each domain.teams as team (team.teamKey)}
        <button
          type="button"
          onclick={() => handleSelectTeam(team.teamKey)}
          data-selected={filter.teamKey === team.teamKey}
          class="w-full px-3 py-1.5 pl-6 text-left text-sm truncate transition-colors duration-150 cursor-pointer
            {filter.teamKey === team.teamKey
            ? 'text-black-900 dark:text-white bg-ambient-700 dark:bg-white/10'
            : 'text-black-500 dark:text-black-400 hover:text-black-900 dark:hover:text-white hover:bg-ambient-600 dark:hover:bg-white/5'}"
          title={team.teamName}
        >
          {team.teamName}
        </button>
      {/each}
    {/each}
  </div>

  <!-- Footer with keyboard shortcut hint -->
  {#if isFilterActive}
    <div class="px-3 py-2 border-t border-black-200 dark:border-white/10">
      <p class="text-[11px] text-center text-black-500">
        <kbd
          class="px-1.5 py-0.5 rounded border bg-ambient-700 dark:bg-black-800 border-black-200 dark:border-black-700 text-black-600 dark:text-black-300"
          >{isMac ? "Cmd" : "Ctrl"} + Shift + X</kbd
        >
        to
        <button
          type="button"
          onclick={handleClearFilter}
          class="underline hover:text-black-700 dark:hover:text-black-300 transition-colors cursor-pointer"
          >clear filter</button
        >
      </p>
    </div>
  {/if}
{/snippet}

<style>
  /* Sidebar text blur poof transition */
  .sidebar-text {
    transition:
      width 250ms cubic-bezier(0.25, 1, 0.5, 1),
      opacity 250ms cubic-bezier(0.25, 1, 0.5, 1),
      filter 250ms cubic-bezier(0.25, 1, 0.5, 1);
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

<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import Card from "$lib/components/Card.svelte";
  import Skeleton from "$lib/components/Skeleton.svelte";
  import Badge from "$lib/components/Badge.svelte";
  import Button from "$lib/components/Button.svelte";
  import Modal from "$lib/components/Modal.svelte";

  interface TeamMember {
    id: string;
    name: string;
    avatarUrl: string | null;
    teamKeys: string[];
    teamNames: string[];
    wipCount: number;
    isFromMapping: boolean;
  }

  interface Team {
    teamKey: string;
    teamName: string | null;
    domain: string | null;
    members: TeamMember[];
  }

  interface Domain {
    name: string;
    teams: Team[];
  }

  interface ValidationError {
    type: "duplicate_engineer";
    engineer: string;
    teams: string[];
    message: string;
  }

  interface DatabaseEngineer {
    id: string;
    name: string;
    avatarUrl: string | null;
    wipCount: number;
    teamNames: string[];
    suggestedTeamKey: string | null;
  }

  interface TeamsData {
    domains: Domain[];
    unassignedTeams: Team[];
    engineerTeamMapping: Record<string, string>;
    teamDomainMappings: Record<string, string>;
    validationErrors: ValidationError[];
    allEngineers: DatabaseEngineer[];
  }

  let data = $state<TeamsData | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  // Local mapping state for edits
  let localMapping = $state<Record<string, string>>({});
  let isEditing = $state(false);
  let showConfigModal = $state(false);
  let addingToTeam = $state<string | null>(null);
  let searchQuery = $state("");
  let selectedIndex = $state(0);
  let copied = $state(false);

  async function loadTeams() {
    if (!browser) return;
    try {
      loading = true;
      error = null;
      const response = await fetch("/api/teams");
      if (!response.ok) {
        throw new Error("Failed to fetch teams data");
      }
      data = await response.json();
      // Initialize local mapping from server data
      localMapping = { ...(data?.engineerTeamMapping ?? {}) };
    } catch (e) {
      error = e instanceof Error ? e.message : "Unknown error";
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    loadTeams();
  });

  // Check if local mapping differs from original
  const hasChanges = $derived.by(() => {
    if (!data) return false;
    const original = data.engineerTeamMapping;
    const originalKeys = Object.keys(original).sort();
    const localKeys = Object.keys(localMapping).sort();

    if (originalKeys.length !== localKeys.length) return true;
    for (const key of originalKeys) {
      if (original[key] !== localMapping[key]) return true;
    }
    return false;
  });

  // Escape single quotes in a string for shell (using '\'' pattern)
  function escapeForShell(str: string): string {
    return str.replace(/'/g, "'\\''");
  }

  // Generate the config string (just the value part, unquoted for display)
  const configValue = $derived.by(() => {
    const entries = Object.entries(localMapping)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([engineer, team]) => `${engineer}:${team}`);
    return entries.join(",");
  });

  // Full config string with variable name (quoted for shell compatibility)
  const configString = $derived.by(() => {
    const entries = Object.entries(localMapping)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([engineer, team]) => `${escapeForShell(engineer)}:${team}`);
    const escapedValue = entries.join(",");
    return `ENGINEER_TEAM_MAPPING='${escapedValue}'`;
  });

  // Get engineers for a team from local mapping
  function getTeamEngineers(teamKey: string): string[] {
    return Object.entries(localMapping)
      .filter(([_, team]) => team === teamKey)
      .map(([engineer]) => engineer)
      .sort();
  }

  // Get unassigned engineers (engineers in DB but not in local mapping)
  const unassignedEngineers = $derived.by(() => {
    if (!data?.allEngineers) return [];
    return data.allEngineers.filter((e) => !localMapping[e.name]);
  });

  // Count of engineers in the mapping
  const totalEngineersCount = $derived(Object.keys(localMapping).length);

  // Filter unassigned engineers by search query
  const filteredEngineers = $derived.by(() => {
    if (!searchQuery.trim()) return unassignedEngineers;
    const query = searchQuery.toLowerCase();
    return unassignedEngineers.filter((e) =>
      e.name.toLowerCase().includes(query)
    );
  });

  // Add an engineer to a team
  function addEngineerByName(engineerName: string, teamKey: string) {
    if (!engineerName) return;

    // Remove from any existing team first (shouldn't happen for unassigned, but just in case)
    if (localMapping[engineerName]) {
      delete localMapping[engineerName];
    }
    localMapping[engineerName] = teamKey;
    localMapping = { ...localMapping }; // Trigger reactivity
    searchQuery = "";
    selectedIndex = 0;
    addingToTeam = null;
  }

  // Handle keyboard navigation in dropdown
  function handleDropdownKeydown(event: KeyboardEvent, teamKey: string) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, filteredEngineers.length - 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
    } else if (event.key === "Enter" && filteredEngineers.length > 0) {
      event.preventDefault();
      addEngineerByName(filteredEngineers[selectedIndex].name, teamKey);
    } else if (event.key === "Escape") {
      event.preventDefault();
      addingToTeam = null;
      searchQuery = "";
      selectedIndex = 0;
    }
  }

  // Open the add engineer dropdown
  function openAddEngineer(teamKey: string) {
    addingToTeam = teamKey;
    searchQuery = "";
    selectedIndex = 0;
  }

  // Close the add engineer dropdown
  function closeAddEngineer() {
    addingToTeam = null;
    searchQuery = "";
    selectedIndex = 0;
  }

  // Remove an engineer from the mapping
  function removeEngineer(engineerName: string) {
    delete localMapping[engineerName];
    localMapping = { ...localMapping }; // Trigger reactivity
  }

  // Reset local mapping to original
  function resetChanges() {
    localMapping = { ...(data?.engineerTeamMapping ?? {}) };
    isEditing = false;
  }

  // Populate mapping from WIP data (auto-detect teams based on where users have active work)
  function populateFromWip() {
    if (!data?.allEngineers) return;

    const newMapping: Record<string, string> = {};

    // For each engineer with a suggested team, add them to that team
    for (const engineer of data.allEngineers) {
      if (engineer.suggestedTeamKey) {
        newMapping[engineer.name] = engineer.suggestedTeamKey;
      }
    }

    localMapping = newMapping;
    isEditing = true;
  }

  // Copy config to clipboard
  async function copyConfig() {
    try {
      await navigator.clipboard.writeText(configString);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }

  // Validation
  const hasValidationErrors = $derived(
    (data?.validationErrors?.length ?? 0) > 0
  );

  // Stats (based on local mapping when editing)
  const totalDomains = $derived(data?.domains.length ?? 0);
  const totalTeams = $derived(
    (data?.domains.reduce((sum, d) => sum + d.teams.length, 0) ?? 0) +
      (data?.unassignedTeams.length ?? 0)
  );
</script>

<div class="p-6 space-y-6">
  <!-- Header -->
  <div
    class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
  >
    <div>
      <h1
        class="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-white"
      >
        Organization
      </h1>
      <p class="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
        {#if isEditing}
          Remove non-engineers or adjust team assignments, then review changes
          to get your config.
        {:else}
          Team structure based on ENGINEER_TEAM_MAPPING. Use "Populate from WIP"
          to auto-detect from active work.
        {/if}
      </p>
    </div>
    {#if data && !loading && !error}
      <div class="flex gap-2">
        {#if isEditing}
          <Button variant="outline" size="sm" onclick={resetChanges}>
            Cancel
          </Button>
          <Button
            variant="default"
            size="sm"
            onclick={() => (showConfigModal = true)}
            disabled={!hasChanges}
          >
            {hasChanges ? "Review Changes" : "No Changes"}
          </Button>
        {:else}
          <Button
            variant="outline"
            size="sm"
            onclick={() => (isEditing = true)}
          >
            Edit Teams
          </Button>
          <Button
            variant="default"
            size="sm"
            onclick={populateFromWip}
            title="Auto-populate teams based on where users have active WIP issues"
          >
            Populate from WIP
          </Button>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Validation Errors -->
  {#if !loading && data && hasValidationErrors}
    <Card class="border-red-500/50 bg-red-50 dark:bg-red-950/20">
      <div class="flex items-start gap-3">
        <div class="mt-0.5 text-red-500">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="w-5 h-5"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fill-rule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
              clip-rule="evenodd"
            />
          </svg>
        </div>
        <div class="flex-1">
          <h3 class="text-sm font-semibold text-red-700 dark:text-red-400">
            Configuration Errors in ENGINEER_TEAM_MAPPING
          </h3>
          <p class="mt-1 text-sm text-red-600 dark:text-red-300/80">
            Each engineer should only be mapped to one team. The following
            engineers are mapped to multiple teams:
          </p>
          <ul class="mt-3 space-y-2">
            {#each data.validationErrors as err (err.engineer)}
              <li
                class="flex items-center gap-2 text-sm text-red-700 dark:text-red-300"
              >
                <span class="font-medium">{err.engineer}</span>
                <span class="text-red-500 dark:text-red-400">→</span>
                <span class="font-mono text-xs">
                  {err.teams.join(", ")}
                </span>
              </li>
            {/each}
          </ul>
          <p class="mt-4 text-xs text-red-600/80 dark:text-red-400/70">
            Update your <code
              class="px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/50 font-mono"
              >ENGINEER_TEAM_MAPPING</code
            > environment variable to fix this issue.
          </p>
        </div>
      </div>
    </Card>
  {/if}

  <!-- Stats summary -->
  {#if !loading && !error && data}
    <div class="flex flex-wrap gap-4">
      <Card class="max-w-[180px]">
        <div class="mb-1 text-xs text-neutral-500 dark:text-neutral-300">
          Domains
        </div>
        <div class="text-2xl font-semibold text-neutral-900 dark:text-white">
          {totalDomains}
        </div>
        <div class="text-xs text-neutral-500">org divisions</div>
      </Card>
      <Card class="max-w-[180px]">
        <div class="mb-1 text-xs text-neutral-500 dark:text-neutral-300">
          Teams
        </div>
        <div class="text-2xl font-semibold text-neutral-900 dark:text-white">
          {totalTeams}
        </div>
        <div class="text-xs text-neutral-500">configured</div>
      </Card>
      <Card class="max-w-[180px]">
        <div class="mb-1 text-xs text-neutral-500 dark:text-neutral-300">
          Engineers
        </div>
        <div class="text-2xl font-semibold text-neutral-900 dark:text-white">
          {totalEngineersCount}
        </div>
        <div class="text-xs text-neutral-500">assigned to teams</div>
      </Card>
      <Card class="max-w-[180px]">
        <div class="mb-1 text-xs text-neutral-500 dark:text-neutral-300">
          Unassigned
        </div>
        <div
          class="text-2xl font-semibold {unassignedEngineers.length > 0
            ? 'text-amber-500'
            : 'text-neutral-900 dark:text-white'}"
        >
          {unassignedEngineers.length}
        </div>
        <div class="text-xs text-neutral-500">in database</div>
      </Card>
    </div>
  {/if}

  <!-- Main content -->
  {#if loading}
    <div class="space-y-4">
      <Card>
        <Skeleton class="mb-4 w-48 h-8" />
        <div class="space-y-3">
          <Skeleton class="w-full h-24" />
          <Skeleton class="w-full h-24" />
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
  {:else if !data || (data.domains.length === 0 && data.unassignedTeams.length === 0)}
    <Card>
      <div class="mb-3 text-sm font-medium text-neutral-900 dark:text-white">
        No Teams Configured
      </div>
      <p class="mb-4 text-neutral-700 dark:text-neutral-400">
        No team mappings found. Configure your environment variables to set up
        the organization structure.
      </p>
      <div class="space-y-3 text-sm">
        <div>
          <p class="mb-1 font-medium text-neutral-900 dark:text-white">
            TEAM_DOMAIN_MAPPINGS
          </p>
          <p class="text-neutral-600 dark:text-neutral-400">
            JSON object mapping team keys to domain names
          </p>
          <code
            class="block mt-1 px-3 py-2 font-mono text-xs rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300"
          >
            {`TEAM_DOMAIN_MAPPINGS='{"ENG":"Engineering","DESIGN":"Product"}'`}
          </code>
        </div>
        <div>
          <p class="mb-1 font-medium text-neutral-900 dark:text-white">
            ENGINEER_TEAM_MAPPING
          </p>
          <p class="text-neutral-600 dark:text-neutral-400">
            Comma-separated list of engineer:teamKey pairs
          </p>
          <code
            class="block mt-1 px-3 py-2 font-mono text-xs rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300"
          >
            ENGINEER_TEAM_MAPPING='Alice:ENG,Bob:ENG,Carol:DESIGN'
          </code>
        </div>
      </div>
    </Card>
  {:else}
    <!-- Domains -->
    {#each data.domains as domain (domain.name)}
      <div class="space-y-4">
        <div class="flex items-center gap-3">
          <h2
            class="text-xl font-semibold text-neutral-900 dark:text-white tracking-tight"
          >
            {domain.name}
          </h2>
          <Badge variant="outline">{domain.teams.length} teams</Badge>
        </div>

        <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {#each domain.teams as team (team.teamKey)}
            {@const teamEngineers = isEditing
              ? getTeamEngineers(team.teamKey)
              : null}
            <Card class="p-5">
              <div class="flex items-start justify-between mb-4">
                <div>
                  <h3
                    class="text-lg font-semibold text-neutral-900 dark:text-white"
                  >
                    {team.teamName || team.teamKey}
                  </h3>
                  <div class="flex items-center gap-2 mt-1">
                    <Badge variant="default" class="font-mono text-xs">
                      {team.teamKey}
                    </Badge>
                    <span class="text-xs text-neutral-500">
                      {isEditing ? teamEngineers?.length : team.members.length} members
                    </span>
                  </div>
                </div>
              </div>

              {#if isEditing}
                <!-- Edit mode: show engineers from local mapping -->
                <div class="space-y-2">
                  {#each teamEngineers ?? [] as engineerName (engineerName)}
                    {@const member = team.members.find(
                      (m) => m.name === engineerName
                    )}
                    <div
                      class="flex items-center gap-3 py-2 px-2 -mx-2 rounded bg-neutral-50 dark:bg-neutral-800/50"
                    >
                      {#if member?.avatarUrl}
                        <img
                          src={member.avatarUrl}
                          alt={engineerName}
                          class="w-8 h-8 rounded-full shrink-0"
                        />
                      {:else}
                        <div
                          class="w-8 h-8 rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center shrink-0"
                        >
                          <span
                            class="text-xs font-medium text-neutral-600 dark:text-neutral-300"
                          >
                            {engineerName
                              .split(" ")
                              .map((n) => n[0])
                              .join("")
                              .slice(0, 2)}
                          </span>
                        </div>
                      {/if}
                      <div class="flex-1 min-w-0">
                        <p
                          class="text-sm font-medium text-neutral-900 dark:text-white truncate"
                        >
                          {engineerName}
                        </p>
                      </div>
                      <button
                        type="button"
                        onclick={() => removeEngineer(engineerName)}
                        class="p-1 text-neutral-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                        title="Remove from team"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          class="w-4 h-4"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path
                            fill-rule="evenodd"
                            d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                            clip-rule="evenodd"
                          />
                        </svg>
                      </button>
                    </div>
                  {/each}

                  <!-- Add engineer dropdown -->
                  {#if addingToTeam === team.teamKey}
                    <div class="relative mt-3">
                      <input
                        type="text"
                        bind:value={searchQuery}
                        placeholder="Search engineers..."
                        class="w-full px-3 py-2 text-sm rounded-t border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        onkeydown={(e) =>
                          handleDropdownKeydown(e, team.teamKey)}
                      />
                      <div
                        class="absolute z-10 w-full max-h-48 overflow-y-auto rounded-b border border-t-0 border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 shadow-lg"
                      >
                        {#if filteredEngineers.length === 0}
                          <div
                            class="px-3 py-2 text-sm text-neutral-500 dark:text-neutral-400"
                          >
                            {unassignedEngineers.length === 0
                              ? "All engineers are assigned"
                              : "No engineers match your search"}
                          </div>
                        {:else}
                          {#each filteredEngineers as engineer, index (engineer.id)}
                            <button
                              type="button"
                              class="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors {index ===
                              selectedIndex
                                ? 'bg-neutral-100 dark:bg-neutral-700'
                                : ''}"
                              onclick={() =>
                                addEngineerByName(engineer.name, team.teamKey)}
                              onmouseenter={() => (selectedIndex = index)}
                            >
                              {#if engineer.avatarUrl}
                                <img
                                  src={engineer.avatarUrl}
                                  alt={engineer.name}
                                  class="w-6 h-6 rounded-full shrink-0"
                                />
                              {:else}
                                <div
                                  class="w-6 h-6 rounded-full bg-neutral-200 dark:bg-neutral-600 flex items-center justify-center shrink-0"
                                >
                                  <span
                                    class="text-[10px] font-medium text-neutral-600 dark:text-neutral-300"
                                  >
                                    {engineer.name
                                      .split(" ")
                                      .map((n) => n[0])
                                      .join("")
                                      .slice(0, 2)}
                                  </span>
                                </div>
                              {/if}
                              <div class="flex-1 min-w-0">
                                <div class="flex items-center gap-2">
                                  <p
                                    class="text-sm font-medium text-neutral-900 dark:text-white truncate"
                                  >
                                    {engineer.name}
                                  </p>
                                  {#if engineer.suggestedTeamKey === team.teamKey}
                                    <span
                                      class="text-[10px] px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                                    >
                                      suggested
                                    </span>
                                  {/if}
                                </div>
                                <p
                                  class="text-xs text-neutral-500 dark:text-neutral-400"
                                >
                                  {engineer.wipCount > 0
                                    ? `${engineer.wipCount} WIP`
                                    : "No active WIP"}
                                  {#if engineer.suggestedTeamKey && engineer.suggestedTeamKey !== team.teamKey}
                                    <span class="text-neutral-400">
                                      · from {engineer.suggestedTeamKey}</span
                                    >
                                  {/if}
                                </p>
                              </div>
                            </button>
                          {/each}
                        {/if}
                      </div>
                      <button
                        type="button"
                        onclick={closeAddEngineer}
                        class="absolute top-2 right-2 p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
                        aria-label="Close dropdown"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          class="w-4 h-4"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path
                            fill-rule="evenodd"
                            d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                            clip-rule="evenodd"
                          />
                        </svg>
                      </button>
                    </div>
                  {:else}
                    <button
                      type="button"
                      onclick={() => openAddEngineer(team.teamKey)}
                      class="flex items-center gap-2 mt-3 px-3 py-1.5 text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 border border-dashed border-neutral-300 dark:border-neutral-600 rounded hover:border-neutral-400 dark:hover:border-neutral-500 transition-colors w-full justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={unassignedEngineers.length === 0}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="w-4 h-4"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fill-rule="evenodd"
                          d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
                          clip-rule="evenodd"
                        />
                      </svg>
                      {unassignedEngineers.length === 0
                        ? "All engineers assigned"
                        : `Add engineer (${unassignedEngineers.length} available)`}
                    </button>
                  {/if}
                </div>
              {:else if team.members.length > 0}
                <!-- View mode: show members from API -->
                <div class="space-y-2">
                  {#each team.members as member (member.id)}
                    <div
                      class="flex items-center gap-3 py-2 px-2 -mx-2 rounded hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"
                    >
                      {#if member.avatarUrl}
                        <img
                          src={member.avatarUrl}
                          alt={member.name}
                          class="w-8 h-8 rounded-full shrink-0"
                        />
                      {:else}
                        <div
                          class="w-8 h-8 rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center shrink-0"
                        >
                          <span
                            class="text-xs font-medium text-neutral-600 dark:text-neutral-300"
                          >
                            {member.name
                              .split(" ")
                              .map((n) => n[0])
                              .join("")
                              .slice(0, 2)}
                          </span>
                        </div>
                      {/if}
                      <div class="flex-1 min-w-0">
                        <p
                          class="text-sm font-medium text-neutral-900 dark:text-white truncate"
                        >
                          {member.name}
                        </p>
                        <div class="flex items-center gap-2">
                          {#if member.wipCount > 0}
                            <span
                              class="text-xs text-neutral-500 dark:text-neutral-400"
                            >
                              {member.wipCount} WIP
                            </span>
                          {:else}
                            <span
                              class="text-xs text-neutral-400 dark:text-neutral-500"
                            >
                              No active WIP
                            </span>
                          {/if}
                          {#if !member.isFromMapping}
                            <Badge
                              variant="outline"
                              class="text-[10px] py-0 px-1"
                            >
                              DB
                            </Badge>
                          {/if}
                        </div>
                      </div>
                    </div>
                  {/each}
                </div>
              {:else}
                <p class="text-sm text-neutral-500 dark:text-neutral-400">
                  No members assigned
                </p>
              {/if}
            </Card>
          {/each}
        </div>
      </div>
    {/each}

    <!-- Unassigned Teams (teams not in any domain) -->
    {#if data.unassignedTeams.length > 0}
      <div class="space-y-4">
        <div class="flex items-center gap-3">
          <h2
            class="text-xl font-semibold text-neutral-900 dark:text-white tracking-tight"
          >
            Unassigned to Domain
          </h2>
          <Badge variant="outline">{data.unassignedTeams.length} teams</Badge>
        </div>

        <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {#each data.unassignedTeams as team (team.teamKey)}
            {@const teamEngineers = isEditing
              ? getTeamEngineers(team.teamKey)
              : null}
            <Card class="p-5 border-dashed">
              <div class="flex items-start justify-between mb-4">
                <div>
                  <h3
                    class="text-lg font-semibold text-neutral-900 dark:text-white"
                  >
                    {team.teamName || team.teamKey}
                  </h3>
                  <div class="flex items-center gap-2 mt-1">
                    <Badge variant="outline" class="font-mono text-xs">
                      {team.teamKey}
                    </Badge>
                    <span class="text-xs text-neutral-500">
                      {isEditing ? teamEngineers?.length : team.members.length} members
                    </span>
                  </div>
                </div>
              </div>

              {#if isEditing}
                <!-- Edit mode: show engineers from local mapping -->
                <div class="space-y-2">
                  {#each teamEngineers ?? [] as engineerName (engineerName)}
                    {@const member = team.members.find(
                      (m) => m.name === engineerName
                    )}
                    <div
                      class="flex items-center gap-3 py-2 px-2 -mx-2 rounded bg-neutral-50 dark:bg-neutral-800/50"
                    >
                      {#if member?.avatarUrl}
                        <img
                          src={member.avatarUrl}
                          alt={engineerName}
                          class="w-8 h-8 rounded-full shrink-0"
                        />
                      {:else}
                        <div
                          class="w-8 h-8 rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center shrink-0"
                        >
                          <span
                            class="text-xs font-medium text-neutral-600 dark:text-neutral-300"
                          >
                            {engineerName
                              .split(" ")
                              .map((n) => n[0])
                              .join("")
                              .slice(0, 2)}
                          </span>
                        </div>
                      {/if}
                      <div class="flex-1 min-w-0">
                        <p
                          class="text-sm font-medium text-neutral-900 dark:text-white truncate"
                        >
                          {engineerName}
                        </p>
                      </div>
                      <button
                        type="button"
                        onclick={() => removeEngineer(engineerName)}
                        class="p-1 text-neutral-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                        title="Remove from team"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          class="w-4 h-4"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path
                            fill-rule="evenodd"
                            d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                            clip-rule="evenodd"
                          />
                        </svg>
                      </button>
                    </div>
                  {/each}

                  <!-- Add engineer dropdown -->
                  {#if addingToTeam === team.teamKey}
                    <div class="relative mt-3">
                      <input
                        type="text"
                        bind:value={searchQuery}
                        placeholder="Search engineers..."
                        class="w-full px-3 py-2 text-sm rounded-t border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        onkeydown={(e) =>
                          handleDropdownKeydown(e, team.teamKey)}
                      />
                      <div
                        class="absolute z-10 w-full max-h-48 overflow-y-auto rounded-b border border-t-0 border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 shadow-lg"
                      >
                        {#if filteredEngineers.length === 0}
                          <div
                            class="px-3 py-2 text-sm text-neutral-500 dark:text-neutral-400"
                          >
                            {unassignedEngineers.length === 0
                              ? "All engineers are assigned"
                              : "No engineers match your search"}
                          </div>
                        {:else}
                          {#each filteredEngineers as engineer, index (engineer.id)}
                            <button
                              type="button"
                              class="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors {index ===
                              selectedIndex
                                ? 'bg-neutral-100 dark:bg-neutral-700'
                                : ''}"
                              onclick={() =>
                                addEngineerByName(engineer.name, team.teamKey)}
                              onmouseenter={() => (selectedIndex = index)}
                            >
                              {#if engineer.avatarUrl}
                                <img
                                  src={engineer.avatarUrl}
                                  alt={engineer.name}
                                  class="w-6 h-6 rounded-full shrink-0"
                                />
                              {:else}
                                <div
                                  class="w-6 h-6 rounded-full bg-neutral-200 dark:bg-neutral-600 flex items-center justify-center shrink-0"
                                >
                                  <span
                                    class="text-[10px] font-medium text-neutral-600 dark:text-neutral-300"
                                  >
                                    {engineer.name
                                      .split(" ")
                                      .map((n) => n[0])
                                      .join("")
                                      .slice(0, 2)}
                                  </span>
                                </div>
                              {/if}
                              <div class="flex-1 min-w-0">
                                <div class="flex items-center gap-2">
                                  <p
                                    class="text-sm font-medium text-neutral-900 dark:text-white truncate"
                                  >
                                    {engineer.name}
                                  </p>
                                  {#if engineer.suggestedTeamKey === team.teamKey}
                                    <span
                                      class="text-[10px] px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                                    >
                                      suggested
                                    </span>
                                  {/if}
                                </div>
                                <p
                                  class="text-xs text-neutral-500 dark:text-neutral-400"
                                >
                                  {engineer.wipCount > 0
                                    ? `${engineer.wipCount} WIP`
                                    : "No active WIP"}
                                  {#if engineer.suggestedTeamKey && engineer.suggestedTeamKey !== team.teamKey}
                                    <span class="text-neutral-400">
                                      · from {engineer.suggestedTeamKey}</span
                                    >
                                  {/if}
                                </p>
                              </div>
                            </button>
                          {/each}
                        {/if}
                      </div>
                      <button
                        type="button"
                        onclick={closeAddEngineer}
                        class="absolute top-2 right-2 p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
                        aria-label="Close dropdown"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          class="w-4 h-4"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path
                            fill-rule="evenodd"
                            d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                            clip-rule="evenodd"
                          />
                        </svg>
                      </button>
                    </div>
                  {:else}
                    <button
                      type="button"
                      onclick={() => openAddEngineer(team.teamKey)}
                      class="flex items-center gap-2 mt-3 px-3 py-1.5 text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 border border-dashed border-neutral-300 dark:border-neutral-600 rounded hover:border-neutral-400 dark:hover:border-neutral-500 transition-colors w-full justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={unassignedEngineers.length === 0}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="w-4 h-4"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fill-rule="evenodd"
                          d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
                          clip-rule="evenodd"
                        />
                      </svg>
                      {unassignedEngineers.length === 0
                        ? "All engineers assigned"
                        : `Add engineer (${unassignedEngineers.length} available)`}
                    </button>
                  {/if}
                </div>
              {:else if team.members.length > 0}
                <!-- View mode: show members from API -->
                <div class="space-y-2">
                  {#each team.members as member (member.id)}
                    <div
                      class="flex items-center gap-3 py-2 px-2 -mx-2 rounded hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"
                    >
                      {#if member.avatarUrl}
                        <img
                          src={member.avatarUrl}
                          alt={member.name}
                          class="w-8 h-8 rounded-full shrink-0"
                        />
                      {:else}
                        <div
                          class="w-8 h-8 rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center shrink-0"
                        >
                          <span
                            class="text-xs font-medium text-neutral-600 dark:text-neutral-300"
                          >
                            {member.name
                              .split(" ")
                              .map((n) => n[0])
                              .join("")
                              .slice(0, 2)}
                          </span>
                        </div>
                      {/if}
                      <div class="flex-1 min-w-0">
                        <p
                          class="text-sm font-medium text-neutral-900 dark:text-white truncate"
                        >
                          {member.name}
                        </p>
                        <div class="flex items-center gap-2">
                          {#if member.wipCount > 0}
                            <span
                              class="text-xs text-neutral-500 dark:text-neutral-400"
                            >
                              {member.wipCount} WIP
                            </span>
                          {:else}
                            <span
                              class="text-xs text-neutral-400 dark:text-neutral-500"
                            >
                              No active WIP
                            </span>
                          {/if}
                        </div>
                      </div>
                    </div>
                  {/each}
                </div>
              {:else}
                <p class="text-sm text-neutral-500 dark:text-neutral-400">
                  No members assigned
                </p>
              {/if}
            </Card>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Unassigned Users -->
    {#if unassignedEngineers.length > 0}
      <div class="space-y-4">
        <div class="flex items-center gap-3">
          <h2
            class="text-xl font-semibold text-amber-600 dark:text-amber-400 tracking-tight"
          >
            Unassigned Users
          </h2>
          <Badge
            variant="outline"
            class="border-amber-500 text-amber-600 dark:text-amber-400"
            >{unassignedEngineers.length} users</Badge
          >
        </div>

        <Card
          class="p-5 border-amber-300 dark:border-amber-700/50 bg-amber-50/50 dark:bg-amber-950/20"
        >
          <p class="text-sm text-amber-700 dark:text-amber-400 mb-4">
            {#if isEditing}
              These users have issues in the database but haven't been
              categorized yet. Assign them to a team or mark as non-engineering.
            {:else}
              These users have issues in the database but are not in
              ENGINEER_TEAM_MAPPING. Click "Edit Teams" to assign them.
            {/if}
          </p>
          <div class="space-y-2">
            {#each unassignedEngineers as engineer (engineer.id)}
              <div
                class="flex items-center gap-3 py-2 px-3 rounded bg-white dark:bg-neutral-800 border border-amber-200 dark:border-amber-800/50"
              >
                {#if engineer.avatarUrl}
                  <img
                    src={engineer.avatarUrl}
                    alt={engineer.name}
                    class="w-8 h-8 rounded-full shrink-0"
                  />
                {:else}
                  <div
                    class="w-8 h-8 rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center shrink-0"
                  >
                    <span
                      class="text-xs font-medium text-neutral-600 dark:text-neutral-300"
                    >
                      {engineer.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .slice(0, 2)}
                    </span>
                  </div>
                {/if}
                <div class="flex-1 min-w-0">
                  <p
                    class="text-sm font-medium text-neutral-900 dark:text-white truncate"
                  >
                    {engineer.name}
                  </p>
                  <p class="text-xs text-neutral-500 dark:text-neutral-400">
                    {engineer.wipCount > 0
                      ? `${engineer.wipCount} WIP`
                      : "No active WIP"}
                    {#if engineer.suggestedTeamKey}
                      <span class="text-neutral-400">
                        · suggested: {engineer.suggestedTeamKey}</span
                      >
                    {/if}
                  </p>
                </div>
                {#if isEditing && engineer.suggestedTeamKey}
                  <Button
                    size="sm"
                    variant="outline"
                    onclick={() =>
                      addEngineerByName(
                        engineer.name,
                        engineer.suggestedTeamKey!
                      )}
                  >
                    Add to {engineer.suggestedTeamKey}
                  </Button>
                {/if}
              </div>
            {/each}
          </div>
        </Card>
      </div>
    {/if}

    <!-- Configuration Info -->
    {#if !isEditing}
      <Card class="mt-8 bg-neutral-50 dark:bg-neutral-900/50">
        <h3 class="mb-3 text-sm font-semibold text-neutral-900 dark:text-white">
          Configuration
        </h3>
        <div class="grid gap-4 md:grid-cols-2">
          <div>
            <p
              class="mb-2 text-xs font-medium text-neutral-600 dark:text-neutral-400 uppercase tracking-wide"
            >
              TEAM_DOMAIN_MAPPINGS
            </p>
            <div
              class="p-3 font-mono text-xs rounded bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 overflow-x-auto"
            >
              {#if Object.keys(data.teamDomainMappings).length > 0}
                <pre
                  class="text-neutral-700 dark:text-neutral-300">{JSON.stringify(
                    data.teamDomainMappings,
                    null,
                    2
                  )}</pre>
              {:else}
                <span class="text-neutral-400">Not configured</span>
              {/if}
            </div>
          </div>
          <div>
            <p
              class="mb-2 text-xs font-medium text-neutral-600 dark:text-neutral-400 uppercase tracking-wide"
            >
              ENGINEER_TEAM_MAPPING
            </p>
            <div
              class="p-3 font-mono text-xs rounded bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 overflow-x-auto max-h-48 overflow-y-auto"
            >
              {#if Object.keys(data.engineerTeamMapping).length > 0}
                <pre
                  class="text-neutral-700 dark:text-neutral-300">{JSON.stringify(
                    data.engineerTeamMapping,
                    null,
                    2
                  )}</pre>
              {:else}
                <span class="text-neutral-400">Not configured</span>
              {/if}
            </div>
          </div>
        </div>
      </Card>
    {/if}
  {/if}
</div>

<!-- Config Update Modal -->
{#if showConfigModal}
  <Modal
    onclose={() => (showConfigModal = false)}
    title="Update Configuration"
    size="lg"
  >
    <p class="text-sm text-neutral-400 mb-6">
      Copy the updated configuration string below and update your environment
      variable.
    </p>

    <!-- Changes summary -->
    <div class="mb-6">
      <h3 class="text-sm font-medium text-neutral-300 mb-3">Changes Summary</h3>
      <div class="space-y-2 text-sm">
        {#each Object.entries(localMapping).sort( ([a], [b]) => a.localeCompare(b) ) as [engineer, team] (engineer)}
          {@const originalTeam = data?.engineerTeamMapping[engineer]}
          {#if originalTeam !== team}
            <div class="flex items-center gap-2 text-amber-400">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="w-4 h-4"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fill-rule="evenodd"
                  d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
                  clip-rule="evenodd"
                />
              </svg>
              <span class="font-medium">{engineer}</span>
              <span class="text-neutral-500">moved from</span>
              <span
                class="font-mono text-xs px-1.5 py-0.5 rounded bg-neutral-700"
                >{originalTeam || "none"}</span
              >
              <span class="text-neutral-500">to</span>
              <span
                class="font-mono text-xs px-1.5 py-0.5 rounded bg-neutral-700"
                >{team}</span
              >
            </div>
          {:else if !originalTeam}
            <div class="flex items-center gap-2 text-green-400">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="w-4 h-4"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fill-rule="evenodd"
                  d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
                  clip-rule="evenodd"
                />
              </svg>
              <span class="font-medium">{engineer}</span>
              <span class="text-neutral-500">added to</span>
              <span
                class="font-mono text-xs px-1.5 py-0.5 rounded bg-neutral-700"
                >{team}</span
              >
            </div>
          {/if}
        {/each}
        {#each Object.keys(data?.engineerTeamMapping ?? {}) as engineer (engineer)}
          {#if !localMapping[engineer]}
            <div class="flex items-center gap-2 text-red-400">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="w-4 h-4"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fill-rule="evenodd"
                  d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
                  clip-rule="evenodd"
                />
              </svg>
              <span class="font-medium">{engineer}</span>
              <span class="text-neutral-500">removed from</span>
              <span
                class="font-mono text-xs px-1.5 py-0.5 rounded bg-neutral-700"
                >{data?.engineerTeamMapping[engineer]}</span
              >
            </div>
          {/if}
        {/each}
      </div>
    </div>

    <!-- Config string -->
    <div class="mb-6">
      <div class="flex items-center justify-between mb-2">
        <h3 class="text-sm font-medium text-neutral-300">
          Environment Variable
        </h3>
        <Button size="sm" variant="outline" onclick={copyConfig}>
          {copied ? "Copied!" : "Copy"}
        </Button>
      </div>
      <div
        class="p-4 font-mono text-xs rounded bg-neutral-800 border border-neutral-700 overflow-x-auto"
      >
        <code class="text-neutral-200 break-all whitespace-pre-wrap">
          {configValue ? configString : "ENGINEER_TEAM_MAPPING=''"}
        </code>
      </div>
    </div>

    <!-- Instructions -->
    <div class="p-4 rounded bg-blue-950/50 border border-blue-800">
      <h4 class="text-sm font-medium text-blue-300 mb-2">
        How to apply changes
      </h4>
      <ol class="text-sm text-blue-400 space-y-1 list-decimal list-inside">
        <li>Copy the configuration string above</li>
        <li>
          Update your <code
            class="px-1 py-0.5 rounded bg-blue-900/50 font-mono text-xs"
            >ENGINEER_TEAM_MAPPING</code
          > environment variable
        </li>
        <li>Restart the application to apply changes</li>
      </ol>
    </div>

    <!-- Actions -->
    <div class="flex justify-end gap-3 mt-6">
      <Button variant="outline" onclick={() => (showConfigModal = false)}>
        Close
      </Button>
    </div>
  </Modal>
{/if}

<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import Card from "$lib/components/Card.svelte";
  import Skeleton from "$lib/components/Skeleton.svelte";
  import Badge from "$lib/components/Badge.svelte";
  import EngineersTable from "$lib/components/EngineersTable.svelte";
  import EngineerDetailModal from "$lib/components/EngineerDetailModal.svelte";
  import { WIP_LIMIT } from "../../constants/thresholds";
  import {
    getGapsCountStatus,
    getStatusTextColor,
  } from "$lib/utils/status-colors";
  import { teamsStore } from "$lib/stores/database";
  import { teamFilterStore } from "$lib/stores/team-filter";
  import type { Engineer } from "../../db/schema";

  interface Props {
    data: {
      engineerTeamMapping: Record<string, string>;
    };
  }

  let { data }: Props = $props();
  const engineerTeamMapping = $derived(data.engineerTeamMapping);

  interface EngineerData {
    assignee_id: string;
    assignee_name: string;
    avatar_url: string | null;
    team_ids: string;
    team_names: string;
    wip_issue_count: number;
    wip_total_points: number;
    wip_limit_violation: number;
    oldest_wip_age_days: number | null;
    last_activity_at: string | null;
    missing_estimate_count: number;
    missing_priority_count: number;
    no_recent_comment_count: number;
    wip_age_violation_count: number;
    active_issues: string;
  }

  let engineers = $state<EngineerData[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let selectedEngineer = $state<EngineerData | null>(null);

  // Team project engineers state (engineers working on the team's projects)
  let teamProjectEngineers = $state<Engineer[]>([]);

  async function loadEngineers() {
    if (!browser) return;
    try {
      loading = true;
      error = null;
      const response = await fetch("/api/engineers");
      if (!response.ok) {
        throw new Error("Failed to fetch engineers");
      }
      const data = await response.json();
      engineers = data.engineers || [];
    } catch (e) {
      error = e instanceof Error ? e.message : "Unknown error";
    } finally {
      loading = false;
    }
  }

  // Fetch engineers working on team projects
  async function fetchTeamProjectEngineers(teamKey: string) {
    if (!browser) return;
    try {
      const response = await fetch(`/api/engineers/wip-stats/${teamKey}`);
      const data = await response.json();
      teamProjectEngineers = data.engineers || [];
    } catch (e) {
      console.error("Failed to fetch team project engineers:", e);
      teamProjectEngineers = [];
    }
  }

  onMount(() => {
    loadEngineers();
  });

  function handleEngineerClick(engineer: EngineerData): void {
    selectedEngineer = engineer;
  }

  function closeModal(): void {
    selectedEngineer = null;
  }

  // Get current team filter
  const filter = $derived($teamFilterStore);
  const selectedTeamKey = $derived(filter.teamKey);

  // Fetch team-specific data when team filter changes
  $effect(() => {
    if (selectedTeamKey) {
      fetchTeamProjectEngineers(selectedTeamKey);
    } else {
      teamProjectEngineers = [];
    }
  });

  // Get team display name
  function getTeamDisplayName(teamKey: string): string {
    const teams = $teamsStore;
    const team = teams.find((t) => t.teamKey === teamKey);
    if (team) {
      return `${team.teamName} (${teamKey})`;
    }
    return teamKey;
  }

  // Check if we have a team mapping configured
  const hasMappingConfigured = $derived(
    Object.keys(engineerTeamMapping).length > 0
  );

  // Get engineers from ENGINEER_TEAM_MAPPING for the selected team
  const teamMappedEngineers = $derived.by((): EngineerData[] => {
    if (!selectedTeamKey || !hasMappingConfigured) {
      return [];
    }

    // Get engineer names mapped to the selected team
    const mappedNames = new Set<string>();
    for (const [name, teamKey] of Object.entries(engineerTeamMapping)) {
      if (teamKey === selectedTeamKey) {
        mappedNames.add(name);
      }
    }

    // Filter engineers to only those mapped to this team
    return engineers.filter((e) => mappedNames.has(e.assignee_name));
  });

  // Get cross-team collaborators (engineers NOT in team mapping but working on team's projects)
  const crossTeamCollaborators = $derived.by((): EngineerData[] => {
    if (!selectedTeamKey || !hasMappingConfigured) {
      return [];
    }

    // Get engineer names mapped to the selected team
    const mappedNames = new Set<string>();
    for (const [name, teamKey] of Object.entries(engineerTeamMapping)) {
      if (teamKey === selectedTeamKey) {
        mappedNames.add(name);
      }
    }

    // Filter teamProjectEngineers to only those NOT in the team mapping
    return teamProjectEngineers
      .filter((e) => !mappedNames.has(e.assignee_name))
      .map(
        (e) =>
          ({
            assignee_id: e.assignee_id,
            assignee_name: e.assignee_name,
            avatar_url: e.avatar_url,
            team_ids: e.team_ids,
            team_names: e.team_names,
            wip_issue_count: e.wip_issue_count,
            wip_total_points: e.wip_total_points,
            wip_limit_violation: e.wip_limit_violation,
            oldest_wip_age_days: e.oldest_wip_age_days,
            last_activity_at: e.last_activity_at,
            missing_estimate_count: e.missing_estimate_count,
            missing_priority_count: e.missing_priority_count,
            no_recent_comment_count: e.no_recent_comment_count,
            wip_age_violation_count: e.wip_age_violation_count,
            active_issues: e.active_issues,
          }) as EngineerData
      );
  });

  // Combined engineers for stats (team members + collaborators when filtered)
  const displayEngineers = $derived.by((): EngineerData[] => {
    if (!selectedTeamKey || !hasMappingConfigured) {
      return engineers;
    }
    return [...teamMappedEngineers, ...crossTeamCollaborators];
  });

  // Computed stats (based on displayed engineers)
  const totalEngineers = $derived(displayEngineers.length);
  const totalWIPIssues = $derived(
    displayEngineers.reduce((sum, e) => sum + e.wip_issue_count, 0)
  );
  const engineersOverLimit = $derived(
    displayEngineers.filter((e) => e.wip_limit_violation).length
  );
  const totalViolations = $derived(
    displayEngineers.reduce(
      (sum, e) =>
        sum +
        e.missing_estimate_count +
        e.missing_priority_count +
        e.no_recent_comment_count +
        e.wip_age_violation_count,
      0
    )
  );
  const avgWIPPerEngineer = $derived(
    totalEngineers > 0 ? (totalWIPIssues / totalEngineers).toFixed(1) : "0"
  );

  // Sort function for engineers
  function sortEngineers(engineerList: EngineerData[]): EngineerData[] {
    return [...engineerList].sort((a, b) => {
      // First by WIP limit violation
      if (a.wip_limit_violation !== b.wip_limit_violation) {
        return b.wip_limit_violation - a.wip_limit_violation;
      }
      // Then by WIP count descending
      return b.wip_issue_count - a.wip_issue_count;
    });
  }

  // Sorted engineers for display
  const sortedEngineers = $derived(sortEngineers(engineers));
  const sortedTeamMappedEngineers = $derived(
    sortEngineers(teamMappedEngineers)
  );
  const sortedCrossTeamCollaborators = $derived(
    sortEngineers(crossTeamCollaborators)
  );
</script>

<div class="space-y-6">
  <!-- Header -->
  <div
    class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
  >
    <div>
      <h1 class="text-3xl font-bold text-neutral-900 dark:text-white">
        Engineer WIP
      </h1>
      <p class="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
        Work-in-progress tracking and gaps by engineer
      </p>
    </div>
  </div>

  <!-- Stats summary -->
  {#if !loading && !error && engineers.length > 0}
    <div class="flex flex-wrap gap-4">
      <Card class="max-w-[180px]">
        <div class="mb-1 text-xs text-neutral-500 dark:text-neutral-300">
          Engineers
        </div>
        <div class="text-2xl font-semibold text-neutral-900 dark:text-white">
          {totalEngineers}
        </div>
        <div class="text-xs text-neutral-500">with active WIP</div>
      </Card>
      <Card class="max-w-[180px]">
        <div class="mb-1 text-xs text-neutral-500 dark:text-neutral-300">
          Total WIP Issues
        </div>
        <div class="text-2xl font-semibold text-neutral-900 dark:text-white">
          {totalWIPIssues}
        </div>
        <div class="text-xs text-neutral-500">in progress</div>
      </Card>
      <Card class="max-w-[180px]">
        <div class="mb-1 text-xs text-neutral-500 dark:text-neutral-300">
          Avg WIP/Engineer
        </div>
        <div class="text-2xl font-semibold text-neutral-900 dark:text-white">
          {avgWIPPerEngineer}
        </div>
        <div class="text-xs text-neutral-500">
          limit: {WIP_LIMIT}
        </div>
      </Card>
      <Card class="max-w-[180px]">
        <div class="mb-1 text-xs text-neutral-500 dark:text-neutral-300">
          Over WIP Limit
        </div>
        <div
          class="text-2xl font-semibold {engineersOverLimit > 0
            ? 'text-amber-500'
            : 'text-emerald-500'}"
        >
          {engineersOverLimit}
        </div>
        <div class="text-xs text-neutral-500">
          engineers (>{WIP_LIMIT})
        </div>
      </Card>
      <Card class="max-w-[180px]">
        <div class="mb-1 text-xs text-neutral-500 dark:text-neutral-300">
          Total Gaps
        </div>
        <div
          class="text-2xl font-semibold {getStatusTextColor(
            getGapsCountStatus(totalViolations)
          )}"
        >
          {totalViolations}
        </div>
        <div class="text-xs text-neutral-500">across all engineers</div>
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
  {:else if engineers.length === 0}
    <Card>
      <div class="mb-3 text-sm font-medium text-neutral-900 dark:text-white">
        No Engineers with Active WIP
      </div>
      <p class="text-neutral-700 dark:text-neutral-400">
        No engineers currently have issues in progress. Sync the database to
        load data from Linear.
      </p>
    </Card>
  {:else if selectedTeamKey && hasMappingConfigured}
    <!-- Team-filtered view with separate cards -->
    <!-- Team Engineers Section -->
    {#if sortedTeamMappedEngineers.length > 0}
      <Card class="p-0 overflow-hidden">
        <div
          class="flex flex-wrap items-center justify-between gap-4 px-4 py-3 border-b border-white/10 bg-white/5"
        >
          <div class="flex items-center gap-3">
            <h2 class="text-lg font-semibold text-white">
              {getTeamDisplayName(selectedTeamKey)} Engineers
            </h2>
            <Badge variant="outline"
              >{sortedTeamMappedEngineers.length} engineers</Badge
            >
          </div>
        </div>
        <EngineersTable
          engineers={sortedTeamMappedEngineers}
          onEngineerClick={handleEngineerClick}
        />
      </Card>
    {:else}
      <Card>
        <div class="py-4 text-center text-neutral-400">
          No engineers mapped to {getTeamDisplayName(selectedTeamKey)}
        </div>
      </Card>
    {/if}

    <!-- Cross-Team Collaborators Section -->
    {#if sortedCrossTeamCollaborators.length > 0}
      <Card class="p-0 overflow-hidden">
        <div
          class="flex flex-wrap items-center justify-between gap-4 px-4 py-3 border-b border-white/10 bg-white/5"
        >
          <div class="flex items-center gap-3">
            <h2 class="text-lg font-semibold text-white">
              Cross-Team Collaborators
            </h2>
            <Badge variant="outline"
              >{sortedCrossTeamCollaborators.length} engineers</Badge
            >
          </div>
          <span class="text-xs text-neutral-400">
            Engineers from other teams working on {getTeamDisplayName(
              selectedTeamKey
            )} issues
          </span>
        </div>
        <EngineersTable
          engineers={sortedCrossTeamCollaborators}
          onEngineerClick={handleEngineerClick}
        />
      </Card>
    {/if}
  {:else}
    <!-- Default view: all engineers in one table -->
    <Card class="p-0 overflow-hidden">
      <EngineersTable
        engineers={sortedEngineers}
        onEngineerClick={handleEngineerClick}
      />
    </Card>
  {/if}
</div>

<!-- Engineer Detail Modal -->
{#if selectedEngineer}
  <EngineerDetailModal engineer={selectedEngineer} onclose={closeModal} />
{/if}

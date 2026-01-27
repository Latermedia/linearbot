<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import Card from "$lib/components/Card.svelte";
  import Skeleton from "$lib/components/Skeleton.svelte";
  import EngineersTable from "$lib/components/EngineersTable.svelte";
  import EngineerDetailModal from "$lib/components/EngineerDetailModal.svelte";
  import { WIP_LIMIT } from "../../../constants/thresholds";
  import {
    getGapsCountStatus,
    getStatusTextColor,
  } from "$lib/utils/status-colors";
  import { teamsStore } from "$lib/stores/database";
  import { teamFilterStore } from "$lib/stores/team-filter";
  import { getTeamsForDomain } from "../../../utils/domain-mapping";

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

  onMount(() => {
    loadEngineers();
  });

  function handleEngineerClick(engineer: EngineerData): void {
    selectedEngineer = engineer;
  }

  function closeModal(): void {
    selectedEngineer = null;
  }

  // Get current team filter and convert to team names for filtering
  const filter = $derived($teamFilterStore);
  const teams = $derived($teamsStore);

  // Get team names for filtering (either specific team or all teams in domain)
  const filterTeamNames = $derived.by((): Set<string> | null => {
    // If team filter is set, get that team's name
    if (filter.teamKey) {
      const team = teams.find((t) => t.teamKey === filter.teamKey);
      if (team) return new Set([team.teamName]);
      return null;
    }
    // If domain filter is set, get all team names in that domain
    if (filter.domain) {
      const teamKeys = getTeamsForDomain(filter.domain);
      const names = new Set<string>();
      for (const teamKey of teamKeys) {
        const team = teams.find((t) => t.teamKey === teamKey);
        if (team) names.add(team.teamName);
      }
      return names.size > 0 ? names : null;
    }
    return null;
  });

  // Filter engineers by team/domain
  const filteredEngineers = $derived.by(() => {
    if (!filterTeamNames) return engineers;
    return engineers.filter((e) => {
      try {
        const engineerTeamNames: string[] = JSON.parse(e.team_names);
        return engineerTeamNames.some((name) => filterTeamNames.has(name));
      } catch {
        return false;
      }
    });
  });

  // Computed stats
  const totalEngineers = $derived(filteredEngineers.length);
  const totalWIPIssues = $derived(
    filteredEngineers.reduce((sum, e) => sum + e.wip_issue_count, 0)
  );
  const engineersOverLimit = $derived(
    filteredEngineers.filter((e) => e.wip_limit_violation).length
  );
  const totalViolations = $derived(
    filteredEngineers.reduce(
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

  // Sort engineers: violations first, then by WIP count descending
  const sortedEngineers = $derived.by(() => {
    return [...filteredEngineers].sort((a, b) => {
      if (a.wip_limit_violation !== b.wip_limit_violation) {
        return b.wip_limit_violation - a.wip_limit_violation;
      }
      return b.wip_issue_count - a.wip_issue_count;
    });
  });
</script>

<div class="space-y-6">
  <!-- Stats summary -->
  {#if !loading && !error && engineers.length > 0}
    <div class="flex flex-wrap gap-4">
      <Card class="max-w-[180px]">
        <div class="mb-1 text-xs text-black-500 dark:text-black-300">
          Engineers
        </div>
        <div
          class="text-2xl font-semibold text-black-900 dark:text-black-900 dark:text-white"
        >
          {totalEngineers}
        </div>
        <div class="text-xs text-black-500">with active WIP</div>
      </Card>
      <Card class="max-w-[180px]">
        <div class="mb-1 text-xs text-black-500 dark:text-black-300">
          Total WIP Issues
        </div>
        <div
          class="text-2xl font-semibold text-black-900 dark:text-black-900 dark:text-white"
        >
          {totalWIPIssues}
        </div>
        <div class="text-xs text-black-500">in progress</div>
      </Card>
      <Card class="max-w-[180px]">
        <div class="mb-1 text-xs text-black-500 dark:text-black-300">
          Avg WIP/Engineer
        </div>
        <div
          class="text-2xl font-semibold text-black-900 dark:text-black-900 dark:text-white"
        >
          {avgWIPPerEngineer}
        </div>
        <div class="text-xs text-black-500">limit: {WIP_LIMIT}</div>
      </Card>
      <Card class="max-w-[180px]">
        <div class="mb-1 text-xs text-black-500 dark:text-black-300">
          Over WIP Limit
        </div>
        <div
          class="text-2xl font-semibold {engineersOverLimit > 0
            ? 'text-warning-500'
            : 'text-success-500'}"
        >
          {engineersOverLimit}
        </div>
        <div class="text-xs text-black-500">engineers (>{WIP_LIMIT})</div>
      </Card>
      <Card class="max-w-[180px]">
        <div class="mb-1 text-xs text-black-500 dark:text-black-300">
          Total Gaps
        </div>
        <div
          class="text-2xl font-semibold {getStatusTextColor(
            getGapsCountStatus(totalViolations)
          )}"
        >
          {totalViolations}
        </div>
        <div class="text-xs text-black-500">across all engineers</div>
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
    <Card class="border-danger-500/50">
      <div
        class="mb-3 text-sm font-medium text-danger-600 dark:text-danger-400"
      >
        Error Loading Data
      </div>
      <p class="mb-3 text-black-700 dark:text-black-400">{error}</p>
      <p class="text-sm text-black-600 dark:text-black-500">
        Make sure the database is synced. Run: <code
          class="px-2 py-1 font-mono text-xs rounded bg-black-100 dark:bg-black-800 text-black-700 dark:text-black-300"
          >bun run sync</code
        >
      </p>
    </Card>
  {:else if engineers.length === 0}
    <Card>
      <div
        class="mb-3 text-sm font-medium text-black-900 dark:text-black-900 dark:text-white"
      >
        No Engineers with Active WIP
      </div>
      <p class="text-black-700 dark:text-black-400">
        No engineers currently have issues in progress. Sync the database to
        load data from Linear.
      </p>
    </Card>
  {:else}
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

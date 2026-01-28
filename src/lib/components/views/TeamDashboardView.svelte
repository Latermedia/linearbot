<script lang="ts">
  import { onMount } from "svelte";
  import { slide, fade } from "svelte/transition";
  import { quartOut } from "svelte/easing";
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import Card from "$lib/components/Card.svelte";
  import MetricsHeader from "$lib/components/metrics/MetricsHeader.svelte";
  import PillarCardGrid from "$lib/components/metrics/PillarCardGrid.svelte";
  import TrendsSection from "$lib/components/metrics/TrendsSection.svelte";
  import { teamFilterStore } from "$lib/stores/team-filter";
  import { pageLoading } from "$lib/stores/page-loading";
  import TeamFilterNotice from "$lib/components/TeamFilterNotice.svelte";
  import type { MetricsSnapshotV1 } from "../../../types/metrics-snapshot";
  import type { LatestMetricsResponse } from "../../../routes/api/metrics/latest/+server";
  import type {
    TrendDataPoint,
    TrendsResponse,
  } from "../../../routes/api/metrics/trends/+server";

  // Domain/Team structure from API
  interface TeamMember {
    id: string;
    name: string;
  }

  interface Team {
    teamKey: string;
    teamName: string | null;
    domain: string | null;
    members?: TeamMember[];
  }

  interface Domain {
    name: string;
    teams: Team[];
  }

  // Props
  interface Props {
    engineerTeamMapping?: Record<string, string>;
  }

  let { engineerTeamMapping = {} }: Props = $props();

  // Metrics state
  let metricsLoading = $state(true);
  let metricsError = $state<string | null>(null);
  let orgSnapshot = $state<MetricsSnapshotV1 | null>(null);
  let allSnapshots = $state<
    Array<{
      level: string;
      levelId: string | null;
      snapshot: MetricsSnapshotV1;
      capturedAt: string;
    }>
  >([]);
  let teamNames = $state<Record<string, string>>({});

  // Organization structure state
  let organizationDomains = $state<Domain[]>([]);
  let organizationLoading = $state(true);

  // Trend data state
  let trendDataPoints = $state<TrendDataPoint[]>([]);
  let trendLoading = $state(true);
  let showTrends = $state(false);

  // Organization table state - default to collapsed (domains only)
  let showTeams = $state(false);

  // Filter state
  const filter = $derived($teamFilterStore);

  // Pillar click handler - navigate to dedicated metric pages
  function handlePillarClick(
    pillar:
      | "wipHealth"
      | "projectHealth"
      | "productivity"
      | "quality"
      | "linearHygiene"
  ) {
    const routes: Record<string, string> = {
      wipHealth: "/wip-health",
      projectHealth: "/project-health",
      productivity: "/productivity",
      quality: "/quality",
      linearHygiene: "/linear-hygiene",
    };
    goto(routes[pillar]);
  }

  // Table metric click handler - set filter and navigate
  function handleTableMetricClick(
    pillar:
      | "wipHealth"
      | "projectHealth"
      | "productivity"
      | "quality"
      | "linearHygiene",
    type: "domain" | "team",
    id: string
  ) {
    // Set the appropriate filter
    if (type === "domain") {
      teamFilterStore.setDomain(id);
    } else {
      teamFilterStore.setTeam(id);
    }
    // Navigate to the metric page
    handlePillarClick(pillar);
  }

  // Fetch metrics data
  async function fetchMetrics() {
    if (!browser) return;

    metricsLoading = true;
    metricsError = null;

    try {
      // Fetch all latest snapshots
      const response = await fetch("/api/metrics/latest?all=true");
      const data = (await response.json()) as LatestMetricsResponse;

      if (!data.success) {
        metricsError = data.error || "Failed to fetch metrics";
        return;
      }

      allSnapshots = data.snapshots || [];
      teamNames = data.teamNames || {};

      // Extract org snapshot
      const org = allSnapshots.find((s) => s.level === "org");
      orgSnapshot = org?.snapshot || null;
    } catch (e) {
      metricsError = e instanceof Error ? e.message : "Failed to fetch metrics";
    } finally {
      metricsLoading = false;
    }
  }

  // Fetch organization structure (domains and teams)
  async function fetchOrganization() {
    if (!browser) return;

    organizationLoading = true;

    try {
      const response = await fetch("/api/teams");
      const data = await response.json();

      if (data.domains) {
        organizationDomains = data.domains;
      }
    } catch (e) {
      console.error("Failed to fetch organization structure:", e);
    } finally {
      organizationLoading = false;
    }
  }

  // Fetch trend data for all-time view (based on current filter)
  async function fetchTrendData(
    levelOverride?: string,
    levelIdOverride?: string | null
  ) {
    if (!browser) return;

    trendLoading = true;

    try {
      // Determine level and levelId based on filter or overrides
      let level = levelOverride || "org";
      let levelId = levelIdOverride !== undefined ? levelIdOverride : null;

      if (!levelOverride) {
        if (filter.teamKey) {
          level = "team";
          levelId = filter.teamKey;
        } else if (filter.domain) {
          level = "domain";
          levelId = filter.domain;
        }
      }

      // Build URL with appropriate parameters
      let url = `/api/metrics/trends?level=${level}&limit=10000`;
      if (levelId) {
        url += `&levelId=${encodeURIComponent(levelId)}`;
      }

      const response = await fetch(url);
      const data = (await response.json()) as TrendsResponse;

      if (data.success && data.dataPoints) {
        // Sort by capturedAt ascending (oldest first, time flows left to right)
        trendDataPoints = data.dataPoints.sort(
          (a, b) =>
            new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime()
        );
      }
    } catch (e) {
      console.error("Failed to fetch trend data:", e);
    } finally {
      trendLoading = false;
    }
  }

  // Load on mount
  onMount(() => {
    pageLoading.startLoading("/");
    fetchMetrics();
    fetchTrendData();
    fetchOrganization();
  });

  // Refetch trend data when filter changes
  let previousFilter = $state<{
    domain: string | null;
    teamKey: string | null;
  }>({ domain: null, teamKey: null });
  $effect(() => {
    // Check if filter actually changed (not just initial render)
    if (
      filter.domain !== previousFilter.domain ||
      filter.teamKey !== previousFilter.teamKey
    ) {
      previousFilter = { ...filter };
      // Don't refetch on initial mount (handled by onMount)
      if (
        previousFilter.domain !== null ||
        previousFilter.teamKey !== null ||
        (filter.domain === null && filter.teamKey === null && !trendLoading)
      ) {
        fetchTrendData();
      }
    }
  });

  // Track when all loading completes
  let wasLoading = $state(true);
  $effect(() => {
    const isLoading = metricsLoading || organizationLoading;
    if (wasLoading && !isLoading) {
      pageLoading.stopLoading("/");
    }
    wasLoading = isLoading;
  });

  // Get team snapshots map for quick lookup
  const teamSnapshotsMap = $derived.by(() => {
    const map = new Map<string, MetricsSnapshotV1>();
    for (const s of allSnapshots) {
      if (s.level === "team" && s.levelId) {
        map.set(s.levelId, s.snapshot);
      }
    }
    return map;
  });

  // Get domain snapshots map
  const domainSnapshotsMap = $derived.by(() => {
    const map = new Map<string, MetricsSnapshotV1>();
    for (const s of allSnapshots) {
      if (s.level === "domain" && s.levelId) {
        map.set(s.levelId, s.snapshot);
      }
    }
    return map;
  });

  // Get the active snapshot based on filter (team > domain > org)
  const activeSnapshot = $derived.by((): MetricsSnapshotV1 | null => {
    if (filter.teamKey) {
      return teamSnapshotsMap.get(filter.teamKey) || null;
    }
    if (filter.domain) {
      return domainSnapshotsMap.get(filter.domain) || null;
    }
    return orgSnapshot;
  });

  // Get the page title based on filter
  const pageTitle = $derived.by((): string => {
    if (filter.teamKey) {
      // Find team name
      for (const domain of organizationDomains) {
        const team = domain.teams.find((t) => t.teamKey === filter.teamKey);
        if (team) {
          return team.teamName
            ? `${team.teamName} (${filter.teamKey})`
            : filter.teamKey;
        }
      }
      return teamNames[filter.teamKey]
        ? `${teamNames[filter.teamKey]} (${filter.teamKey})`
        : filter.teamKey;
    }
    if (filter.domain) {
      return filter.domain;
    }
    return "Overview";
  });

  // Get team display name
  function getTeamDisplayName(
    teamKey: string,
    teamName: string | null
  ): string {
    const name = teamName || teamNames[teamKey];
    if (name) {
      return `${name} (${teamKey})`;
    }
    return teamKey;
  }

  // Check if we have any organization data to display
  const hasOrganizationData = $derived(
    organizationDomains.length > 0 ||
      domainSnapshotsMap.size > 0 ||
      teamSnapshotsMap.size > 0
  );

  // Combined domains list - uses organizationDomains if available, otherwise builds from domainSnapshotsMap
  // Filtered based on teamFilterStore
  const displayDomains = $derived.by((): Domain[] => {
    let domains: Domain[] = [];

    // If we have organization domains from the API, use those
    if (organizationDomains.length > 0) {
      domains = organizationDomains;
    } else {
      // Otherwise, build domains from the snapshot data
      for (const [domainName] of domainSnapshotsMap) {
        domains.push({
          name: domainName,
          teams: [], // No team info available from snapshots alone
        });
      }
    }

    // Apply filter
    if (filter.teamKey) {
      // Filter to just the domain containing this team, with only that team
      return domains
        .map((domain) => {
          const matchingTeam = domain.teams.find(
            (t) => t.teamKey === filter.teamKey
          );
          if (matchingTeam) {
            return { ...domain, teams: [matchingTeam] };
          }
          return null;
        })
        .filter((d): d is Domain => d !== null);
    }

    if (filter.domain) {
      // Filter to just the selected domain
      return domains.filter((d) => d.name === filter.domain);
    }

    return domains;
  });

  // Helper to get productivity percentage from a snapshot
  function getProductivityPercent(
    snapshot: MetricsSnapshotV1 | undefined
  ): { pct: number; status: string } | null {
    const prod = snapshot?.teamProductivity;
    if (
      !prod ||
      !("trueThroughputPerEngineer" in prod) ||
      prod.trueThroughputPerEngineer === null
    ) {
      return null;
    }
    const weeklyRate = prod.trueThroughputPerEngineer / 2;
    const pctOfGoal = Math.round((weeklyRate / 3) * 100);
    return { pct: pctOfGoal, status: prod.status };
  }

  // Helper to get status color class
  function getStatusColorClass(status: string | undefined): string {
    switch (status) {
      case "peakFlow":
        return "text-success-400";
      case "strongRhythm":
        return "text-success-500";
      case "steadyProgress":
        return "text-warning-500";
      case "earlyTraction":
        return "text-danger-500";
      case "lowTraction":
        return "text-danger-600";
      default:
        return "text-black-600 dark:text-black-400";
    }
  }

  // Get standalone teams (teams not in any domain)
  const standaloneTeams = $derived.by(() => {
    // Collect all teams that are in domains
    const teamsInDomains = new Set<string>();
    for (const domain of displayDomains) {
      for (const team of domain.teams) {
        teamsInDomains.add(team.teamKey);
      }
    }

    // Find team snapshots that aren't in any domain
    const standalone: Team[] = [];
    for (const [teamKey] of teamSnapshotsMap) {
      if (!teamsInDomains.has(teamKey)) {
        standalone.push({
          teamKey,
          teamName: teamNames[teamKey] || null,
          domain: null,
        });
      }
    }

    return standalone;
  });
</script>

<div class="space-y-6">
  <!-- Header with rotating principles -->
  <MetricsHeader
    title={pageTitle}
    {showTrends}
    onToggleTrends={() => (showTrends = !showTrends)}
  />

  <!-- Filter indicator -->
  <TeamFilterNotice showLevelNotice={false} />

  <!-- Health Metrics + Trends (filtered by team/domain selection) -->
  <div>
    <PillarCardGrid
      snapshot={activeSnapshot}
      loading={metricsLoading && !activeSnapshot}
      error={metricsError}
      productivityUnderConstruction={false}
      onPillarClick={handlePillarClick}
      {engineerTeamMapping}
      variant="hero"
    />

    {#if showTrends}
      <div
        class="mt-6 overflow-hidden"
        transition:slide={{ duration: 300, easing: quartOut }}
      >
        <div transition:fade={{ duration: 200, easing: quartOut }}>
          <TrendsSection
            dataPoints={trendDataPoints}
            loading={trendLoading}
            title=""
            noMargin
            domains={organizationDomains}
          />
        </div>
      </div>
    {/if}
  </div>

  <!-- Organization Metrics Table -->
  <div class="mt-8 border-t border-black-200 dark:border-white/10 pt-6">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-lg font-semibold text-black-900 dark:text-white">
        {#if filter.teamKey}
          Team Details
        {:else if filter.domain}
          {filter.domain} Domain
        {:else}
          Organization
        {/if}
      </h2>
      {#if !filter.teamKey}
        <div class="flex gap-2 items-center">
          <span class="text-xs text-black-600 dark:text-black-400">Teams</span>
          <button
            type="button"
            role="switch"
            aria-checked={showTeams}
            onclick={() => (showTeams = !showTeams)}
            class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20 {showTeams
              ? 'bg-brand-600'
              : 'bg-black-700'}"
          >
            <span class="sr-only">Show teams</span>
            <span
              class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out {showTeams
                ? 'translate-x-4'
                : 'translate-x-0.5'}"
            ></span>
          </button>
        </div>
      {/if}
    </div>
  </div>

  {#if metricsLoading || organizationLoading}
    <div class="py-16"></div>
  {:else if !hasOrganizationData}
    <Card>
      <div class="py-8 text-center">
        <div class="mb-2 text-black-600 dark:text-black-400">
          No organization data available
        </div>
        <p class="text-sm text-black-500">
          Configure TEAM_DOMAIN_MAPPINGS to see domain and team metrics.
        </p>
      </div>
    </Card>
  {:else}
    <Card class="p-0 overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr
              class="text-left text-xs font-medium text-black-500 uppercase tracking-wider border-b border-white/10 bg-ambient-600 dark:bg-white/5"
            >
              <th class="px-4 py-3">Name</th>
              <th class="px-4 py-3 text-center whitespace-nowrap">Engineers</th>
              <th class="px-4 py-3 text-center whitespace-nowrap">Hygiene</th>
              <th class="px-4 py-3 text-center whitespace-nowrap">WIP Health</th
              >
              <th class="px-4 py-3 text-center whitespace-nowrap"
                >Project Health</th
              >
              <th class="px-4 py-3 text-center whitespace-nowrap"
                >Productivity</th
              >
              <th class="px-4 py-3 text-center whitespace-nowrap">Quality</th>
            </tr>
          </thead>
          {#each displayDomains as domain (domain.name)}
            {@const domainSnapshot = domainSnapshotsMap.get(domain.name)}
            {@const domainEngineerCount =
              domainSnapshot?.teamHealth?.totalIcCount ??
              domain.teams.reduce(
                (sum, t) => sum + (t.members?.length || 0),
                0
              )}
            <!-- Domain tbody -->
            <tbody class="divide-y divide-white/5">
              <!-- Domain row -->
              <tr
                class="bg-ambient-500 dark:bg-white/3 hover:bg-ambient-400 dark:hover:bg-white/5 transition-colors"
              >
                <td class="px-4 py-3">
                  <span
                    class="text-sm font-semibold text-black-900 dark:text-white"
                    >{domain.name}</span
                  >
                  <span class="ml-2 text-xs text-black-500"
                    >({domain.teams.length} teams)</span
                  >
                </td>
                <td class="px-4 py-3 text-center">
                  <span
                    class="text-sm font-medium text-black-700 dark:text-black-300"
                    >{domainEngineerCount}</span
                  >
                </td>
                <td class="px-4 py-3 text-center">
                  {#if domainSnapshotsMap.get(domain.name)?.linearHygiene}
                    {@const hygiene = domainSnapshotsMap.get(
                      domain.name
                    )?.linearHygiene}
                    <button
                      type="button"
                      class="text-sm font-medium hover:underline cursor-pointer {getStatusColorClass(
                        hygiene?.status
                      )}"
                      onclick={() =>
                        handleTableMetricClick(
                          "linearHygiene",
                          "domain",
                          domain.name
                        )}
                    >
                      {hygiene?.hygieneScore}%
                    </button>
                  {:else}
                    <span class="text-sm text-black-500">—</span>
                  {/if}
                </td>
                <td class="px-4 py-3 text-center">
                  {#if domainSnapshotsMap.get(domain.name)?.teamHealth}
                    {@const wip = domainSnapshotsMap.get(
                      domain.name
                    )?.teamHealth}
                    <button
                      type="button"
                      class="text-sm font-medium hover:underline cursor-pointer {getStatusColorClass(
                        wip?.status
                      )}"
                      onclick={() =>
                        handleTableMetricClick(
                          "wipHealth",
                          "domain",
                          domain.name
                        )}
                    >
                      {wip?.healthyWorkloadPercent.toFixed(0)}%
                    </button>
                  {:else}
                    <span class="text-sm text-black-500">—</span>
                  {/if}
                </td>
                <td class="px-4 py-3 text-center">
                  {#if domainSnapshotsMap.get(domain.name)?.velocityHealth}
                    {@const velocity = domainSnapshotsMap.get(
                      domain.name
                    )?.velocityHealth}
                    <button
                      type="button"
                      class="text-sm font-medium hover:underline cursor-pointer {getStatusColorClass(
                        velocity?.status
                      )}"
                      onclick={() =>
                        handleTableMetricClick(
                          "projectHealth",
                          "domain",
                          domain.name
                        )}
                    >
                      {velocity?.onTrackPercent.toFixed(0)}%
                    </button>
                  {:else}
                    <span class="text-sm text-black-500">—</span>
                  {/if}
                </td>
                <td class="px-4 py-3 text-center">
                  {#if getProductivityPercent(domainSnapshotsMap.get(domain.name))}
                    {@const prodData = getProductivityPercent(
                      domainSnapshotsMap.get(domain.name)
                    )}
                    <button
                      type="button"
                      class="text-sm font-medium hover:underline cursor-pointer {getStatusColorClass(
                        prodData?.status
                      )}"
                      onclick={() =>
                        handleTableMetricClick(
                          "productivity",
                          "domain",
                          domain.name
                        )}
                    >
                      {prodData?.pct}%
                    </button>
                  {:else}
                    <span class="text-sm text-black-500">—</span>
                  {/if}
                </td>
                <td class="px-4 py-3 text-center">
                  {#if domainSnapshotsMap.get(domain.name)?.quality}
                    {@const quality = domainSnapshotsMap.get(
                      domain.name
                    )?.quality}
                    <button
                      type="button"
                      class="text-sm font-medium hover:underline cursor-pointer {getStatusColorClass(
                        quality?.status
                      )}"
                      onclick={() =>
                        handleTableMetricClick(
                          "quality",
                          "domain",
                          domain.name
                        )}
                    >
                      {quality?.compositeScore}%
                    </button>
                  {:else}
                    <span class="text-sm text-black-500">—</span>
                  {/if}
                </td>
              </tr>
            </tbody>

            <!-- Team rows tbody -->
            {#if (showTeams || filter.teamKey) && domain.teams.length > 0}
              <tbody class="divide-y divide-white/5">
                {#each domain.teams as team (team.teamKey)}
                  {@const teamSnapshot = teamSnapshotsMap.get(team.teamKey)}
                  <tr
                    class="hover:bg-ambient-500 dark:hover:bg-white/3 transition-colors"
                  >
                    <td class="px-4 py-2.5 pl-8">
                      <span class="text-sm text-black-700 dark:text-black-300"
                        >{getTeamDisplayName(team.teamKey, team.teamName)}</span
                      >
                    </td>
                    <td class="px-4 py-2.5 text-center">
                      <span class="text-sm text-black-600 dark:text-black-400"
                        >{teamSnapshot?.teamHealth?.totalIcCount ??
                          team.members?.length ??
                          0}</span
                      >
                    </td>
                    <td class="px-4 py-2.5 text-center">
                      {#if teamSnapshotsMap.get(team.teamKey)?.linearHygiene}
                        {@const hygiene = teamSnapshotsMap.get(
                          team.teamKey
                        )?.linearHygiene}
                        <button
                          type="button"
                          class="text-sm hover:underline cursor-pointer {getStatusColorClass(
                            hygiene?.status
                          )}"
                          onclick={() =>
                            handleTableMetricClick(
                              "linearHygiene",
                              "team",
                              team.teamKey
                            )}
                        >
                          {hygiene?.hygieneScore}%
                        </button>
                      {:else}
                        <span class="text-sm text-black-500">—</span>
                      {/if}
                    </td>
                    <td class="px-4 py-2.5 text-center">
                      {#if teamSnapshotsMap.get(team.teamKey)?.teamHealth}
                        {@const wip = teamSnapshotsMap.get(
                          team.teamKey
                        )?.teamHealth}
                        <button
                          type="button"
                          class="text-sm hover:underline cursor-pointer {getStatusColorClass(
                            wip?.status
                          )}"
                          onclick={() =>
                            handleTableMetricClick(
                              "wipHealth",
                              "team",
                              team.teamKey
                            )}
                        >
                          {wip?.healthyWorkloadPercent.toFixed(0)}%
                        </button>
                      {:else}
                        <span class="text-sm text-black-500">—</span>
                      {/if}
                    </td>
                    <td class="px-4 py-2.5 text-center">
                      {#if teamSnapshotsMap.get(team.teamKey)?.velocityHealth}
                        {@const velocity = teamSnapshotsMap.get(
                          team.teamKey
                        )?.velocityHealth}
                        <button
                          type="button"
                          class="text-sm hover:underline cursor-pointer {getStatusColorClass(
                            velocity?.status
                          )}"
                          onclick={() =>
                            handleTableMetricClick(
                              "projectHealth",
                              "team",
                              team.teamKey
                            )}
                        >
                          {velocity?.onTrackPercent.toFixed(0)}%
                        </button>
                      {:else}
                        <span class="text-sm text-black-500">—</span>
                      {/if}
                    </td>
                    <td class="px-4 py-2.5 text-center">
                      <span class="text-sm text-black-500 italic">—</span>
                    </td>
                    <td class="px-4 py-2.5 text-center">
                      {#if teamSnapshotsMap.get(team.teamKey)?.quality}
                        {@const quality = teamSnapshotsMap.get(
                          team.teamKey
                        )?.quality}
                        <button
                          type="button"
                          class="text-sm hover:underline cursor-pointer {getStatusColorClass(
                            quality?.status
                          )}"
                          onclick={() =>
                            handleTableMetricClick(
                              "quality",
                              "team",
                              team.teamKey
                            )}
                        >
                          {quality?.compositeScore}%
                        </button>
                      {:else}
                        <span class="text-sm text-black-500">—</span>
                      {/if}
                    </td>
                  </tr>
                {/each}
              </tbody>
            {/if}
          {/each}

          <!-- Standalone teams (no domain grouping) - only shown when expanded or filtered -->
          {#if (showTeams || filter.teamKey) && standaloneTeams.length > 0}
            <tbody class="divide-y divide-white/5">
              {#each standaloneTeams as team (team.teamKey)}
                <tr
                  class="hover:bg-ambient-500 dark:hover:bg-white/3 transition-colors"
                >
                  <td class="px-4 py-2.5">
                    <span class="text-sm text-black-700 dark:text-black-300"
                      >{getTeamDisplayName(team.teamKey, team.teamName)}</span
                    >
                  </td>
                  <td class="px-4 py-2.5 text-center">
                    <span class="text-sm text-black-600 dark:text-black-400"
                      >—</span
                    >
                  </td>
                  <td class="px-4 py-2.5 text-center">
                    {#if teamSnapshotsMap.get(team.teamKey)?.linearHygiene}
                      {@const hygiene = teamSnapshotsMap.get(
                        team.teamKey
                      )?.linearHygiene}
                      <button
                        type="button"
                        class="text-sm hover:underline cursor-pointer {getStatusColorClass(
                          hygiene?.status
                        )}"
                        onclick={() =>
                          handleTableMetricClick(
                            "linearHygiene",
                            "team",
                            team.teamKey
                          )}
                      >
                        {hygiene?.hygieneScore}%
                      </button>
                    {:else}
                      <span class="text-sm text-black-500">—</span>
                    {/if}
                  </td>
                  <td class="px-4 py-2.5 text-center">
                    {#if teamSnapshotsMap.get(team.teamKey)?.teamHealth}
                      {@const wip = teamSnapshotsMap.get(
                        team.teamKey
                      )?.teamHealth}
                      <button
                        type="button"
                        class="text-sm hover:underline cursor-pointer {getStatusColorClass(
                          wip?.status
                        )}"
                        onclick={() =>
                          handleTableMetricClick(
                            "wipHealth",
                            "team",
                            team.teamKey
                          )}
                      >
                        {wip?.healthyWorkloadPercent.toFixed(0)}%
                      </button>
                    {:else}
                      <span class="text-sm text-black-500">—</span>
                    {/if}
                  </td>
                  <td class="px-4 py-2.5 text-center">
                    {#if teamSnapshotsMap.get(team.teamKey)?.velocityHealth}
                      {@const velocity = teamSnapshotsMap.get(
                        team.teamKey
                      )?.velocityHealth}
                      <button
                        type="button"
                        class="text-sm hover:underline cursor-pointer {getStatusColorClass(
                          velocity?.status
                        )}"
                        onclick={() =>
                          handleTableMetricClick(
                            "projectHealth",
                            "team",
                            team.teamKey
                          )}
                      >
                        {velocity?.onTrackPercent.toFixed(0)}%
                      </button>
                    {:else}
                      <span class="text-sm text-black-500">—</span>
                    {/if}
                  </td>
                  <td class="px-4 py-2.5 text-center">
                    <span class="text-sm text-black-500 italic">—</span>
                  </td>
                  <td class="px-4 py-2.5 text-center">
                    {#if teamSnapshotsMap.get(team.teamKey)?.quality}
                      {@const quality = teamSnapshotsMap.get(
                        team.teamKey
                      )?.quality}
                      <button
                        type="button"
                        class="text-sm hover:underline cursor-pointer {getStatusColorClass(
                          quality?.status
                        )}"
                        onclick={() =>
                          handleTableMetricClick(
                            "quality",
                            "team",
                            team.teamKey
                          )}
                      >
                        {quality?.compositeScore}%
                      </button>
                    {:else}
                      <span class="text-sm text-black-500">—</span>
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          {/if}
        </table>
      </div>
    </Card>
  {/if}
</div>

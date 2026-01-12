<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import Card from "$lib/components/Card.svelte";
  import Skeleton from "$lib/components/Skeleton.svelte";
  import Badge from "$lib/components/Badge.svelte";
  import type {
    MetricsSnapshotV1,
    PillarStatus,
  } from "../../types/metrics-snapshot";
  import type { LatestMetricsResponse } from "../api/metrics/latest/+server";

  // State
  let loading = $state(true);
  let error = $state<string | null>(null);
  let orgSnapshot = $state<MetricsSnapshotV1 | null>(null);
  let allSnapshots = $state<
    Array<{
      level: string;
      levelId: string | null;
      snapshot: MetricsSnapshotV1;
      capturedAt: string;
    }>
  >([]);
  let selectedLevel = $state<"org" | "domain" | "team">("org");

  // Fetch metrics data
  async function fetchMetrics() {
    if (!browser) return;

    loading = true;
    error = null;

    try {
      // Fetch all latest snapshots
      const response = await fetch("/api/metrics/latest?all=true");
      const data = (await response.json()) as LatestMetricsResponse;

      if (!data.success) {
        error = data.error || "Failed to fetch metrics";
        return;
      }

      allSnapshots = data.snapshots || [];

      // Extract org snapshot
      const org = allSnapshots.find((s) => s.level === "org");
      orgSnapshot = org?.snapshot || null;
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to fetch metrics";
    } finally {
      loading = false;
    }
  }

  // Load on mount
  onMount(() => {
    fetchMetrics();
  });

  // Get status color classes
  function getStatusClasses(status: PillarStatus): {
    bg: string;
    text: string;
    border: string;
  } {
    switch (status) {
      case "healthy":
        return {
          bg: "bg-emerald-500/10",
          text: "text-emerald-400",
          border: "border-emerald-500/30",
        };
      case "warning":
        return {
          bg: "bg-amber-500/10",
          text: "text-amber-400",
          border: "border-amber-500/30",
        };
      case "critical":
        return {
          bg: "bg-red-500/10",
          text: "text-red-400",
          border: "border-red-500/30",
        };
      default:
        return {
          bg: "bg-neutral-500/10",
          text: "text-neutral-400",
          border: "border-neutral-500/30",
        };
    }
  }

  // Get domain snapshots
  const domainSnapshots = $derived(
    allSnapshots.filter((s) => s.level === "domain")
  );

  // Get team snapshots
  const teamSnapshots = $derived(
    allSnapshots.filter((s) => s.level === "team")
  );

  // Currently viewed snapshot based on level (for future use)
  const _currentSnapshot = $derived.by(() => {
    if (selectedLevel === "org") return orgSnapshot;
    // For domain/team views, we could add a selector later
    return orgSnapshot;
  });

  // Status classes for each pillar (derived from orgSnapshot)
  const teamHealthStatusClasses = $derived(
    orgSnapshot ? getStatusClasses(orgSnapshot.teamHealth.status) : null
  );
  const velocityStatusClasses = $derived(
    orgSnapshot ? getStatusClasses(orgSnapshot.velocityHealth.status) : null
  );
  const qualityStatusClasses = $derived(
    orgSnapshot ? getStatusClasses(orgSnapshot.quality.status) : null
  );
</script>

<div class="space-y-6">
  <!-- Header -->
  <div>
    <h1 class="text-2xl font-semibold tracking-tight text-white">
      Engineering Metrics
    </h1>
    <p class="mt-1 text-sm text-neutral-400">
      Four Pillars health overview for leadership reviews
    </p>
  </div>

  <!-- Loading State -->
  {#if loading && !orgSnapshot}
    <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {#each [1, 2, 3, 4] as i (i)}
        <Card>
          <Skeleton class="mb-3 w-24 h-4" />
          <Skeleton class="mb-2 w-16 h-8" />
          <Skeleton class="w-full h-2" />
        </Card>
      {/each}
    </div>
  {:else if error}
    <!-- Error State -->
    <Card class="border-red-500/30">
      <div class="mb-2 text-sm font-medium text-red-400">
        Failed to load metrics
      </div>
      <p class="text-sm text-neutral-400">{error}</p>
      <p class="mt-2 text-xs text-neutral-500">
        Metrics are captured hourly after each sync. If you haven't synced yet,
        run a sync first or trigger a manual capture.
      </p>
    </Card>
  {:else if orgSnapshot}
    <!-- Four Pillars Overview -->
    <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <!-- Pillar 1: Team Health -->
      <Card
        class="transition-colors duration-150 hover:bg-white/5 {teamHealthStatusClasses?.border ||
          ''} border"
      >
        <div class="flex justify-between items-start mb-3">
          <div
            class="text-xs font-medium tracking-wide uppercase text-neutral-400"
          >
            Team Health
          </div>
          <Badge
            variant={orgSnapshot.teamHealth.status === "healthy"
              ? "success"
              : orgSnapshot.teamHealth.status === "warning"
                ? "warning"
                : "destructive"}
          >
            {orgSnapshot.teamHealth.status}
          </Badge>
        </div>

        <div class="space-y-3">
          <div>
            <div
              class="text-2xl font-semibold {teamHealthStatusClasses?.text ||
                ''}"
            >
              {orgSnapshot.teamHealth.healthyIcCount}/{orgSnapshot.teamHealth
                .totalIcCount}
            </div>
            <div class="text-xs text-neutral-500">ICs within WIP limits</div>
          </div>

          <div class="flex gap-4 text-xs">
            <div>
              <span class="text-neutral-400">Projects:</span>
              <span class="ml-1 text-white">
                {orgSnapshot.teamHealth.healthyProjectCount}/{orgSnapshot
                  .teamHealth.totalProjectCount}
              </span>
            </div>
            <div>
              <span class="text-neutral-400">IC Violations:</span>
              <span class="ml-1 text-white">
                {orgSnapshot.teamHealth.icWipViolationPercent.toFixed(0)}%
              </span>
            </div>
          </div>
        </div>
      </Card>

      <!-- Pillar 2: Velocity Health -->
      <Card
        class="transition-colors duration-150 hover:bg-white/5 {velocityStatusClasses?.border ||
          ''} border"
      >
        <div class="flex justify-between items-start mb-3">
          <div
            class="text-xs font-medium tracking-wide uppercase text-neutral-400"
          >
            Velocity Health
          </div>
          <Badge
            variant={orgSnapshot.velocityHealth.status === "healthy"
              ? "success"
              : orgSnapshot.velocityHealth.status === "warning"
                ? "warning"
                : "destructive"}
          >
            {orgSnapshot.velocityHealth.status}
          </Badge>
        </div>

        <div class="space-y-3">
          <div>
            <div
              class="text-2xl font-semibold {velocityStatusClasses?.text || ''}"
            >
              {orgSnapshot.velocityHealth.onTrackPercent.toFixed(0)}%
            </div>
            <div class="text-xs text-neutral-500">Projects on track</div>
          </div>

          <div class="flex gap-4 text-xs">
            <div>
              <span class="text-amber-400">At Risk:</span>
              <span class="ml-1 text-white">
                {orgSnapshot.velocityHealth.atRiskPercent.toFixed(0)}%
              </span>
            </div>
            <div>
              <span class="text-red-400">Off Track:</span>
              <span class="ml-1 text-white">
                {orgSnapshot.velocityHealth.offTrackPercent.toFixed(0)}%
              </span>
            </div>
          </div>
        </div>
      </Card>

      <!-- Pillar 3: Team Productivity (Pending) -->
      <Card
        class="border opacity-60 transition-colors duration-150 hover:bg-white/5 border-neutral-700/50"
      >
        <div class="flex justify-between items-start mb-3">
          <div
            class="text-xs font-medium tracking-wide uppercase text-neutral-400"
          >
            Productivity
          </div>
          <Badge variant="outline">pending</Badge>
        </div>

        <div class="space-y-3">
          <div>
            <div class="text-2xl font-semibold text-neutral-500">—</div>
            <div class="text-xs text-neutral-500">PR throughput</div>
          </div>

          <div class="text-xs italic text-neutral-500">
            {orgSnapshot.teamProductivity.notes}
          </div>
        </div>
      </Card>

      <!-- Pillar 4: Quality -->
      <Card
        class="transition-colors duration-150 hover:bg-white/5 {qualityStatusClasses?.border ||
          ''} border"
      >
        <div class="flex justify-between items-start mb-3">
          <div
            class="text-xs font-medium tracking-wide uppercase text-neutral-400"
          >
            Quality
          </div>
          <Badge
            variant={orgSnapshot.quality.status === "healthy"
              ? "success"
              : orgSnapshot.quality.status === "warning"
                ? "warning"
                : "destructive"}
          >
            {orgSnapshot.quality.status}
          </Badge>
        </div>

        <div class="space-y-3">
          <div>
            <div
              class="text-2xl font-semibold {qualityStatusClasses?.text || ''}"
            >
              {orgSnapshot.quality.compositeScore}
            </div>
            <div class="text-xs text-neutral-500">Quality score (0-100)</div>
          </div>

          <div class="flex gap-4 text-xs">
            <div>
              <span class="text-neutral-400">Open Bugs:</span>
              <span class="ml-1 text-white">
                {orgSnapshot.quality.openBugCount}
              </span>
            </div>
            <div>
              <span class="text-neutral-400">Net Change:</span>
              <span
                class="ml-1 {orgSnapshot.quality.netBugChange > 0
                  ? 'text-red-400'
                  : orgSnapshot.quality.netBugChange < 0
                    ? 'text-emerald-400'
                    : 'text-white'}"
              >
                {orgSnapshot.quality.netBugChange > 0 ? "+" : ""}{orgSnapshot
                  .quality.netBugChange}
              </span>
            </div>
          </div>
        </div>
      </Card>
    </div>

    <!-- Domain Breakdown -->
    {#if domainSnapshots.length > 0}
      <div class="mt-8">
        <h2 class="mb-4 text-lg font-medium text-white">By Domain</h2>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-white/10">
                <th class="px-4 py-3 font-medium text-left text-neutral-400">
                  Domain
                </th>
                <th class="px-4 py-3 font-medium text-center text-neutral-400">
                  Team Health
                </th>
                <th class="px-4 py-3 font-medium text-center text-neutral-400">
                  Velocity
                </th>
                <th class="px-4 py-3 font-medium text-center text-neutral-400">
                  Quality
                </th>
                <th class="px-4 py-3 font-medium text-right text-neutral-400">
                  ICs
                </th>
                <th class="px-4 py-3 font-medium text-right text-neutral-400">
                  Projects
                </th>
                <th class="px-4 py-3 font-medium text-right text-neutral-400">
                  Open Bugs
                </th>
              </tr>
            </thead>
            <tbody>
              {#each domainSnapshots as { levelId, snapshot } (levelId)}
                <tr
                  class="border-b transition-colors border-white/5 hover:bg-white/5"
                >
                  <td class="px-4 py-3 font-medium text-white">{levelId}</td>
                  <td class="px-4 py-3 text-center">
                    <Badge
                      variant={snapshot.teamHealth.status === "healthy"
                        ? "success"
                        : snapshot.teamHealth.status === "warning"
                          ? "warning"
                          : "destructive"}
                    >
                      {snapshot.teamHealth.status}
                    </Badge>
                  </td>
                  <td class="px-4 py-3 text-center">
                    <Badge
                      variant={snapshot.velocityHealth.status === "healthy"
                        ? "success"
                        : snapshot.velocityHealth.status === "warning"
                          ? "warning"
                          : "destructive"}
                    >
                      {snapshot.velocityHealth.onTrackPercent.toFixed(0)}% on
                      track
                    </Badge>
                  </td>
                  <td class="px-4 py-3 text-center">
                    <Badge
                      variant={snapshot.quality.status === "healthy"
                        ? "success"
                        : snapshot.quality.status === "warning"
                          ? "warning"
                          : "destructive"}
                    >
                      Score: {snapshot.quality.compositeScore}
                    </Badge>
                  </td>
                  <td class="px-4 py-3 text-right text-neutral-400">
                    {snapshot.teamHealth.totalIcCount}
                  </td>
                  <td class="px-4 py-3 text-right text-neutral-400">
                    {snapshot.teamHealth.totalProjectCount}
                  </td>
                  <td class="px-4 py-3 text-right text-neutral-400">
                    {snapshot.quality.openBugCount}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    {/if}

    <!-- Team Breakdown -->
    {#if teamSnapshots.length > 0}
      <div class="mt-8">
        <h2 class="mb-4 text-lg font-medium text-white">By Team</h2>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-white/10">
                <th class="px-4 py-3 font-medium text-left text-neutral-400">
                  Team
                </th>
                <th class="px-4 py-3 font-medium text-center text-neutral-400">
                  Team Health
                </th>
                <th class="px-4 py-3 font-medium text-center text-neutral-400">
                  Velocity
                </th>
                <th class="px-4 py-3 font-medium text-center text-neutral-400">
                  Quality
                </th>
                <th class="px-4 py-3 font-medium text-right text-neutral-400">
                  ICs
                </th>
                <th class="px-4 py-3 font-medium text-right text-neutral-400">
                  Projects
                </th>
                <th class="px-4 py-3 font-medium text-right text-neutral-400">
                  Open Bugs
                </th>
              </tr>
            </thead>
            <tbody>
              {#each teamSnapshots.sort( (a, b) => (a.levelId || "").localeCompare(b.levelId || "") ) as { levelId, snapshot } (levelId)}
                <tr
                  class="border-b transition-colors border-white/5 hover:bg-white/5"
                >
                  <td class="px-4 py-3 font-medium text-white">{levelId}</td>
                  <td class="px-4 py-3 text-center">
                    <Badge
                      variant={snapshot.teamHealth.status === "healthy"
                        ? "success"
                        : snapshot.teamHealth.status === "warning"
                          ? "warning"
                          : "destructive"}
                    >
                      {snapshot.teamHealth.status}
                    </Badge>
                  </td>
                  <td class="px-4 py-3 text-center">
                    <Badge
                      variant={snapshot.velocityHealth.status === "healthy"
                        ? "success"
                        : snapshot.velocityHealth.status === "warning"
                          ? "warning"
                          : "destructive"}
                    >
                      {snapshot.velocityHealth.onTrackPercent.toFixed(0)}%
                    </Badge>
                  </td>
                  <td class="px-4 py-3 text-center">
                    <Badge
                      variant={snapshot.quality.status === "healthy"
                        ? "success"
                        : snapshot.quality.status === "warning"
                          ? "warning"
                          : "destructive"}
                    >
                      {snapshot.quality.compositeScore}
                    </Badge>
                  </td>
                  <td class="px-4 py-3 text-right text-neutral-400">
                    {snapshot.teamHealth.totalIcCount}
                  </td>
                  <td class="px-4 py-3 text-right text-neutral-400">
                    {snapshot.teamHealth.totalProjectCount}
                  </td>
                  <td class="px-4 py-3 text-right text-neutral-400">
                    {snapshot.quality.openBugCount}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    {/if}

    <!-- Projects Needing Attention -->
    {#if orgSnapshot.velocityHealth.projectStatuses.filter((p) => p.effectiveHealth !== "onTrack").length > 0}
      <div class="mt-8">
        <h2 class="mb-4 text-lg font-medium text-white">
          Projects Needing Attention
        </h2>
        <Card>
          <div class="space-y-2">
            {#each orgSnapshot.velocityHealth.projectStatuses.filter((p) => p.effectiveHealth !== "onTrack") as project (project.projectId)}
              <div
                class="flex justify-between items-center px-3 py-2 rounded transition-colors hover:bg-white/5"
              >
                <div>
                  <div class="font-medium text-white">
                    {project.projectName}
                  </div>
                  <div class="text-xs text-neutral-500">
                    {#if project.daysOffTarget !== null}
                      {project.daysOffTarget > 0
                        ? `${project.daysOffTarget} days behind target`
                        : `${Math.abs(project.daysOffTarget)} days ahead`}
                      • Source: {project.healthSource}
                    {:else}
                      No target date set
                    {/if}
                  </div>
                </div>
                <Badge
                  variant={project.effectiveHealth === "atRisk"
                    ? "warning"
                    : "destructive"}
                >
                  {project.effectiveHealth === "atRisk"
                    ? "At Risk"
                    : "Off Track"}
                </Badge>
              </div>
            {/each}
          </div>
        </Card>
      </div>
    {/if}
  {:else}
    <!-- No Data State -->
    <Card>
      <div class="py-8 text-center">
        <div class="mb-2 text-neutral-400">No metrics data available</div>
        <p class="text-sm text-neutral-500">
          Metrics snapshots are captured automatically after each sync. Run a
          sync or wait for the next scheduled sync.
        </p>
      </div>
    </Card>
  {/if}
</div>

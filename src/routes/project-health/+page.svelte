<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import Card from "$lib/components/Card.svelte";
  import Skeleton from "$lib/components/Skeleton.svelte";
  import ProjectDetailModal from "$lib/components/ProjectDetailModal.svelte";
  import TeamFilterNotice from "$lib/components/TeamFilterNotice.svelte";
  import { projectsStore, databaseStore } from "$lib/stores/database";
  import { teamFilterStore } from "$lib/stores/team-filter";
  import { getDomainForTeam } from "../../utils/domain-mapping";
  import type {
    VelocityHealthV1,
    ProjectVelocityStatusV1,
    MetricsSnapshotV1,
  } from "../../types/metrics-snapshot";
  import type { LatestMetricsResponse } from "../api/metrics/latest/+server";

  // Domain project health data for table
  interface DomainProjectHealth {
    domainName: string;
    onTrackPercent: number;
    atRiskPercent: number;
    offTrackPercent: number;
    totalProjects: number;
    onTrackCount: number;
    atRiskCount: number;
    offTrackCount: number;
    status: string;
  }

  // Data state
  let loading = $state(true);
  let error = $state<string | null>(null);
  let velocityHealth = $state<VelocityHealthV1 | null>(null);
  let allSnapshots = $state<
    Array<{
      level: string;
      levelId: string | null;
      snapshot: MetricsSnapshotV1;
      capturedAt: string;
    }>
  >([]);

  // Project modal state - store the project ID
  let selectedProjectId = $state<string | null>(null);

  // Get full ProjectSummary from the store when a project is selected
  const selectedProject = $derived.by(() => {
    if (!selectedProjectId) return null;
    return $projectsStore.get(selectedProjectId) || null;
  });

  // KaTeX for rendering math formulas
  let katex: typeof import("katex") | null = null;
  let formulaHtml = $state("");

  // Initial setup
  onMount(async () => {
    if (!browser) return;

    // Load database store for project details modal
    databaseStore.load();

    // Load KaTeX
    katex = await import("katex");
    if (katex) {
      formulaHtml = katex.default.renderToString(
        "\\text{Project Health} = \\frac{\\text{On-Track Projects}}{\\text{Total Projects}} \\times 100",
        { throwOnError: false, displayMode: true }
      );
    }

    // Fetch all metrics snapshots (including domain-level)
    try {
      const metricsRes = await fetch("/api/metrics/latest?all=true");
      const metricsData = (await metricsRes.json()) as LatestMetricsResponse;

      if (!metricsData.success) {
        error = metricsData.error || "Failed to fetch metrics";
        return;
      }

      allSnapshots = metricsData.snapshots || [];

      // Extract org-level velocity health
      const orgSnapshot = allSnapshots.find((s) => s.level === "org");
      velocityHealth = orgSnapshot?.snapshot?.velocityHealth || null;
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load data";
    } finally {
      loading = false;
    }
  });

  // Status indicator colors
  const statusColors: Record<string, string> = {
    healthy: "bg-emerald-500",
    warning: "bg-amber-500",
    critical: "bg-red-500",
    unknown: "bg-neutral-500",
  };

  const statusLabels: Record<string, string> = {
    healthy: "Healthy",
    warning: "Warning",
    critical: "Critical",
    unknown: "Unknown",
  };

  // Project health badge styling
  const healthBadgeColors: Record<string, string> = {
    onTrack: "bg-emerald-500/20 text-emerald-400",
    atRisk: "bg-amber-500/20 text-amber-400",
    offTrack: "bg-red-500/20 text-red-400",
  };

  const healthLabels: Record<string, string> = {
    onTrack: "On Track",
    atRisk: "At Risk",
    offTrack: "Off Track",
  };

  // Source badge styling (neutral to avoid visual overload)
  const sourceBadgeColors: Record<string, string> = {
    human: "bg-neutral-500/20 text-neutral-400",
    velocity: "bg-neutral-500/20 text-neutral-400",
  };

  const sourceLabels: Record<string, string> = {
    human: "Self-reported",
    velocity: "Trajectory Alert",
  };

  // Get current filter state
  const filter = $derived($teamFilterStore);

  // Determine active domain filter (from domain selection or derived from team)
  const activeDomainFilter = $derived.by(() => {
    if (filter.teamKey) {
      return getDomainForTeam(filter.teamKey);
    }
    return filter.domain;
  });

  // Get filtered domain snapshot for hero metrics
  const filteredDomainVelocity = $derived.by((): VelocityHealthV1 | null => {
    if (!activeDomainFilter) return null;
    const domainSnapshot = allSnapshots.find(
      (s) => s.level === "domain" && s.levelId === activeDomainFilter
    );
    return domainSnapshot?.snapshot?.velocityHealth || null;
  });

  // Use filtered domain health if filter is active, otherwise org-level
  const displayVelocity = $derived(filteredDomainVelocity || velocityHealth);

  // Derived counts (from display velocity, which respects filter)
  const projectStatuses = $derived(displayVelocity?.projectStatuses || []);
  const totalProjects = $derived(projectStatuses.length);
  const onTrackCount = $derived(
    projectStatuses.filter((p) => p.effectiveHealth === "onTrack").length
  );
  const atRiskCount = $derived(
    projectStatuses.filter((p) => p.effectiveHealth === "atRisk").length
  );
  const offTrackCount = $derived(
    projectStatuses.filter((p) => p.effectiveHealth === "offTrack").length
  );

  // Breakdown by source
  const atRiskHuman = $derived(
    projectStatuses.filter(
      (p) => p.effectiveHealth === "atRisk" && p.healthSource === "human"
    ).length
  );
  const atRiskVelocity = $derived(
    projectStatuses.filter(
      (p) => p.effectiveHealth === "atRisk" && p.healthSource === "velocity"
    ).length
  );
  const offTrackHuman = $derived(
    projectStatuses.filter(
      (p) => p.effectiveHealth === "offTrack" && p.healthSource === "human"
    ).length
  );
  const offTrackVelocity = $derived(
    projectStatuses.filter(
      (p) => p.effectiveHealth === "offTrack" && p.healthSource === "velocity"
    ).length
  );

  // Projects needing attention (not on track)
  const projectsNeedingAttention = $derived(
    projectStatuses.filter((p) => p.effectiveHealth !== "onTrack")
  );

  // Computed status
  const computedStatus = $derived.by((): "healthy" | "warning" | "critical" => {
    const pct = velocityHealth?.onTrackPercent ?? 0;
    if (pct >= 80) return "healthy";
    if (pct >= 60) return "warning";
    return "critical";
  });

  // Extract domain-level project health data for table (filtered by active domain)
  const domainProjectHealthData = $derived.by((): DomainProjectHealth[] => {
    const domains: DomainProjectHealth[] = [];

    for (const snapshot of allSnapshots) {
      if (snapshot.level !== "domain" || !snapshot.levelId) continue;

      // Filter by active domain if set
      if (activeDomainFilter && snapshot.levelId !== activeDomainFilter)
        continue;

      const velocity = snapshot.snapshot.velocityHealth;
      if (!velocity) continue;

      const totalProjects = velocity.projectStatuses.length;
      const onTrackCount = velocity.projectStatuses.filter(
        (p) => p.effectiveHealth === "onTrack"
      ).length;
      const atRiskCount = velocity.projectStatuses.filter(
        (p) => p.effectiveHealth === "atRisk"
      ).length;
      const offTrackCount = velocity.projectStatuses.filter(
        (p) => p.effectiveHealth === "offTrack"
      ).length;

      domains.push({
        domainName: snapshot.levelId,
        onTrackPercent: velocity.onTrackPercent,
        atRiskPercent: velocity.atRiskPercent,
        offTrackPercent: velocity.offTrackPercent,
        totalProjects,
        onTrackCount,
        atRiskCount,
        offTrackCount,
        status: velocity.status,
      });
    }

    // Sort by on-track percent (ascending - domains needing attention first)
    return domains.sort((a, b) => a.onTrackPercent - b.onTrackPercent);
  });

  function closeProjectModal() {
    selectedProjectId = null;
  }

  function openProjectModal(project: ProjectVelocityStatusV1) {
    selectedProjectId = project.projectId;
  }
</script>

<div class="space-y-6">
  <!-- Page Title -->
  <div class="flex flex-wrap items-center justify-between gap-4">
    <h1 class="text-2xl font-semibold text-white">Project Health</h1>
    <TeamFilterNotice level="domain" />
  </div>

  {#if loading}
    <!-- Loading state -->
    <Card class="p-6">
      <div class="space-y-6">
        <div class="text-center py-4">
          <Skeleton class="w-32 h-12 mx-auto mb-2" />
          <Skeleton class="w-48 h-4 mx-auto" />
        </div>
        <Skeleton class="w-full h-24" />
        <Skeleton class="w-full h-32" />
        <div class="grid grid-cols-3 gap-4">
          <Skeleton class="h-24" />
          <Skeleton class="h-24" />
          <Skeleton class="h-24" />
        </div>
      </div>
    </Card>
  {:else if error}
    <!-- Error state -->
    <Card class="border-red-500/50">
      <div class="mb-3 text-sm font-medium text-red-600 dark:text-red-400">
        Error Loading Data
      </div>
      <p class="text-neutral-700 dark:text-neutral-400">{error}</p>
    </Card>
  {:else if displayVelocity}
    <!-- Marquee Hero Section -->
    <div class="py-8 border-b border-white/10">
      <!-- Large metric -->
      <div class="flex items-baseline justify-center gap-4 mb-3">
        <span class="text-8xl lg:text-9xl font-bold text-white tracking-tight">
          {displayVelocity.onTrackPercent.toFixed(0)}%
        </span>
      </div>

      <!-- Subtitle -->
      <p class="text-center text-xl text-neutral-400 mb-2">
        Projects on track to meet their target dates
      </p>
      <p class="text-center text-sm text-neutral-500">
        {onTrackCount} of {totalProjects} projects
        <span
          class="ml-2 inline-block text-xs font-medium px-2 py-0.5 rounded {computedStatus ===
          'healthy'
            ? 'bg-emerald-500/20 text-emerald-400'
            : computedStatus === 'warning'
              ? 'bg-amber-500/20 text-amber-400'
              : 'bg-red-500/20 text-red-400'}"
        >
          {statusLabels[computedStatus]}
        </span>
      </p>

      <!-- Breakdown row -->
      <div class="flex items-center justify-center gap-8 lg:gap-16 mt-8">
        <!-- At Risk total -->
        <div class="text-center">
          <div class="text-4xl lg:text-5xl font-bold text-white">
            {atRiskCount}
          </div>
          <div class="text-sm text-neutral-400 mt-1">At Risk</div>
          <div class="text-xs text-neutral-500">need monitoring</div>
        </div>

        <!-- Divider -->
        <div class="h-12 w-px bg-white/10"></div>

        <!-- Off Track total -->
        <div class="text-center">
          <div class="text-4xl lg:text-5xl font-bold text-white">
            {offTrackCount}
          </div>
          <div class="text-sm text-neutral-400 mt-1">Off Track</div>
          <div class="text-xs text-neutral-500">need intervention</div>
        </div>

        <!-- Divider -->
        <div class="h-12 w-px bg-white/10"></div>

        <!-- Self-reported breakdown -->
        <div class="text-center opacity-70">
          <div class="text-3xl lg:text-4xl font-bold text-white">
            {atRiskHuman + offTrackHuman}
          </div>
          <div class="text-sm text-neutral-400 mt-1">Self-reported</div>
        </div>

        <!-- Divider -->
        <div class="h-12 w-px bg-white/10"></div>

        <!-- Trajectory Alert breakdown -->
        <div class="text-center opacity-70">
          <div class="text-3xl lg:text-4xl font-bold text-white">
            {atRiskVelocity + offTrackVelocity}
          </div>
          <div class="text-sm text-neutral-400 mt-1">Trajectory Alert</div>
        </div>
      </div>
    </div>

    <!-- Why & How row -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-6">
      <!-- Why this matters -->
      <div class="space-y-2">
        <h3
          class="text-xs font-medium text-neutral-500 uppercase tracking-wider"
        >
          Why this matters
        </h3>
        <p class="text-sm text-neutral-400 leading-relaxed">
          Early detection of at-risk projects enables proactive intervention
          before deadlines slip. Combining self-reported status with
          velocity-based trajectory alerts catches blind spots that either
          source alone would miss.
        </p>
      </div>

      <!-- How it's calculated -->
      <div class="space-y-2">
        <h3
          class="text-xs font-medium text-neutral-500 uppercase tracking-wider"
        >
          How it's calculated
        </h3>
        <p class="text-sm text-neutral-400">
          A project is "on track" when both <strong class="text-neutral-300"
            >self-reported status</strong
          >
          is healthy AND the
          <strong class="text-neutral-300">velocity trajectory</strong> predicts completion
          within 14 days of the target date.
        </p>

        <!-- Formula -->
        {#if formulaHtml}
          <div
            class="py-3 px-4 rounded-md bg-neutral-800/50 border border-white/5 formula-container overflow-x-auto mt-3"
          >
            <!-- eslint-disable-next-line svelte/no-at-html-tags -->
            {@html formulaHtml}
          </div>
        {/if}
      </div>
    </div>

    <!-- Domain Project Health Table -->
    {#if domainProjectHealthData.length > 0}
      <Card class="p-0 overflow-hidden">
        <div
          class="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/5"
        >
          <h3 class="text-sm font-medium text-white">
            Domain Breakdown ({domainProjectHealthData.length})
          </h3>
          <span class="text-xs text-neutral-500">Project health by domain</span>
        </div>
        <div class="p-4">
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead>
                <tr
                  class="text-left text-xs font-medium text-neutral-500 uppercase tracking-wider border-b border-white/10"
                >
                  <th class="pb-3 pr-4">Domain</th>
                  <th class="pb-3 pr-4">Status</th>
                  <th class="pb-3 pr-4 text-right">On Track</th>
                  <th class="pb-3 pr-4 text-right">At Risk</th>
                  <th class="pb-3 pr-4 text-right">Off Track</th>
                  <th class="pb-3 pr-4 text-right">Total</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-white/5">
                {#each domainProjectHealthData as domain}
                  <tr class="hover:bg-white/5 transition-colors">
                    <td class="py-3 pr-4">
                      <span class="text-sm text-white font-medium">
                        {domain.domainName}
                      </span>
                    </td>
                    <td class="py-3 pr-4">
                      <span
                        class="text-xs font-medium px-2 py-1 rounded {statusColors[
                          domain.status
                        ]
                          ? statusColors[domain.status].replace('bg-', 'bg-') +
                            '/20 ' +
                            statusColors[domain.status]
                              .replace('bg-', 'text-')
                              .replace('-500', '-400')
                          : 'bg-neutral-500/20 text-neutral-400'}"
                      >
                        {statusLabels[domain.status] || domain.status}
                      </span>
                    </td>
                    <td class="py-3 pr-4 text-right">
                      <span class="text-sm font-semibold text-white">
                        {domain.onTrackPercent.toFixed(0)}%
                      </span>
                      <span class="text-xs text-neutral-500 ml-1">
                        ({domain.onTrackCount})
                      </span>
                    </td>
                    <td class="py-3 pr-4 text-right">
                      <span class="text-sm text-neutral-300">
                        {domain.atRiskCount}
                      </span>
                    </td>
                    <td class="py-3 pr-4 text-right">
                      <span class="text-sm text-neutral-300">
                        {domain.offTrackCount}
                      </span>
                    </td>
                    <td class="py-3 pr-4 text-right">
                      <span class="text-sm text-neutral-400">
                        {domain.totalProjects}
                      </span>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      </Card>
    {/if}

    <!-- Projects Needing Attention Table -->
    <Card class="p-0 overflow-hidden">
      <div
        class="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/5"
      >
        <h3 class="text-sm font-medium text-white">
          Projects Needing Attention ({projectsNeedingAttention.length})
        </h3>
        <span class="text-xs text-neutral-500">At Risk or Off Track</span>
      </div>
      <div class="p-4">
        {#if projectsNeedingAttention.length > 0}
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead>
                <tr
                  class="text-left text-xs font-medium text-neutral-500 uppercase tracking-wider border-b border-white/10"
                >
                  <th class="pb-3 pr-4">Project</th>
                  <th class="pb-3 pr-4">Status</th>
                  <th class="pb-3 pr-4">Source</th>
                  <th class="pb-3 pr-4">Days Off Target</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-white/5">
                {#each projectsNeedingAttention as project}
                  <tr
                    class="hover:bg-white/5 cursor-pointer transition-colors"
                    onclick={() => openProjectModal(project)}
                  >
                    <td class="py-3 pr-4">
                      <span class="text-sm text-white font-medium">
                        {project.projectName}
                      </span>
                    </td>
                    <td class="py-3 pr-4">
                      <span
                        class="text-xs font-medium px-2 py-1 rounded {healthBadgeColors[
                          project.effectiveHealth
                        ]}"
                      >
                        {healthLabels[project.effectiveHealth]}
                      </span>
                    </td>
                    <td class="py-3 pr-4">
                      <span
                        class="text-xs font-medium px-2 py-1 rounded {sourceBadgeColors[
                          project.healthSource
                        ]}"
                      >
                        {sourceLabels[project.healthSource]}
                      </span>
                    </td>
                    <td class="py-3 pr-4">
                      {#if project.daysOffTarget !== null}
                        <span class="text-sm text-neutral-400">
                          {project.daysOffTarget > 0
                            ? "+"
                            : ""}{project.daysOffTarget}
                          days
                        </span>
                      {:else}
                        <span class="text-sm text-neutral-500">—</span>
                      {/if}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {:else}
          <div class="py-8 text-center text-neutral-500">
            All projects are on track — great job!
          </div>
        {/if}
      </div>
    </Card>
  {:else}
    <!-- No data state -->
    <Card>
      <div class="py-8 text-center">
        <div class="mb-2 text-neutral-400">No metrics data available</div>
        <p class="text-sm text-neutral-500">
          Run a sync to capture metrics data.
        </p>
      </div>
    </Card>
  {/if}
</div>

<!-- Project Detail Modal -->
{#if selectedProject}
  <ProjectDetailModal project={selectedProject} onclose={closeProjectModal} />
{/if}

<style>
  /* KaTeX formula styling */
  .formula-container :global(.katex) {
    font-size: 1em;
    color: #e5e5e5;
  }
  .formula-container :global(.katex-display) {
    margin: 0;
  }
</style>

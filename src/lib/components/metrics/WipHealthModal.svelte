<script lang="ts">
  import { onMount } from "svelte";
  import Modal from "$lib/components/Modal.svelte";
  import Badge from "$lib/components/Badge.svelte";
  import EngineersTable from "$lib/components/EngineersTable.svelte";
  import type { TeamHealthV1 } from "../../../types/metrics-snapshot";
  import { getStatusBgColor } from "$lib/utils/status-colors";

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
    active_project_count?: number;
    multi_project_violation?: number;
  }

  interface Props {
    teamHealth: TeamHealthV1;
    engineers: EngineerData[];
    onclose: () => void;
    onEngineerClick: (engineer: EngineerData) => void;
  }

  let { teamHealth, engineers, onclose, onEngineerClick }: Props = $props();

  // Filter engineers by violation type
  const overloadedEngineers = $derived(
    engineers.filter((e) => e.wip_limit_violation === 1)
  );

  const contextSwitchingEngineers = $derived(
    engineers.filter((e) => e.multi_project_violation === 1)
  );

  // Tab state
  let activeTab = $state<"overloaded" | "context-switching">("overloaded");

  // KaTeX for rendering math formulas
  let katex: typeof import("katex") | null = null;
  let formulaHtml = $state("");

  onMount(async () => {
    katex = await import("katex");
    if (katex) {
      formulaHtml = katex.default.renderToString(
        "\\text{WIP Health} = \\frac{\\displaystyle\\sum_{i=1}^{N} \\mathbf{1}\\bigl[\\text{issues}_i \\leq 5 \\;\\land\\; \\text{projects}_i = 1\\bigr]}{N} \\times 100",
        { throwOnError: false, displayMode: true }
      );
    }
  });

  // Calculate percentages for display
  const wipViolationPercent = $derived(
    teamHealth.totalIcCount > 0
      ? (
          (teamHealth.wipViolationCount / teamHealth.totalIcCount) *
          100
        ).toFixed(0)
      : "0"
  );

  const multiProjectPercent = $derived(
    teamHealth.totalIcCount > 0
      ? (
          (teamHealth.multiProjectViolationCount / teamHealth.totalIcCount) *
          100
        ).toFixed(0)
      : "0"
  );

  const projectImpactPercent = $derived(
    teamHealth.totalProjectCount > 0
      ? (
          (teamHealth.impactedProjectCount / teamHealth.totalProjectCount) *
          100
        ).toFixed(0)
      : "0"
  );
</script>

<Modal title="WIP Health" {onclose} size="2xl" scrollable maxHeight="90vh">
  <div class="space-y-6">
    <!-- Hero metric -->
    <div class="text-center py-4">
      <div class="flex items-center justify-center gap-3 mb-2">
        <span class="w-3 h-3 rounded-full {getStatusBgColor(teamHealth.status)}"
        ></span>
        <span class="text-4xl font-semibold text-black-900 dark:text-white">
          {teamHealth.healthyWorkloadPercent.toFixed(0)}%
        </span>
        <Badge status={teamHealth.status} />
      </div>
      <p class="text-black-400">Engineers within WIP constraints</p>
    </div>

    <!-- Why this matters -->
    <div
      class="p-4 rounded-md bg-white/5 border border-black-200 dark:border-white/10"
    >
      <h3 class="text-sm font-medium text-white mb-2">Why this matters</h3>
      <p class="text-sm text-black-400 leading-relaxed">
        WIP constraints reduce cycle time by limiting queue depth. Overloaded
        engineers create bottlenecks; context-switching across projects
        compounds delays through task-switching overhead.
      </p>
    </div>

    <!-- How it's calculated -->
    <div>
      <h3 class="text-sm font-medium text-white mb-3">How it's calculated</h3>
      <p class="text-sm text-black-400 mb-4">
        An engineer is "within constraints" when they have <strong
          class="text-black-300">5 or fewer</strong
        >
        in-progress issues AND are focused on a
        <strong class="text-black-300">single project</strong>.
      </p>

      <!-- Formula -->
      {#if formulaHtml}
        <div
          class="py-4 px-6 rounded-md bg-black-800/50 border border-white/5 formula-container"
        >
          <!-- eslint-disable-next-line svelte/no-at-html-tags -->
          {@html formulaHtml}
        </div>
      {/if}
    </div>

    <!-- Current breakdown -->
    <div>
      <h3 class="text-sm font-medium text-white mb-3">Current breakdown</h3>
      <div class="grid grid-cols-3 gap-4">
        <button
          class="p-3 rounded-md border text-left transition-colors {activeTab ===
          'overloaded'
            ? 'bg-danger-500/10 border-danger-500/30'
            : 'bg-white/5 border-white/10 hover:bg-white/10'}"
          onclick={() => (activeTab = "overloaded")}
        >
          <div class="text-2xl font-semibold text-white mb-1">
            {wipViolationPercent}%
          </div>
          <div class="text-xs text-black-400">
            ICs overloaded
            <span class="text-black-500">(6+ issues)</span>
          </div>
          <div class="text-xs text-black-500 mt-1">
            {teamHealth.wipViolationCount} of {teamHealth.totalIcCount}
          </div>
        </button>

        <button
          class="p-3 rounded-md border text-left transition-colors {activeTab ===
          'context-switching'
            ? 'bg-warning-500/10 border-warning-500/30'
            : 'bg-white/5 border-white/10 hover:bg-white/10'}"
          onclick={() => (activeTab = "context-switching")}
        >
          <div class="text-2xl font-semibold text-white mb-1">
            {multiProjectPercent}%
          </div>
          <div class="text-xs text-black-400">
            ICs context-switching
            <span class="text-black-500">(2+ projects)</span>
          </div>
          <div class="text-xs text-black-500 mt-1">
            {teamHealth.multiProjectViolationCount} of {teamHealth.totalIcCount}
          </div>
        </button>

        <div
          class="p-3 rounded-md bg-white/5 border border-black-200 dark:border-white/10"
        >
          <div class="text-2xl font-semibold text-white mb-1">
            {projectImpactPercent}%
          </div>
          <div class="text-xs text-black-400">Projects impacted</div>
          <div class="text-xs text-black-500 mt-1">
            {teamHealth.impactedProjectCount} of {teamHealth.totalProjectCount}
          </div>
        </div>
      </div>
    </div>

    <!-- Engineer lists -->
    {#if activeTab === "overloaded"}
      <div>
        <h3 class="text-sm font-medium text-white mb-3">
          Overloaded Engineers ({overloadedEngineers.length})
        </h3>
        {#if overloadedEngineers.length > 0}
          <div class="rounded-md border border-white/10 overflow-hidden">
            <EngineersTable engineers={overloadedEngineers} {onEngineerClick} />
          </div>
        {:else}
          <div class="p-4 text-center text-black-500 bg-white/5 rounded-md">
            No engineers currently overloaded
          </div>
        {/if}
      </div>
    {:else}
      <div>
        <h3 class="text-sm font-medium text-white mb-3">
          Context-Switching Engineers ({contextSwitchingEngineers.length})
        </h3>
        {#if contextSwitchingEngineers.length > 0}
          <div class="rounded-md border border-white/10 overflow-hidden">
            <EngineersTable
              engineers={contextSwitchingEngineers}
              {onEngineerClick}
            />
          </div>
        {:else}
          <div class="p-4 text-center text-black-500 bg-white/5 rounded-md">
            No engineers currently context-switching across multiple projects
          </div>
        {/if}
      </div>
    {/if}
  </div>
</Modal>

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

<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import type { ProjectSummary } from "../project-data";
  import type { Issue } from "../../db/schema";
  import Badge from "./ui/badge.svelte";
  import {
    formatDateFull,
    getProgressPercent,
    getCompletedPercent,
    getWIPPercent,
    getHealthDisplay,
    calculateTotalPoints,
    calculateAverageCycleTime,
    calculateAverageLeadTime,
    calculateProjectAge,
    formatTimeDays,
    formatProjectAge,
    calculateVelocity,
    formatVelocity,
    calculateVelocityByTeam,
    calculateLinearProgress,
    formatPercent,
    calculateEstimateAccuracy,
    getVelocityTrendDisplay,
  } from "$lib/utils/project-helpers";

  let {
    project,
    onclose,
  }: {
    project: ProjectSummary;
    onclose: () => void;
  } = $props();

  let projectUrl = $state<string | null>(null);
  let projectIssues = $state<Issue[]>([]);
  let issuesLoading = $state(true);

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      onclose();
    }
  }

  function handleBackdropClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (target.classList.contains("modal-backdrop")) {
      onclose();
    }
  }

  function handleBackdropKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const target = event.target as HTMLElement;
      if (target.classList.contains("modal-backdrop")) {
        onclose();
      }
    }
  }

  async function fetchProjectUrl() {
    if (!browser) return;
    try {
      const response = await fetch("/api/issues/with-projects");
      if (response.ok) {
        const data = await response.json();
        const projectIssue = data.issues?.find(
          (issue: any) => issue.project_id === project.projectId
        );
        if (projectIssue?.url) {
          // Extract workspace from issue URL
          const workspaceMatch = projectIssue.url.match(
            /https:\/\/linear\.app\/([^\/]+)/
          );
          if (workspaceMatch) {
            const workspace = workspaceMatch[1];
            projectUrl = `https://linear.app/${workspace}/project/${project.projectId}`;
          }
        }
      }
    } catch (error) {
      // Silently fail - link just won't be available
    }
  }

  async function fetchProjectIssues() {
    if (!browser) return;
    try {
      issuesLoading = true;
      const response = await fetch(
        `/api/issues/by-project/${project.projectId}`
      );
      if (response.ok) {
        const data = await response.json();
        projectIssues = data.issues || [];
      }
    } catch (error) {
      console.error("Failed to fetch project issues:", error);
      projectIssues = [];
    } finally {
      issuesLoading = false;
    }
  }

  // Calculate metrics from projectIssues
  const metrics = $derived.by(() => {
    if (projectIssues.length === 0) {
      return {
        totalPoints: { total: 0, missing: 0 },
        averageCycleTime: null,
        averageLeadTime: null,
        projectAge: calculateProjectAge(project.startDate),
        linearProgress: null,
        velocity: 0,
        velocityByTeam: new Map<string, number>(),
        estimateAccuracy: null,
      };
    }

    return {
      totalPoints: calculateTotalPoints(projectIssues),
      averageCycleTime: calculateAverageCycleTime(projectIssues),
      averageLeadTime: calculateAverageLeadTime(projectIssues),
      projectAge: calculateProjectAge(project.startDate),
      linearProgress: calculateLinearProgress(projectIssues),
      velocity: calculateVelocity(projectIssues, project.startDate),
      velocityByTeam: calculateVelocityByTeam(projectIssues, project.startDate),
      estimateAccuracy: calculateEstimateAccuracy(projectIssues),
    };
  });

  onMount(() => {
    document.addEventListener("keydown", handleKeydown);
    document.body.style.overflow = "hidden";
    fetchProjectUrl();
    fetchProjectIssues();
    return () => {
      document.removeEventListener("keydown", handleKeydown);
      document.body.style.overflow = "";
    };
  });
</script>

<div
  class="flex fixed inset-0 z-50 justify-center items-center modal-backdrop bg-black/60"
  onclick={handleBackdropClick}
  onkeydown={handleBackdropKeydown}
  role="dialog"
  aria-modal="true"
  aria-labelledby="modal-title"
  tabindex="-1"
>
  <div
    class="w-full max-w-4xl max-h-[90vh] rounded-md border shadow-2xl bg-neutral-900 border-white/10 shadow-black/50 m-4 flex flex-col"
    role="document"
  >
    <!-- Fixed Header -->
    <div
      class="flex flex-shrink-0 justify-between items-start p-6 pb-4 border-b border-white/10"
    >
      <div class="flex-1">
        <h2
          id="modal-title"
          class="flex gap-2 items-center text-xl font-medium text-white"
        >
          {project.projectName}
          {#if project.hasStatusMismatch || project.isStaleUpdate || project.missingLead}
            <span
              class="text-amber-500"
              title={[
                project.hasStatusMismatch &&
                  "Status Mismatch: Project status doesn't match active work",
                project.isStaleUpdate &&
                  "Stale Update: Project hasn't been updated in 7+ days",
                project.missingLead && "Missing Lead: No project lead assigned",
              ]
                .filter(Boolean)
                .join("\n")}>⚠️</span
            >
          {/if}
          {#if projectUrl}
            <a
              href={projectUrl}
              target="_blank"
              rel="noopener noreferrer"
              class="ml-2 text-sm text-violet-400 underline transition-colors duration-150 hover:text-violet-300"
            >
              Open in Linear →
            </a>
          {/if}
        </h2>
      </div>
      <button
        class="transition-colors duration-150 text-neutral-400 hover:text-white"
        onclick={onclose}
        aria-label="Close modal"
        title="Close (ESC)"
      >
        <svg
          class="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>

    <!-- Scrollable Content -->
    <div class="overflow-y-auto flex-1">
      <div class="p-6 pt-6">
        <!-- Progress Section -->
        <div class="mb-6">
          <div class="flex justify-between items-center mb-2">
            <span class="text-sm font-medium text-neutral-300">Progress</span>
            <span class="text-sm text-neutral-400"
              >{getProgressPercent(project)}%</span
            >
          </div>
          {#if true}
            {@const completedPercent = getCompletedPercent(project)}
            {@const wipPercent = getWIPPercent(project)}
            <div class="space-y-1.5">
              <div class="flex gap-2 items-center">
                <div
                  class="overflow-hidden relative flex-1 h-2 rounded bg-neutral-200 dark:bg-neutral-800"
                >
                  {#if completedPercent > 0}
                    <div
                      class="absolute top-0 left-0 h-full bg-violet-500 transition-colors duration-150"
                      style={`width: ${completedPercent}%`}
                    ></div>
                  {/if}
                  {#if wipPercent > 0}
                    <div
                      class="absolute top-0 h-full bg-amber-500 transition-colors duration-150"
                      style={`width: ${wipPercent}%; left: ${completedPercent}%`}
                    ></div>
                  {/if}
                </div>
              </div>
              <div
                class="flex justify-between items-center text-xs text-neutral-400"
              >
                <span>
                  {#if project.inProgressIssues > 0}
                    {project.inProgressIssues} in progress
                  {:else}
                    <span class="text-neutral-500">0 in progress</span>
                  {/if}
                </span>
                <span>{project.completedIssues}/{project.totalIssues}</span>
              </div>
            </div>
          {/if}
        </div>

        <!-- Metrics Section -->
        <div
          class="p-4 mb-6 rounded-md border bg-neutral-800/50 border-white/5"
        >
          <div class="mb-3 text-sm font-medium text-neutral-300">Metrics</div>
          <div class="grid grid-cols-2 gap-4">
            <!-- Left Column -->
            <div>
              <div
                class="flex gap-1 items-center mb-1 text-xs text-neutral-500"
                title="Sum of all issue estimates (story points) in the project"
              >
                Total Points
                {#if metrics.totalPoints.missing > 0}
                  <span
                    class="text-amber-400"
                    title="{metrics.totalPoints
                      .missing} issues missing estimates">⚠️</span
                  >
                {/if}
              </div>
              <div class="text-sm text-white">
                {Math.round(metrics.totalPoints.total)}
                {#if metrics.totalPoints.missing > 0}
                  <span class="ml-1 text-xs text-amber-400">
                    ({metrics.totalPoints.missing} missing)
                  </span>
                {/if}
              </div>
            </div>
            <div>
              <div
                class="mb-1 text-xs text-neutral-500"
                title="Average number of issues completed per week"
              >
                Velocity
              </div>
              <div class="flex gap-2 items-center text-sm text-white">
                {formatVelocity(metrics.velocity)} issues/week
                <span class="text-green-500">→</span>
              </div>
            </div>
            {#if metrics.averageCycleTime !== null}
              <div>
                <div
                  class="mb-1 text-xs text-neutral-500"
                  title="Average time from when an issue was started to when it was completed"
                >
                  Avg Cycle Time
                </div>
                <div class="text-sm text-white">
                  {formatTimeDays(metrics.averageCycleTime)}
                </div>
              </div>
            {/if}
            {#if metrics.averageLeadTime !== null}
              <div>
                <div
                  class="mb-1 text-xs text-neutral-500"
                  title="Average time from when an issue was created to when it was completed"
                >
                  Avg Lead Time
                </div>
                <div class="text-sm text-white">
                  {formatTimeDays(metrics.averageLeadTime)}
                </div>
              </div>
            {/if}
            <div>
              <div
                class="mb-1 text-xs text-neutral-500"
                title="Number of days since the project started"
              >
                Project Age
              </div>
              <div class="text-sm text-white">
                {formatProjectAge(metrics.projectAge)}
              </div>
            </div>
            {#if metrics.estimateAccuracy !== null}
              <div>
                <div
                  class="mb-1 text-xs text-neutral-500"
                  title="Percentage of completed issues where the actual cycle time was within 20% of the estimated time"
                >
                  Estimate Accuracy
                </div>
                <div class="text-sm text-white">
                  {formatPercent(metrics.estimateAccuracy)}
                </div>
              </div>
            {/if}
            {#if metrics.linearProgress !== null}
              <div>
                <div
                  class="mb-1 text-xs text-neutral-500"
                  title="Linear's calculated progress based on completed story points divided by total story points"
                >
                  Linear Progress
                  <span class="text-neutral-600">(by points)</span>
                </div>
                <div class="text-sm text-white">
                  {formatPercent(metrics.linearProgress * 100)}
                </div>
              </div>
            {/if}
          </div>
          {#if metrics.velocityByTeam.size > 0}
            <div class="pt-3 mt-3 border-t border-white/5">
              <div
                class="mb-2 text-xs text-neutral-500"
                title="Issues completed per week, broken down by team within this project"
              >
                Velocity by Team
              </div>
              <div class="space-y-1">
                {#each Array.from(metrics.velocityByTeam.entries()) as [team, velocity]}
                  <div class="flex justify-between items-center text-xs">
                    <span class="text-neutral-400">{team}</span>
                    <span class="text-neutral-300"
                      >{formatVelocity(velocity)} issues/week</span
                    >
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </div>

        <!-- Dates Section -->
        <div class="grid grid-cols-2 gap-4 mb-6">
          <div>
            <div class="mb-1 text-xs text-neutral-500">Start Date</div>
            <div class="text-sm text-white">
              {formatDateFull(project.startDate)}
            </div>
          </div>
          <div>
            <div class="mb-1 text-xs text-neutral-500">Estimated End Date</div>
            <div class="text-sm text-white">
              {formatDateFull(project.estimatedEndDate)}
            </div>
          </div>
        </div>

        <!-- Project Metadata (flex wrap layout) -->
        <div class="flex flex-wrap gap-6 mb-6">
          <!-- Project Health -->
          <div>
            <div class="mb-1 text-xs text-neutral-500">Project Health</div>
            {#if true}
              {@const healthDisplay = getHealthDisplay(project.projectHealth)}
              <Badge
                variant={healthDisplay.variant}
                class={healthDisplay.colorClass}
              >
                {healthDisplay.text}
              </Badge>
            {/if}
          </div>

          <!-- Status -->
          <div>
            <div class="mb-1 text-xs text-neutral-500">Status</div>
            <div class="flex gap-2 items-center text-sm text-white">
              {project.projectState || "Not set"}
              {#if project.hasStatusMismatch}
                <span
                  class="text-amber-500"
                  title="Status Mismatch: Project status doesn't match active work"
                  >⚠️</span
                >
              {/if}
            </div>
            {#if project.projectUpdatedAt}
              <div class="mt-1 text-xs text-neutral-500">
                Last updated: {formatDateFull(project.projectUpdatedAt)}
              </div>
            {/if}
          </div>

          <!-- Teams -->
          <div>
            <div class="mb-2 text-xs text-neutral-500">Teams</div>
            <div class="flex flex-wrap gap-2">
              {#each Array.from(project.teams) as team}
                <Badge variant="outline">{team}</Badge>
              {/each}
            </div>
          </div>

          <!-- Lead -->
          <div>
            <div class="mb-1 text-xs text-neutral-500">Project Lead</div>
            <div class="text-sm text-white">
              {project.projectLeadName || "Not assigned"}
            </div>
          </div>

          <!-- Engineers -->
          <div>
            <div class="mb-2 text-xs text-neutral-500">
              Engineers ({project.engineerCount})
            </div>
            <div class="flex flex-wrap gap-2">
              {#each Array.from(project.engineers) as engineer}
                <Badge variant="secondary">{engineer}</Badge>
              {/each}
              {#if project.engineerCount === 0}
                <span class="text-xs text-neutral-500"
                  >No engineers assigned</span
                >
              {/if}
            </div>
          </div>

          <!-- Last Activity -->
          <div>
            <div class="mb-1 text-xs text-neutral-500">Last Activity</div>
            <div class="text-sm text-white">
              {formatDateFull(project.lastActivityDate)}
            </div>
          </div>
        </div>

        <!-- Issues Table -->
        <div class="mb-6">
          <div class="mb-2 text-xs text-neutral-500">Issues</div>
          {#if issuesLoading}
            <div class="text-sm text-neutral-400">Loading...</div>
          {:else if projectIssues.length === 0}
            <div class="text-sm text-neutral-400">No issues found</div>
          {:else}
            {@const issuesByState = (() => {
              const map = new Map<string, Issue[]>();
              for (const issue of projectIssues) {
                if (!map.has(issue.state_name)) {
                  map.set(issue.state_name, []);
                }
                map.get(issue.state_name)!.push(issue);
              }
              return map;
            })()}
            <div class="space-y-4">
              {#each Array.from(issuesByState.entries()).sort((a, b) => {
                // Sort states: completed first, then in progress, then others
                const aLower = a[0].toLowerCase();
                const bLower = b[0].toLowerCase();
                if (aLower.includes("done") || aLower.includes("completed")) return -1;
                if (bLower.includes("done") || bLower.includes("completed")) return 1;
                if (aLower.includes("progress") || aLower.includes("started")) return -1;
                if (bLower.includes("progress") || bLower.includes("started")) return 1;
                return a[0].localeCompare(b[0]);
              }) as [state, issues]}
                <div>
                  <div class="mb-2 text-xs font-medium text-neutral-400">
                    {state} ({issues.length})
                  </div>
                  <div class="overflow-x-auto">
                    <table class="w-full text-xs">
                      <thead>
                        <tr class="border-b border-white/10">
                          <th
                            class="px-2 py-1.5 font-medium text-left text-neutral-400"
                            >Title</th
                          >
                          <th
                            class="px-2 py-1.5 font-medium text-left text-neutral-400"
                            >Assignee</th
                          >
                          <th
                            class="px-2 py-1.5 font-medium text-right text-neutral-400"
                            >Points</th
                          >
                        </tr>
                      </thead>
                      <tbody>
                        {#each issues as issue}
                          <tr
                            class="border-b transition-colors cursor-pointer border-white/5 hover:bg-white/5"
                            onclick={() => {
                              if (issue.url && browser) {
                                window.open(
                                  issue.url,
                                  "_blank",
                                  "noopener,noreferrer"
                                );
                              }
                            }}
                            role="button"
                            tabindex="0"
                            onkeydown={(e) => {
                              if (
                                (e.key === "Enter" || e.key === " ") &&
                                issue.url &&
                                browser
                              ) {
                                e.preventDefault();
                                window.open(
                                  issue.url,
                                  "_blank",
                                  "noopener,noreferrer"
                                );
                              }
                            }}
                          >
                            <td class="px-2 py-1.5 text-neutral-200">
                              <div
                                class="max-w-md truncate"
                                title={issue.title}
                              >
                                {issue.title}
                              </div>
                            </td>
                            <td class="px-2 py-1.5 text-neutral-400">
                              {issue.assignee_name || "Unassigned"}
                            </td>
                            <td class="px-2 py-1.5 text-right text-neutral-300">
                              {#if issue.estimate}
                                {Math.round(issue.estimate)}
                              {:else}
                                <span
                                  class="text-amber-400"
                                  title="Missing estimate">⚠️</span
                                >
                              {/if}
                            </td>
                          </tr>
                        {/each}
                      </tbody>
                    </table>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
</div>

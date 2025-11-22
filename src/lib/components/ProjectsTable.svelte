<script lang="ts">
  import Badge from "$lib/components/ui/badge.svelte";
  import Card from "$lib/components/ui/card.svelte";
  import ProjectDetailModal from "./ProjectDetailModal.svelte";
  import type {
    ProjectSummary,
    TeamSummary,
    DomainSummary,
  } from "../project-data";

  let {
    teams = [],
    domains = [],
    groupBy = "team" as "team" | "domain",
  }: {
    teams?: TeamSummary[];
    domains?: DomainSummary[];
    groupBy?: "team" | "domain";
  } = $props();

  let selectedProject: ProjectSummary | null = $state(null);
  let hoveredProject: ProjectSummary | null = $state(null);
  let tooltipPosition = $state({ x: 0, y: 0 });

  function getCompletedPercent(project: ProjectSummary): number {
    if (!project.totalIssues || project.totalIssues === 0) return 0;
    return (project.completedIssues / project.totalIssues) * 100;
  }

  function getWIPPercent(project: ProjectSummary): number {
    if (!project.totalIssues || project.totalIssues === 0) return 0;
    return (project.inProgressIssues / project.totalIssues) * 100;
  }

  function hasHealthIssues(project: ProjectSummary): boolean {
    return project.hasStatusMismatch || project.isStaleUpdate || project.missingLead;
  }

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return "N/A";
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
    });
  }

  function getHealthDisplay(health: string | null): { 
    text: string; 
    variant: "default" | "destructive" | "secondary" | "outline";
    colorClass: string;
  } {
    if (!health) {
      return { text: "—", variant: "outline", colorClass: "" };
    }
    
    const healthLower = health.toLowerCase();
    if (healthLower === "ontrack" || healthLower === "on track") {
      return { text: "On Track", variant: "default", colorClass: "!text-green-600 dark:!text-green-500" };
    }
    if (healthLower === "atrisk" || healthLower === "at risk") {
      return { text: "At Risk", variant: "default", colorClass: "!text-amber-600 dark:!text-amber-500" };
    }
    if (healthLower === "offtrack" || healthLower === "off track") {
      return { text: "Off Track", variant: "destructive", colorClass: "" };
    }
    
    // Fallback for any other values
    return { text: health, variant: "outline", colorClass: "" };
  }

  function handleRowMouseEnter(event: MouseEvent, project: ProjectSummary): void {
    hoveredProject = project;
    tooltipPosition = { x: event.clientX, y: event.clientY };
  }

  function handleRowMouseMove(event: MouseEvent): void {
    if (hoveredProject) {
      tooltipPosition = { x: event.clientX, y: event.clientY };
    }
  }

  function handleRowMouseLeave(): void {
    hoveredProject = null;
  }

  function handleRowClick(project: ProjectSummary): void {
    selectedProject = project;
  }

  function closeModal(): void {
    selectedProject = null;
  }

  function getProgressPercent(project: ProjectSummary): number {
    if (!project.totalIssues || project.totalIssues === 0) return 0;
    return Math.round((project.completedIssues / project.totalIssues) * 100);
  }
</script>

<div class="space-y-8">
  {#if groupBy === "team"}
    {#each teams as team}
      <Card class="px-4 py-4">
        <div class="flex items-center justify-between mb-4">
          <div class="text-lg font-medium text-neutral-900 dark:text-white">
            {team.teamName}
          </div>
          <Badge variant="outline">{team.projects.length} projects</Badge>
        </div>
        <div>
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead>
                <tr class="border-b border-neutral-200 dark:border-white/5">
                  <th
                    class="text-left py-3 px-2 text-sm font-medium text-neutral-600 dark:text-neutral-400 w-[32px]"
                  ></th>
                  <th
                    class="text-left py-3 px-2 text-sm font-medium text-neutral-600 dark:text-neutral-400 w-[200px]"
                    >Project</th
                  >
                  <th
                    class="text-left py-3 px-2 text-sm font-medium text-neutral-600 dark:text-neutral-400 w-[180px]"
                    >Progress & Issues</th
                  >
                  <th
                    class="text-left py-3 px-2 text-sm font-medium text-neutral-600 dark:text-neutral-400 w-[140px]"
                    >Health</th
                  >
                  <th
                    class="text-left py-3 px-2 text-sm font-medium text-neutral-600 dark:text-neutral-400 w-[100px]"
                    >Engineers</th
                  >
                  <th
                    class="text-left py-3 px-2 text-sm font-medium text-neutral-600 dark:text-neutral-400 w-[120px]"
                    >Est. Complete</th
                  >
                </tr>
              </thead>
              <tbody>
                {#each team.projects as project}
                  {@const progress = getProgressPercent(project)}
                  {@const completedPercent = getCompletedPercent(project)}
                  {@const wipPercent = getWIPPercent(project)}
                  {@const hasIssues = hasHealthIssues(project)}
                  {@const healthDisplay = getHealthDisplay(project.projectHealth)}
                  <tr
                    class="border-b border-neutral-200 dark:border-white/5 hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors duration-150 cursor-pointer"
                    onmouseenter={(e) => handleRowMouseEnter(e, project)}
                    onmousemove={(e) => handleRowMouseMove(e)}
                    onmouseleave={handleRowMouseLeave}
                    onclick={() => handleRowClick(project)}
                    role="button"
                    tabindex="0"
                  >
                    <td class="py-3 px-2 w-[32px]">
                      {#if hasIssues}
                        <span
                          class="text-amber-400 text-sm"
                          title="Health check failed"
                          >⚠</span
                        >
                      {/if}
                    </td>
                    <td class="py-3 px-2 w-[200px]">
                      <div
                        class="text-sm font-medium text-neutral-900 dark:text-white"
                      >
                        {project.projectName || "Unknown"}
                      </div>
                      {#if project.projectLeadName}
                        <div
                          class="text-sm text-neutral-600 dark:text-neutral-400"
                        >
                          Lead: {project.projectLeadName}
                        </div>
                      {/if}
                    </td>
                    <td class="py-3 px-2 w-[180px]">
                      <div class="space-y-1.5">
                        <div class="flex items-center gap-2">
                          <div
                            class="flex-1 h-2 bg-neutral-200 dark:bg-neutral-800 rounded overflow-hidden relative"
                          >
                            {#if completedPercent > 0}
                              <div
                                class="h-full bg-violet-500 transition-colors duration-150 absolute left-0 top-0"
                                style={`width: ${completedPercent}%`}
                              ></div>
                            {/if}
                            {#if wipPercent > 0}
                              <div
                                class="h-full bg-amber-500 transition-colors duration-150 absolute top-0"
                                style={`width: ${wipPercent}%; left: ${completedPercent}%`}
                              ></div>
                            {/if}
                          </div>
                        </div>
                        <div class="flex items-center justify-between text-xs text-neutral-600 dark:text-neutral-400">
                          <span>
                            {#if project.inProgressIssues > 0}
                              {project.inProgressIssues} in progress
                            {:else}
                              <span class="text-neutral-400 dark:text-neutral-600">0 in progress</span>
                            {/if}
                          </span>
                          <span>{project.completedIssues}/{project.totalIssues}</span>
                        </div>
                      </div>
                    </td>
                    <td class="py-3 px-2 w-[140px]">
                      <Badge variant={healthDisplay.variant} class={healthDisplay.colorClass}>
                        {healthDisplay.text}
                      </Badge>
                    </td>
                    <td
                      class="py-3 px-2 w-[100px] text-sm text-neutral-700 dark:text-neutral-300"
                      >{project.engineerCount}</td
                    >
                    <td class="py-3 px-2 w-[120px] text-sm"
                      >{formatDate(project.estimatedEndDate)}</td
                    >
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      </Card>
    {/each}
  {:else}
    {#each domains as domain}
      <Card class="px-4 py-4">
        <div class="flex items-center justify-between mb-4">
          <div class="font-semibold text-xl">{domain.domainName}</div>
          <Badge variant="outline">{domain.projects.length} projects</Badge>
        </div>
        <div>
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead>
                <tr class="border-b border-neutral-200 dark:border-white/5">
                  <th
                    class="text-left py-3 px-2 text-sm font-medium text-neutral-600 dark:text-neutral-400 w-[32px]"
                  ></th>
                  <th
                    class="text-left py-3 px-2 text-sm font-medium text-neutral-600 dark:text-neutral-400 w-[200px]"
                    >Project</th
                  >
                  <th
                    class="text-left py-3 px-2 text-sm font-medium text-neutral-600 dark:text-neutral-400 w-[180px]"
                    >Progress & Issues</th
                  >
                  <th
                    class="text-left py-3 px-2 text-sm font-medium text-neutral-600 dark:text-neutral-400 w-[140px]"
                    >Health</th
                  >
                  <th
                    class="text-left py-3 px-2 text-sm font-medium text-neutral-600 dark:text-neutral-400 w-[100px]"
                    >Engineers</th
                  >
                  <th
                    class="text-left py-3 px-2 text-sm font-medium text-neutral-600 dark:text-neutral-400 w-[120px]"
                    >Est. Complete</th
                  >
                </tr>
              </thead>
              <tbody>
                {#each domain.projects as project}
                  {@const progress = getProgressPercent(project)}
                  {@const completedPercent = getCompletedPercent(project)}
                  {@const wipPercent = getWIPPercent(project)}
                  {@const hasIssues = hasHealthIssues(project)}
                  <tr
                    class="border-b border-neutral-200 dark:border-white/5 hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors duration-150 cursor-pointer"
                    onmouseenter={(e) => handleRowMouseEnter(e, project)}
                    onmousemove={(e) => handleRowMouseMove(e)}
                    onmouseleave={handleRowMouseLeave}
                    onclick={() => handleRowClick(project)}
                    role="button"
                    tabindex="0"
                  >
                    <td class="py-3 px-2 w-[32px]">
                      {#if hasIssues}
                        <span
                          class="text-amber-400 text-sm"
                          title="Health check failed"
                          >⚠</span
                        >
                      {/if}
                    </td>
                    <td class="py-3 px-2 w-[200px]">
                      <div
                        class="text-sm font-medium text-neutral-900 dark:text-white"
                      >
                        {project.projectName || "Unknown"}
                      </div>
                      {#if project.projectLeadName}
                        <div
                          class="text-sm text-neutral-600 dark:text-neutral-400"
                        >
                          Lead: {project.projectLeadName}
                        </div>
                      {/if}
                    </td>
                    <td class="py-3 px-2 w-[180px]">
                      <div class="space-y-1.5">
                        <div class="flex items-center gap-2">
                          <div
                            class="flex-1 h-2 bg-neutral-200 dark:bg-neutral-800 rounded overflow-hidden relative"
                          >
                            {#if completedPercent > 0}
                              <div
                                class="h-full bg-violet-500 transition-colors duration-150 absolute left-0 top-0"
                                style={`width: ${completedPercent}%`}
                              ></div>
                            {/if}
                            {#if wipPercent > 0}
                              <div
                                class="h-full bg-amber-500 transition-colors duration-150 absolute top-0"
                                style={`width: ${wipPercent}%; left: ${completedPercent}%`}
                              ></div>
                            {/if}
                          </div>
                        </div>
                        <div class="flex items-center justify-between text-xs text-neutral-600 dark:text-neutral-400">
                          <span>
                            {#if project.inProgressIssues > 0}
                              {project.inProgressIssues} in progress
                            {:else}
                              <span class="text-neutral-400 dark:text-neutral-600">0 in progress</span>
                            {/if}
                          </span>
                          <span>{project.completedIssues}/{project.totalIssues}</span>
                        </div>
                      </div>
                    </td>
                    <td class="py-3 px-2 w-[140px]">
                      <Badge variant={healthDisplay.variant} class={healthDisplay.colorClass}>
                        {healthDisplay.text}
                      </Badge>
                    </td>
                    <td
                      class="py-3 px-2 w-[100px] text-sm text-neutral-700 dark:text-neutral-300"
                      >{project.engineerCount}</td
                    >
                    <td class="py-3 px-2 w-[120px] text-sm"
                      >{formatDate(project.estimatedEndDate)}</td
                    >
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      </Card>
    {/each}
  {/if}

  <!-- Hover tooltip -->
  {#if hoveredProject}
    {@const progress = getProgressPercent(hoveredProject)}
    {@const hasWarnings = hasHealthIssues(hoveredProject)}
    <div
      class="fixed z-50 px-3 py-2 text-xs text-white rounded border shadow-lg pointer-events-none bg-neutral-800 border-white/10"
      style={`left: ${tooltipPosition.x + 10}px; top: ${tooltipPosition.y + 10}px; max-width: 200px;`}
    >
      <div class="mb-1 font-medium">{hoveredProject.projectName}</div>
      <div class="space-y-0.5 text-neutral-300">
        <div>Progress: {progress}%</div>
        <div>
          {hoveredProject.completedIssues}/{hoveredProject.totalIssues} completed
        </div>
        {#if hoveredProject.inProgressIssues > 0}
          <div>{hoveredProject.inProgressIssues} in progress</div>
        {/if}
        {#if hoveredProject.projectState}
          <div>State: {hoveredProject.projectState}</div>
        {/if}
        {#if hasWarnings}
          <div class="mt-1 text-amber-400">⚠️ Has issues</div>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Project Detail Modal -->
  {#if selectedProject}
    <ProjectDetailModal project={selectedProject} onclose={closeModal} />
  {/if}
</div>

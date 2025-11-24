<script lang="ts">
  import Card from "$lib/components/ui/card.svelte";
  import ProjectDetailModal from "./ProjectDetailModal.svelte";
  import ProjectTableHeader from "./ProjectTableHeader.svelte";
  import ProjectTableHead from "./ProjectTableHead.svelte";
  import ProjectTableRow from "./ProjectTableRow.svelte";
  import type {
    ProjectSummary,
    TeamSummary,
    DomainSummary,
  } from "../project-data";
  import { getProgressPercent, getViolationSummary } from "$lib/utils/project-helpers";

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

  const groups = $derived.by(() => {
    return groupBy === "team" ? teams : domains;
  });

  // Helper function to get a unique key for each group
  function getGroupKey(group: TeamSummary | DomainSummary): string {
    if ("teamId" in group) {
      return `team-${group.teamId}`;
    }
    return `domain-${group.domainName}`;
  }

  // Log sections when displaying
  $effect(() => {
    console.log("[ProjectsTable] groupBy changed:", groupBy);
    console.log("[ProjectsTable] teams.length:", teams.length);
    console.log("[ProjectsTable] domains.length:", domains.length);
    console.log("[ProjectsTable] groups.length:", groups.length);

    if (groups.length > 0) {
      if (groupBy === "team") {
        const sections = teams.map((team) => ({
          title: team.teamName,
          projects: team.projects.map((p) => ({
            projectId: p.projectId,
            projectName: p.projectName,
          })),
        }));
        console.log("[ProjectsTable] Sections (by team):", sections);
      } else {
        // Domain grouping format: [{ domain: "Domain Name", projects: [...] }, ...]
        const sections = domains.map((domain) => ({
          domain: domain.domainName,
          projects: domain.projects.map((p) => ({
            projectId: p.projectId,
            projectName: p.projectName,
          })),
        }));
        console.log("[ProjectsTable] Sections (by domain):", sections);
        // Also log with generic "title" abstraction
        const sectionsWithTitle = domains.map((domain) => ({
          title: domain.domainName,
          projects: domain.projects.map((p) => ({
            projectId: p.projectId,
            projectName: p.projectName,
          })),
        }));
        console.log(
          "[ProjectsTable] Sections (by domain, abstracted with title):",
          sectionsWithTitle
        );
      }
    } else {
      console.warn("[ProjectsTable] groups is empty! groupBy:", groupBy);
    }
  });

  function handleRowMouseEnter(
    event: MouseEvent,
    project: ProjectSummary
  ): void {
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
</script>

<div class="space-y-8">
  {#each groups as group (getGroupKey(group))}
    <Card class="px-4 py-4">
      <ProjectTableHeader {group} />
      <div>
        <div class="overflow-x-auto">
          <table class="w-full">
            <ProjectTableHead />
            <tbody>
              {#each group.projects as project}
                <ProjectTableRow
                  {project}
                  onmouseenter={(e) => handleRowMouseEnter(e, project)}
                  onmousemove={handleRowMouseMove}
                  onmouseleave={handleRowMouseLeave}
                  onclick={() => handleRowClick(project)}
                />
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  {/each}
</div>

<!-- Hover tooltip -->
{#if hoveredProject}
  {@const progress = getProgressPercent(hoveredProject)}
  {@const violations = getViolationSummary(hoveredProject)}
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
      {#if violations.length > 0}
        <div class="mt-1.5 pt-1.5 border-t border-white/10">
          <div class="mb-0.5 text-neutral-400">Violations:</div>
          <div class="space-y-0.5">
            {#each violations as violation}
              <div>{violation}</div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}

<!-- Project Detail Modal -->
{#if selectedProject}
  <ProjectDetailModal project={selectedProject} onclose={closeModal} />
{/if}

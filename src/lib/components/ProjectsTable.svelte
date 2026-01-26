<script lang="ts">
  import Card from "$lib/components/Card.svelte";
  import ProjectDetailModal from "./ProjectDetailModal.svelte";
  import ProjectTableHeader from "./ProjectTableHeader.svelte";
  import ProjectTableHead from "./ProjectTableHead.svelte";
  import ProjectTableRow, {
    type ProjectHealthData,
  } from "./ProjectTableRow.svelte";
  import { FolderOpen } from "lucide-svelte";
  import type {
    ProjectSummary,
    TeamSummary,
    DomainSummary,
  } from "../project-data";

  let {
    teams = [],
    domains = [],
    groupBy = "team" as "team" | "domain",
    hideHeader = false,
    embedded = false,
    projectHealthMap = new Map(),
  }: {
    teams?: TeamSummary[];
    domains?: DomainSummary[];
    groupBy?: "team" | "domain";
    /** Hide the group header (useful when parent already shows group info) */
    hideHeader?: boolean;
    /** Embedded mode: skip Card wrapper and header (for use inside parent Card) */
    embedded?: boolean;
    /** Map of project ID to health data from metrics snapshot */
    projectHealthMap?: Map<string, ProjectHealthData>;
  } = $props();

  // Embedded mode implies hideHeader
  const shouldHideHeader = $derived(hideHeader || embedded);

  let selectedProject: ProjectSummary | null = $state(null);

  const groups = $derived.by(() => {
    // Explicitly reference teams and domains to ensure reactivity
    const teamsList = teams;
    const domainsList = domains;
    const grouping = groupBy;
    return grouping === "team" ? teamsList : domainsList;
  });

  // Helper function to get a unique key for each group
  function getGroupKey(group: TeamSummary | DomainSummary): string {
    if ("teamId" in group) {
      return `team-${group.teamId}`;
    }
    return `domain-${group.domainName}`;
  }

  function handleRowClick(project: ProjectSummary): void {
    selectedProject = project;
  }

  function closeModal(): void {
    selectedProject = null;
  }
</script>

<div class="space-y-8">
  {#if groups.length === 0 || groups.every((g) => g.projects.length === 0)}
    {#if embedded}
      <!-- Embedded empty state: no Card wrapper -->
      <div class="overflow-x-auto">
        <table class="w-full">
          <ProjectTableHead />
          <tbody>
            <tr>
              <td colspan="10" class="p-0">
                <div class="flex justify-center items-center min-h-[20vh]">
                  <div class="flex flex-col gap-3 items-center text-center">
                    <FolderOpen
                      class="w-8 h-8 text-neutral-500 dark:text-neutral-600"
                      strokeWidth={1.5}
                    />
                    <div class="text-sm text-neutral-400 dark:text-neutral-500">
                      No projects found
                    </div>
                  </div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    {:else}
      <!-- Standalone empty state: with Card wrapper -->
      <Card class="px-4 py-4">
        <div class="overflow-x-auto">
          <table class="w-full">
            <ProjectTableHead />
            <tbody>
              <tr>
                <td colspan="10" class="p-0">
                  <div class="flex justify-center items-center min-h-[33vh]">
                    <div class="flex flex-col gap-3 items-center text-center">
                      <FolderOpen
                        class="w-8 h-8 text-neutral-500 dark:text-neutral-600"
                        strokeWidth={1.5}
                      />
                      <div
                        class="text-sm text-neutral-400 dark:text-neutral-500"
                      >
                        No projects found
                      </div>
                    </div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    {/if}
  {:else}
    {#each groups as group (getGroupKey(group))}
      {#if embedded}
        <!-- Embedded mode: no Card wrapper, just the table -->
        {#if !shouldHideHeader}
          <ProjectTableHeader {group} />
        {/if}
        <div class="overflow-x-auto">
          <table class="w-full">
            <ProjectTableHead />
            <tbody>
              {#each group.projects as project}
                <ProjectTableRow
                  {project}
                  projectHealth={projectHealthMap.get(project.projectId)}
                  onclick={() => handleRowClick(project)}
                />
              {/each}
            </tbody>
          </table>
        </div>
      {:else}
        <!-- Standalone mode: wrap in Card -->
        <Card class="px-4 py-4">
          {#if !shouldHideHeader}
            <ProjectTableHeader {group} />
          {/if}
          <div>
            <div class="overflow-x-auto">
              <table class="w-full">
                <ProjectTableHead />
                <tbody>
                  {#each group.projects as project}
                    <ProjectTableRow
                      {project}
                      projectHealth={projectHealthMap.get(project.projectId)}
                      onclick={() => handleRowClick(project)}
                    />
                  {/each}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      {/if}
    {/each}
  {/if}
</div>

<!-- Project Detail Modal -->
{#if selectedProject}
  <ProjectDetailModal project={selectedProject} onclose={closeModal} />
{/if}

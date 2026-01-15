<script lang="ts">
  import Card from "$lib/components/Card.svelte";
  import ProjectDetailModal from "./ProjectDetailModal.svelte";
  import ProjectTableHeader from "./ProjectTableHeader.svelte";
  import ProjectTableHead from "./ProjectTableHead.svelte";
  import ProjectTableRow from "./ProjectTableRow.svelte";
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
  }: {
    teams?: TeamSummary[];
    domains?: DomainSummary[];
    groupBy?: "team" | "domain";
  } = $props();

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

  function handleRowClick(project: ProjectSummary): void {
    selectedProject = project;
  }

  function closeModal(): void {
    selectedProject = null;
  }
</script>

<div class="space-y-8">
  {#if groups.length === 0 || groups.every((g) => g.projects.length === 0)}
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
    </Card>
  {:else}
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
                    onclick={() => handleRowClick(project)}
                  />
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      </Card>
    {/each}
  {/if}
</div>

<!-- Project Detail Modal -->
{#if selectedProject}
  <ProjectDetailModal project={selectedProject} onclose={closeModal} />
{/if}

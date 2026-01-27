<script lang="ts">
  import ProjectTableHead from "./ProjectTableHead.svelte";
  import ProjectTableRow from "./ProjectTableRow.svelte";
  import { FolderOpen } from "lucide-svelte";
  import type { ProjectSummary } from "../project-data";

  let {
    projects,
    hideWarnings = false,
    onProjectClick,
  }: {
    projects: ProjectSummary[];
    hideWarnings?: boolean;
    onProjectClick?: (project: ProjectSummary) => void;
  } = $props();

  function handleRowClick(project: ProjectSummary): void {
    onProjectClick?.(project);
  }
</script>

<div class="overflow-x-auto">
  <table class="w-full text-sm min-w-[680px]">
    <ProjectTableHead />
    <tbody>
      {#if projects.length === 0}
        <tr>
          <td colspan="10" class="p-0">
            <div class="flex justify-center items-center min-h-[33vh]">
              <div class="flex flex-col gap-3 items-center text-center">
                <FolderOpen
                  class="w-8 h-8 text-black-500 dark:text-black-600"
                  strokeWidth={1.5}
                />
                <div class="text-sm text-black-400 dark:text-black-500">
                  No projects found
                </div>
              </div>
            </div>
          </td>
        </tr>
      {:else}
        {#each projects as project}
          <ProjectTableRow
            {project}
            {hideWarnings}
            onclick={() => handleRowClick(project)}
          />
        {/each}
      {/if}
    </tbody>
  </table>
</div>

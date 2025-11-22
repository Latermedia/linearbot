<script lang="ts">
  import Badge from "$lib/components/ui/badge.svelte";
  import Card from "$lib/components/ui/card.svelte";
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

  function getProgressPercent(project: ProjectSummary): number {
    if (!project.totalIssues || project.totalIssues === 0) return 0;
    return Math.round((project.completedIssues / project.totalIssues) * 100);
  }

  function getStatusBadge(project: ProjectSummary) {
    if (project.hasStatusMismatch) {
      return { text: "Status Mismatch", variant: "destructive" as const };
    }
    if (project.isStaleUpdate) {
      return { text: "Stale (7+ days)", variant: "destructive" as const };
    }
    if (project.missingLead) {
      return { text: "Missing Lead", variant: "secondary" as const };
    }
    const progress = getProgressPercent(project);
    if (!isNaN(progress) && progress >= 70) {
      return { text: "Near Completion", variant: "default" as const };
    }
    return { text: "On Track", variant: "outline" as const };
  }

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return "N/A";
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
    });
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
                    class="text-left py-3 px-2 text-sm font-medium text-neutral-600 dark:text-neutral-400"
                    >Project</th
                  >
                  <th
                    class="text-left py-3 px-2 text-sm font-medium text-neutral-600 dark:text-neutral-400"
                    >Progress</th
                  >
                  <th
                    class="text-left py-3 px-2 text-sm font-medium text-neutral-600 dark:text-neutral-400"
                    >Status</th
                  >
                  <th
                    class="text-left py-3 px-2 text-sm font-medium text-neutral-600 dark:text-neutral-400"
                    >Engineers</th
                  >
                  <th
                    class="text-left py-3 px-2 text-sm font-medium text-neutral-600 dark:text-neutral-400"
                    >Issues</th
                  >
                  <th
                    class="text-left py-3 px-2 text-sm font-medium text-neutral-600 dark:text-neutral-400"
                    >Est. Complete</th
                  >
                </tr>
              </thead>
              <tbody>
                {#each team.projects as project}
                  {@const progress = getProgressPercent(project)}
                  {@const status = getStatusBadge(project)}
                  <tr
                    class="border-b border-neutral-200 dark:border-white/5 hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors duration-150"
                  >
                    <td class="py-3 px-2">
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
                    <td class="py-3 px-2">
                      <div class="flex items-center gap-2">
                        <div
                          class="flex-1 h-2 bg-neutral-200 dark:bg-neutral-800 rounded overflow-hidden max-w-[100px]"
                        >
                          <div
                            class="h-full bg-violet-500 transition-colors duration-150"
                            style={`width: ${progress}%`}
                          ></div>
                        </div>
                        <span class="text-sm text-neutral-900 dark:text-white"
                          >{progress}%</span
                        >
                      </div>
                    </td>
                    <td class="py-3 px-2">
                      <Badge variant={status?.variant || "default"}
                        >{status?.text || "Unknown"}</Badge
                      >
                    </td>
                    <td
                      class="py-3 px-2 text-sm text-neutral-700 dark:text-neutral-300"
                      >{project.engineerCount}</td
                    >
                    <td class="py-3 px-2">
                      <div class="text-sm">
                        <div class="text-neutral-900 dark:text-white">
                          {project.completedIssues}/{project.totalIssues} done
                        </div>
                        <div class="text-neutral-600 dark:text-neutral-400">
                          {project.inProgressIssues} in progress
                        </div>
                      </div>
                    </td>
                    <td class="py-3 px-2 text-sm"
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
                    class="text-left py-3 px-2 text-sm font-medium text-neutral-600 dark:text-neutral-400"
                    >Project</th
                  >
                  <th
                    class="text-left py-3 px-2 text-sm font-medium text-neutral-600 dark:text-neutral-400"
                    >Progress</th
                  >
                  <th
                    class="text-left py-3 px-2 text-sm font-medium text-neutral-600 dark:text-neutral-400"
                    >Status</th
                  >
                  <th
                    class="text-left py-3 px-2 text-sm font-medium text-neutral-600 dark:text-neutral-400"
                    >Engineers</th
                  >
                  <th
                    class="text-left py-3 px-2 text-sm font-medium text-neutral-600 dark:text-neutral-400"
                    >Issues</th
                  >
                  <th
                    class="text-left py-3 px-2 text-sm font-medium text-neutral-600 dark:text-neutral-400"
                    >Est. Complete</th
                  >
                </tr>
              </thead>
              <tbody>
                {#each domain.projects as project}
                  {@const progress = getProgressPercent(project)}
                  {@const status = getStatusBadge(project)}
                  <tr
                    class="border-b border-neutral-200 dark:border-white/5 hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors duration-150"
                  >
                    <td class="py-3 px-2">
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
                    <td class="py-3 px-2">
                      <div class="flex items-center gap-2">
                        <div
                          class="flex-1 h-2 bg-neutral-200 dark:bg-neutral-800 rounded overflow-hidden max-w-[100px]"
                        >
                          <div
                            class="h-full bg-violet-500 transition-colors duration-150"
                            style={`width: ${progress}%`}
                          ></div>
                        </div>
                        <span class="text-sm text-neutral-900 dark:text-white"
                          >{progress}%</span
                        >
                      </div>
                    </td>
                    <td class="py-3 px-2">
                      <Badge variant={status?.variant || "default"}
                        >{status?.text || "Unknown"}</Badge
                      >
                    </td>
                    <td
                      class="py-3 px-2 text-sm text-neutral-700 dark:text-neutral-300"
                      >{project.engineerCount}</td
                    >
                    <td class="py-3 px-2">
                      <div class="text-sm">
                        <div class="text-neutral-900 dark:text-white">
                          {project.completedIssues}/{project.totalIssues} done
                        </div>
                        <div class="text-neutral-600 dark:text-neutral-400">
                          {project.inProgressIssues} in progress
                        </div>
                      </div>
                    </td>
                    <td class="py-3 px-2 text-sm"
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
</div>

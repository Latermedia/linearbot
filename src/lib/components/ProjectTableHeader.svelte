<script lang="ts">
  import Badge from "$lib/components/ui/badge.svelte";
  import type { TeamSummary, DomainSummary } from "../project-data";

  let {
    group,
  }: {
    group: TeamSummary | DomainSummary;
  } = $props();

  const groupName = "teamName" in group ? group.teamName : group.domainName;
  const projectCount = group.projects.length;
</script>

<div class="flex items-center justify-between mb-4">
  <div class="text-lg font-medium text-neutral-900 dark:text-white">
    {groupName}
  </div>
  <Badge variant="outline">{projectCount} projects</Badge>
</div>

<script lang="ts">
  import Badge from "$lib/components/ui/badge.svelte";
  import Button from "$lib/components/ui/button.svelte";
  import { cn } from "$lib/utils";
  import { Image } from "lucide-svelte";
  import type { TeamSummary, DomainSummary } from "../project-data";

  let {
    group,
    hoveredSection,
    sectionKey,
    onExport,
  }: {
    group: TeamSummary | DomainSummary;
    hoveredSection: string | null;
    sectionKey: string;
    onExport?: () => void;
  } = $props();

  const groupName = "teamName" in group ? group.teamName : group.domainName;
  const isTeam = "teamName" in group;
</script>

<div class="flex relative gap-2 items-center mb-3">
  <h3
    class={cn(
      "text-lg font-medium text-neutral-900 dark:text-white",
      !isTeam && "flex gap-2 items-center"
    )}
  >
    {groupName}
    {#if !isTeam}
      <Badge variant="outline">{group.projects.length} projects</Badge>
    {/if}
  </h3>
  {#if onExport}
    <Button
      variant="ghost"
      size="icon-sm"
      class={cn(
        "opacity-0 group-hover:opacity-100 transition-opacity duration-150",
        hoveredSection === sectionKey && "opacity-100"
      )}
      onclick={onExport}
      aria-label={isTeam ? "Export team timeline" : "Export domain timeline"}
    >
      <Image class="w-4 h-4" />
    </Button>
  {/if}
</div>

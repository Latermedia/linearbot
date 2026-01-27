<script lang="ts">
  import Badge from "./Badge.svelte";
  import UserProfile from "./UserProfile.svelte";
  import {
    formatDate,
    formatRelativeDate,
    getHealthDisplay,
  } from "$lib/utils/project-helpers";

  interface InitiativeData {
    id: string;
    name: string;
    description: string | null;
    status: string | null;
    target_date: string | null;
    completed_at: string | null;
    started_at: string | null;
    archived_at: string | null;
    health: string | null;
    health_updated_at: string | null;
    owner_id: string | null;
    owner_name: string | null;
    creator_id: string | null;
    creator_name: string | null;
    project_ids: string | null;
    created_at: string;
    updated_at: string;
  }

  let {
    initiatives,
    onInitiativeClick,
  }: {
    initiatives: InitiativeData[];
    onInitiativeClick: (initiative: InitiativeData) => void;
  } = $props();

  function parseProjectIds(projectIdsJson: string | null): string[] {
    if (!projectIdsJson) return [];
    try {
      const ids = JSON.parse(projectIdsJson);
      return Array.isArray(ids) ? ids : [];
    } catch {
      return [];
    }
  }

  function getStatusBadgeVariant(
    status: string | null,
    archivedAt: string | null,
    completedAt: string | null
  ): "default" | "secondary" | "outline" {
    if (archivedAt) return "outline";
    if (completedAt) return "secondary";
    if (status === "on_track" || status === "onTrack") return "default";
    return "outline";
  }

  function getHealthBadgeDisplay(health: string | null) {
    if (!health) {
      return { text: "—", variant: "outline" as const, colorClass: "" };
    }
    return getHealthDisplay(health);
  }

  function getDisplayDate(initiative: InitiativeData): string {
    if (initiative.completed_at) {
      return formatDate(initiative.completed_at);
    }
    if (initiative.target_date) {
      return formatDate(initiative.target_date);
    }
    return "—";
  }
</script>

<div class="overflow-x-auto">
  <table class="w-full text-sm">
    <thead>
      <tr class="border-b border-black-200 dark:border-white/10">
        <th class="px-4 py-3 font-medium text-left text-black-400 min-w-[200px]"
          >Name</th
        >
        <th class="px-4 py-3 font-medium text-left text-black-400 w-[120px]"
          >Status</th
        >
        <th class="px-4 py-3 font-medium text-left text-black-400 w-[120px]"
          >Health</th
        >
        <th class="px-4 py-3 font-medium text-center text-black-400 w-[100px]"
          >Projects</th
        >
        <th class="px-4 py-3 font-medium text-left text-black-400 w-[140px]"
          >Target/Completed</th
        >
        <th class="px-4 py-3 font-medium text-right text-black-400 w-[120px]"
          >Updated</th
        >
      </tr>
    </thead>
    <tbody>
      {#each initiatives as initiative}
        {@const projectIds = parseProjectIds(initiative.project_ids)}
        {@const healthDisplay = getHealthBadgeDisplay(initiative.health)}
        <tr
          class="border-b transition-colors cursor-pointer border-white/5 hover:bg-black-100 dark:hover:bg-black-50 dark:bg-white/5"
          onclick={() => onInitiativeClick(initiative)}
          role="button"
          tabindex="0"
          onkeydown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onInitiativeClick(initiative);
            }
          }}
        >
          <td class="px-4 py-3">
            <div class="flex flex-col gap-1">
              <div
                class="text-sm font-medium text-black-900 dark:text-black-900 dark:text-white"
              >
                {initiative.name}
              </div>
              {#if initiative.owner_name}
                <div class="flex gap-1.5 items-center">
                  <UserProfile
                    name={initiative.owner_name}
                    avatarUrl={null}
                    size="xs"
                  />
                  <span class="text-xs text-black-500 dark:text-black-400"
                    >Owner</span
                  >
                </div>
              {/if}
            </div>
          </td>
          <td class="px-4 py-3">
            {#if initiative.status || initiative.archived_at || initiative.completed_at}
              <Badge
                variant={getStatusBadgeVariant(
                  initiative.status,
                  initiative.archived_at,
                  initiative.completed_at
                )}
                class="text-xs"
              >
                {initiative.archived_at
                  ? "Archived"
                  : initiative.completed_at
                    ? "Completed"
                    : initiative.status || "—"}
              </Badge>
            {:else}
              <span class="text-sm text-black-400 dark:text-black-600">—</span>
            {/if}
          </td>
          <td class="px-4 py-3">
            <Badge
              variant={healthDisplay.variant}
              class={healthDisplay.colorClass}
            >
              {healthDisplay.text}
            </Badge>
          </td>
          <td class="px-4 py-3 text-center">
            {#if projectIds.length > 0}
              <Badge variant="outline" class="text-xs">
                {projectIds.length}
              </Badge>
            {:else}
              <span class="text-sm text-black-400 dark:text-black-600">—</span>
            {/if}
          </td>
          <td class="px-4 py-3 text-sm text-black-600 dark:text-black-400">
            {getDisplayDate(initiative)}
          </td>
          <td
            class="px-4 py-3 text-right text-sm text-black-400 dark:text-black-500"
          >
            {formatRelativeDate(initiative.updated_at)}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

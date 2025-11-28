<script lang="ts">
  import Badge from "./ui/badge.svelte";
  import { WIP_THRESHOLDS } from "../../constants/thresholds";

  interface EngineerData {
    assignee_id: string;
    assignee_name: string;
    team_ids: string;
    team_names: string;
    wip_issue_count: number;
    wip_total_points: number;
    wip_limit_violation: number;
    oldest_wip_age_days: number | null;
    last_activity_at: string | null;
    missing_estimate_count: number;
    missing_priority_count: number;
    no_recent_comment_count: number;
    wip_age_violation_count: number;
    active_issues: string;
  }

  let {
    engineers,
    onEngineerClick,
  }: {
    engineers: EngineerData[];
    onEngineerClick: (engineer: EngineerData) => void;
  } = $props();

  function formatWIPAge(days: number | null): string {
    if (days === null) return "—";
    if (days < 1) return "< 1d";
    return `${Math.round(days)}d`;
  }

  function formatRelativeTime(dateString: string | null): string {
    if (!dateString) return "—";
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  }

  function getWIPBadgeVariant(
    count: number
  ): "default" | "secondary" | "outline" | "destructive" {
    if (count >= WIP_THRESHOLDS.CRITICAL) return "destructive";
    if (count >= WIP_THRESHOLDS.WARNING) return "secondary";
    return "outline";
  }

  function getWIPBadgeClass(count: number): string {
    if (count >= WIP_THRESHOLDS.CRITICAL)
      return "bg-red-500/20 text-red-400 border-red-500/30";
    if (count >= WIP_THRESHOLDS.WARNING)
      return "bg-amber-500/20 text-amber-400 border-amber-500/30";
    if (count <= WIP_THRESHOLDS.OK)
      return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
    return "";
  }

  function getTotalViolations(engineer: EngineerData): number {
    return (
      engineer.missing_estimate_count +
      engineer.missing_priority_count +
      engineer.no_recent_comment_count +
      engineer.wip_age_violation_count
    );
  }

  function parseTeamNames(teamNamesJson: string): string[] {
    try {
      return JSON.parse(teamNamesJson);
    } catch {
      return [];
    }
  }
</script>

<div class="overflow-x-auto">
  <table class="w-full text-sm">
    <thead>
      <tr class="border-b border-white/10">
        <th
          class="px-4 py-3 font-medium text-left text-neutral-400 min-w-[180px]"
          >Engineer</th
        >
        <th class="px-4 py-3 font-medium text-left text-neutral-400">Teams</th>
        <th class="px-4 py-3 font-medium text-center text-neutral-400 w-[100px]"
          >WIP Count</th
        >
        <th class="px-4 py-3 font-medium text-right text-neutral-400 w-[100px]"
          >Total Points</th
        >
        <th class="px-4 py-3 font-medium text-right text-neutral-400 w-[100px]"
          >Oldest WIP</th
        >
        <th class="px-4 py-3 font-medium text-center text-neutral-400 w-[100px]"
          >Violations</th
        >
        <th class="px-4 py-3 font-medium text-right text-neutral-400 w-[120px]"
          >Last Activity</th
        >
      </tr>
    </thead>
    <tbody>
      {#each engineers as engineer}
        {@const teamNames = parseTeamNames(engineer.team_names)}
        {@const totalViolations = getTotalViolations(engineer)}
        <tr
          class="border-b transition-colors cursor-pointer border-white/5 hover:bg-white/5"
          onclick={() => onEngineerClick(engineer)}
          role="button"
          tabindex="0"
          onkeydown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onEngineerClick(engineer);
            }
          }}
        >
          <td class="px-4 py-3">
            <div class="flex gap-2 items-center">
              <span class="font-medium text-white"
                >{engineer.assignee_name}</span
              >
              {#if engineer.wip_limit_violation}
                <span class="text-amber-500" title="Over WIP limit">⚠️</span>
              {/if}
            </div>
          </td>
          <td class="px-4 py-3">
            <div class="flex flex-wrap gap-1">
              {#each teamNames as team}
                <Badge variant="outline" class="text-xs">{team}</Badge>
              {/each}
            </div>
          </td>
          <td class="px-4 py-3 text-center">
            <Badge
              variant={getWIPBadgeVariant(engineer.wip_issue_count)}
              class={getWIPBadgeClass(engineer.wip_issue_count)}
            >
              {engineer.wip_issue_count}
            </Badge>
          </td>
          <td class="px-4 py-3 text-right text-neutral-300">
            {Math.round(engineer.wip_total_points)}
          </td>
          <td class="px-4 py-3 text-right text-neutral-300">
            {formatWIPAge(engineer.oldest_wip_age_days)}
          </td>
          <td class="px-4 py-3 text-center">
            {#if totalViolations > 0}
              <Badge
                variant="secondary"
                class="bg-amber-500/20 text-amber-400 border-amber-500/30"
              >
                {totalViolations}
              </Badge>
            {:else}
              <span class="text-neutral-500">—</span>
            {/if}
          </td>
          <td class="px-4 py-3 text-right text-neutral-400">
            {formatRelativeTime(engineer.last_activity_at)}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

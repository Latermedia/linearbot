<script lang="ts">
  import Badge from "./Badge.svelte";
  import UserProfile from "./UserProfile.svelte";
  import {
    getWIPCountStatus,
    getProjectCountStatus,
    getGapsCountStatus,
    getStatusTextColor,
  } from "../utils/status-colors";

  interface EngineerData {
    assignee_id: string;
    assignee_name: string;
    avatar_url: string | null;
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
    active_project_count?: number;
    multi_project_violation?: number;
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

  function getTotalGaps(engineer: EngineerData): number {
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
        <th class="px-4 py-3 font-medium text-center text-neutral-400 w-[100px]"
          >Projects</th
        >
        <th class="px-4 py-3 font-medium text-right text-neutral-400 w-[100px]"
          >Total Points</th
        >
        <th class="px-4 py-3 font-medium text-right text-neutral-400 w-[100px]"
          >Oldest WIP</th
        >
        <th class="px-4 py-3 font-medium text-center text-neutral-400 w-[100px]"
          >Gaps</th
        >
        <th class="px-4 py-3 font-medium text-right text-neutral-400 w-[120px]"
          >Last Activity</th
        >
      </tr>
    </thead>
    <tbody>
      {#each engineers as engineer}
        {@const teamNames = parseTeamNames(engineer.team_names)}
        {@const totalGaps = getTotalGaps(engineer)}
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
            <UserProfile
              name={engineer.assignee_name}
              avatarUrl={engineer.avatar_url}
              size="sm"
            />
          </td>
          <td class="px-4 py-3">
            <div class="flex flex-wrap gap-1">
              {#each teamNames as team}
                <Badge variant="outline" class="text-xs">{team}</Badge>
              {/each}
            </div>
          </td>
          <td class="px-4 py-3 text-center">
            <span
              class="text-sm font-semibold {getStatusTextColor(
                getWIPCountStatus(engineer.wip_issue_count)
              )}"
            >
              {engineer.wip_issue_count}
            </span>
          </td>
          <td class="px-4 py-3 text-center">
            <span
              class="text-sm font-semibold {getStatusTextColor(
                getProjectCountStatus(engineer.active_project_count)
              )}"
            >
              {engineer.active_project_count ?? "—"}
            </span>
          </td>
          <td class="px-4 py-3 text-right text-neutral-300">
            {Math.round(engineer.wip_total_points)}
          </td>
          <td class="px-4 py-3 text-right text-neutral-300">
            {formatWIPAge(engineer.oldest_wip_age_days)}
          </td>
          <td class="px-4 py-3 text-center">
            <span
              class="text-sm font-semibold {getStatusTextColor(
                getGapsCountStatus(totalGaps)
              )}"
            >
              {totalGaps}
            </span>
          </td>
          <td class="px-4 py-3 text-right text-neutral-400">
            {formatRelativeTime(engineer.last_activity_at)}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

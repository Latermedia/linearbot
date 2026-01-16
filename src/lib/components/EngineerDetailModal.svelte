<script lang="ts">
  import Badge from "./Badge.svelte";
  import IssueTable from "./IssueTable.svelte";
  import UserProfile from "./UserProfile.svelte";
  import Modal from "./Modal.svelte";
  import { WIP_LIMIT } from "../../constants/thresholds";
  import { getGapsColorClass } from "../utils/gaps-helpers";

  interface IssueSummary {
    id: string;
    identifier: string;
    title: string;
    estimate: number | null;
    priority: number;
    last_comment_at: string | null;
    comment_count: number | null;
    started_at: string | null;
    url: string;
    team_name: string;
    project_name: string | null;
    state_name?: string;
    state_type?: string;
  }

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
  }

  let {
    engineer,
    onclose,
  }: {
    engineer: EngineerData;
    onclose: () => void;
  } = $props();

  function parseActiveIssues(issuesJson: string): IssueSummary[] {
    try {
      return JSON.parse(issuesJson);
    } catch {
      return [];
    }
  }

  function parseTeamNames(teamNamesJson: string): string[] {
    try {
      return JSON.parse(teamNamesJson);
    } catch {
      return [];
    }
  }

  function formatWIPAge(days: number | null): string {
    if (days === null) return "—";
    if (days < 1) return "< 1 day";
    if (days === 1) return "1 day";
    return `${Math.round(days)} days`;
  }

  function formatRelativeTime(dateString: string | null): string {
    if (!dateString) return "—";
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 60) return `${diffMins} minutes ago`;
    if (diffHours < 24) return `${diffHours} hours ago`;
    if (diffDays === 1) return "1 day ago";
    return `${diffDays} days ago`;
  }

  function getWIPStatusText(count: number): string {
    return count > WIP_LIMIT ? "Over Limit" : "OK";
  }

  function getWIPStatusClass(count: number): string {
    return count > WIP_LIMIT ? "text-red-400" : "text-emerald-400";
  }

  const activeIssues = $derived(parseActiveIssues(engineer.active_issues));
  const teamNames = $derived(parseTeamNames(engineer.team_names));
  const totalViolations = $derived(
    engineer.missing_estimate_count +
      engineer.missing_priority_count +
      engineer.no_recent_comment_count +
      engineer.wip_age_violation_count
  );
</script>

<Modal
  {onclose}
  size="2xl"
  maxHeight="90vh"
  scrollable={true}
  header={headerSnippet}
  children={childrenSnippet}
>
  {#snippet headerSnippet()}
    <div
      class="flex justify-between items-start p-6 pb-4 border-b shrink-0 border-white/10"
    >
      <div class="flex-1 min-w-0">
        <div class="flex gap-3 items-center">
          <UserProfile
            name={engineer.assignee_name}
            avatarUrl={engineer.avatar_url}
            size="lg"
            showName={false}
          />
          <div>
            <h2
              id="modal-title"
              class="flex gap-2 items-center text-xl font-medium text-white"
            >
              {engineer.assignee_name}
              {#if engineer.wip_limit_violation}
                <span class="text-amber-500" title="Over WIP limit">⚠️</span>
              {/if}
            </h2>
            <div class="flex flex-wrap gap-1 mt-1">
              {#each teamNames as team}
                <Badge variant="outline" class="text-xs">{team}</Badge>
              {/each}
            </div>
          </div>
        </div>
      </div>
      <button
        class="inline-flex justify-center items-center p-1.5 rounded transition-colors duration-150 cursor-pointer text-neutral-400 hover:text-white hover:bg-white/10"
        onclick={onclose}
        aria-label="Close modal"
        title="Close (ESC)"
      >
        <svg
          class="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>
  {/snippet}

  {#snippet childrenSnippet()}
    <!-- Summary Stats -->
    <div class="grid grid-cols-2 gap-4 mb-6 sm:grid-cols-5">
      <div class="p-3 rounded-md border bg-neutral-800/50 border-white/5">
        <div class="mb-1 text-xs text-neutral-500">WIP Issues</div>
        <div
          class="text-2xl font-semibold {getWIPStatusClass(
            engineer.wip_issue_count
          )}"
        >
          {engineer.wip_issue_count}
        </div>
        <div class="text-xs {getWIPStatusClass(engineer.wip_issue_count)}">
          {getWIPStatusText(engineer.wip_issue_count)}
        </div>
      </div>
      <div class="p-3 rounded-md border bg-neutral-800/50 border-white/5">
        <div class="mb-1 text-xs text-neutral-500">Total Points</div>
        <div class="text-2xl font-semibold text-white">
          {Math.round(engineer.wip_total_points)}
        </div>
        <div class="text-xs text-neutral-500">in progress</div>
      </div>
      <div class="p-3 rounded-md border bg-neutral-800/50 border-white/5">
        <div class="mb-1 text-xs text-neutral-500">Oldest Issue</div>
        <div class="text-2xl font-semibold text-white">
          {formatWIPAge(engineer.oldest_wip_age_days)}
        </div>
        <div class="text-xs text-neutral-500">in WIP</div>
      </div>
      <div class="p-3 rounded-md border bg-neutral-800/50 border-white/5">
        <div class="mb-1 text-xs text-neutral-500">Gaps</div>
        <div
          class="text-2xl font-semibold {getGapsColorClass(totalViolations)}"
        >
          {totalViolations}
        </div>
        <div class="text-xs text-neutral-500">issues</div>
      </div>
      <div class="p-3 rounded-md border bg-neutral-800/50 border-white/5">
        <div class="mb-1 text-xs text-neutral-500">Last Activity</div>
        <div class="text-lg font-semibold text-white">
          {formatRelativeTime(engineer.last_activity_at)}
        </div>
      </div>
    </div>

    <!-- Active Issues Table -->
    <div>
      <div class="mb-3 text-sm font-medium text-neutral-300">
        Active Issues ({activeIssues.length})
      </div>
      <IssueTable issues={activeIssues} />
    </div>
  {/snippet}
</Modal>

<script lang="ts">
  import { browser } from "$app/environment";
  import {
    groupIssuesByParent,
    type GroupedIssue,
    groupIssuesBy,
    type GroupByOption,
  } from "$lib/utils/project-helpers";
  import { hasSubissueStatusMismatch } from "../../utils/issue-validators";
  import UserProfile from "./UserProfile.svelte";
  import PriorityDisplay from "./PriorityDisplay.svelte";
  import StatusDisplay from "./StatusDisplay.svelte";
  import type { Issue } from "../../db/schema";

  interface IssueData {
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
    parent_id?: string | null;
    // Optional fields for full Issue objects
    assignee_name?: string | null;
    assignee_avatar_url?: string | null;
    state_name?: string;
    state_type?: string;
  }

  /**
   * Check if issue should have alerts suppressed (cancelled/duplicate states)
   */
  function shouldSuppressAlerts(issue: IssueData): boolean {
    const stateName = issue.state_name?.toLowerCase() || "";
    return (
      stateName.includes("cancel") ||
      stateName.includes("duplicate") ||
      issue.state_type === "canceled"
    );
  }

  let {
    issues,
    showAssignee = false,
    hideWarnings = false,
  }: {
    issues: IssueData[];
    showAssignee?: boolean;
    hideWarnings?: boolean;
  } = $props();

  let groupBy: GroupByOption = $state("none");

  function formatIssueWIPAge(issue: IssueData): string {
    if (!issue.started_at) return "—";
    const started = new Date(issue.started_at);
    const now = new Date();
    const diffDays =
      (now.getTime() - started.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays < 1) return "< 1d";
    return `${Math.round(diffDays)}d`;
  }

  function isStaleWIP(issue: IssueData): boolean {
    if (shouldSuppressAlerts(issue)) return false;
    if (!issue.started_at) return false;
    const started = new Date(issue.started_at);
    const now = new Date();
    const diffDays =
      (now.getTime() - started.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays >= 14; // WIP_AGE_THRESHOLDS.WIP_AGE_DAYS
  }

  function checkMissingEstimate(issue: IssueData): boolean {
    if (shouldSuppressAlerts(issue)) return false;
    return issue.estimate === null || issue.estimate === undefined;
  }

  function checkMissingPriority(issue: IssueData): boolean {
    // Exclude subissues from priority warnings
    if (issue.parent_id) return false;
    if (shouldSuppressAlerts(issue)) return false;
    return !issue.priority || issue.priority === 0;
  }

  function checkNoRecentComment(issue: IssueData): boolean {
    // Only check comment recency for WIP issues
    if (issue.state_type !== "started") return false;
    if (shouldSuppressAlerts(issue)) return false;
    if (!issue.last_comment_at) return true;
    const lastComment = new Date(issue.last_comment_at);
    const now = new Date();
    const hoursSince =
      (now.getTime() - lastComment.getTime()) / (1000 * 60 * 60);
    return hoursSince > 24;
  }

  function getCommentRecency(lastCommentAt: string | null): string {
    if (!lastCommentAt) return "Never";
    const date = new Date(lastCommentAt);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffHours < 1) return "< 1h ago";
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return "1d ago";
    return `${diffDays}d ago`;
  }

  // Prepare grouped data
  const groupedData = $derived(() => {
    const issuesAsIssues = issues as Issue[];

    if (groupBy === "none") {
      // Just group by parent-subissue
      return [{ key: "All", issues: groupIssuesByParent(issuesAsIssues) }];
    }

    // First group by the selected field
    const groups = groupIssuesBy(issuesAsIssues, groupBy);
    const result: Array<{ key: string; issues: GroupedIssue[] }> = [];

    for (const [groupKey, groupIssues] of groups) {
      // Then group by parent-subissue within each group
      result.push({
        key: groupKey,
        issues: groupIssuesByParent(groupIssues),
      });
    }

    // Sort groups
    result.sort((a, b) => a.key.localeCompare(b.key));

    return result;
  });
</script>

{#if issues.length === 0}
  <div class="text-sm text-neutral-400">No issues found</div>
{:else}
  <div class="space-y-2">
    <!-- Group by selector -->
    <div class="flex justify-end items-center gap-2">
      <label class="text-xs text-neutral-400">Group by:</label>
      <select
        bind:value={groupBy}
        class="px-2 py-1 text-xs text-white rounded border transition-colors duration-150 bg-neutral-900 border-white/10 focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50 focus:outline-none"
      >
        <option value="none">None</option>
        <option value="assignee">Assignee</option>
        <option value="status">Status</option>
        <option value="priority">Priority</option>
      </select>
    </div>
    <div class="overflow-x-auto">
      <table class="w-full text-xs min-w-[600px]">
        <thead>
          <tr class="border-b border-white/10">
            <th
              class="px-2 py-1.5 font-medium text-left text-neutral-400 min-w-[200px]"
              >Issue</th
            >
            {#if showAssignee}
              <th
                class="px-2 py-1.5 font-medium text-left text-neutral-400 w-[120px] min-w-[120px]"
                >Assignee</th
              >
            {/if}
            <th
              class="px-2 py-1.5 font-medium text-left text-neutral-400 w-[100px] min-w-[100px]"
              >Team</th
            >
            <th
              class="px-2 py-1.5 font-medium text-left text-neutral-400 w-[120px] min-w-[120px]"
              >Status</th
            >
            <th
              class="px-2 py-1.5 font-medium text-right text-neutral-400 w-[70px] min-w-[70px]"
              >Points</th
            >
            <th
              class="px-2 py-1.5 font-medium text-right text-neutral-400 w-[80px] min-w-[80px]"
              >Priority</th
            >
            <th
              class="px-2 py-1.5 font-medium text-right text-neutral-400 w-[100px] min-w-[100px]"
              title="Time since last comment">Last Comment</th
            >
            <th
              class="px-2 py-1.5 font-medium text-right text-neutral-400 w-[80px] min-w-[80px]"
              title="Total number of comments">Comments</th
            >
            <th
              class="px-2 py-1.5 font-medium text-right text-neutral-400 w-[70px] min-w-[70px]"
              >WIP Age</th
            >
          </tr>
        </thead>
        <tbody>
          {#each groupedData() as group}
            {#if groupBy !== "none"}
              <!-- Group header -->
              <tr>
                <td
                  colspan={showAssignee ? 9 : 8}
                  class="px-2 py-2.5 bg-white/5"
                >
                  <span class="text-xs font-semibold text-neutral-400">
                    {group.key} ({group.issues.reduce(
                      (count, gi) =>
                        count + ("parent" in gi ? 1 + gi.subissues.length : 1),
                      0
                    )})
                  </span>
                </td>
              </tr>
            {/if}
            {#each group.issues as groupedIssue}
              {#if "parent" in groupedIssue}
                {@const parent = groupedIssue.parent}
                {@const subissues = groupedIssue.subissues}
                {@const missingEstimate = checkMissingEstimate(parent)}
                {@const noRecentComment = checkNoRecentComment(parent)}
                {@const staleWIP = isStaleWIP(parent)}
                {@const commentRecency = getCommentRecency(
                  parent.last_comment_at
                )}
                <!-- Parent issue row -->
                <tr
                  class="border-b transition-colors cursor-pointer border-white/5 hover:bg-white/5"
                  onclick={() => {
                    if (parent.url && browser) {
                      window.open(parent.url, "_blank", "noopener,noreferrer");
                    }
                  }}
                  role="button"
                  tabindex="0"
                  onkeydown={(e) => {
                    if (
                      (e.key === "Enter" || e.key === " ") &&
                      parent.url &&
                      browser
                    ) {
                      e.preventDefault();
                      window.open(parent.url, "_blank", "noopener,noreferrer");
                    }
                  }}
                >
                  <td class="px-2 py-1.5">
                    <div class="flex gap-2 items-center">
                      <span class="font-mono text-neutral-500 shrink-0"
                        >{parent.identifier}</span
                      >
                      <span
                        class="text-neutral-200 truncate"
                        title={parent.title}>{parent.title}</span
                      >
                      {#if subissues.length > 0}
                        <span
                          class="text-xs text-neutral-500"
                          title="{subissues.length} subissue{subissues.length ===
                          1
                            ? ''
                            : 's'}">({subissues.length})</span
                        >
                      {/if}
                    </div>
                  </td>
                  {#if showAssignee}
                    <td
                      class="px-2 py-1.5 w-[120px] min-w-[120px] max-w-[120px]"
                    >
                      {#if parent.assignee_name}
                        <UserProfile
                          name={parent.assignee_name}
                          avatarUrl={parent.assignee_avatar_url}
                          size="xs"
                        />
                      {:else}
                        <span class="text-neutral-500 text-xs">Unassigned</span>
                      {/if}
                    </td>
                  {/if}
                  <td
                    class="px-2 py-1.5 text-neutral-400 truncate max-w-[100px]"
                  >
                    {parent.team_name}
                  </td>
                  <td class="px-2 py-1.5">
                    <StatusDisplay
                      stateName={parent.state_name || ""}
                      stateType={parent.state_type || ""}
                      showWarnings={!hideWarnings}
                      warnings={!parent.parent_id &&
                      hasSubissueStatusMismatch(
                        parent as Issue,
                        issues as Issue[]
                      )
                        ? [
                            {
                              type: "status-mismatch",
                              message:
                                "Parent issue is done but has incomplete subissues",
                            },
                          ]
                        : []}
                    />
                  </td>
                  <td class="px-2 py-1.5 text-right text-neutral-300">
                    <div class="flex gap-1 justify-end items-center">
                      {#if parent.estimate !== null && parent.estimate !== undefined}
                        {Math.round(parent.estimate)}
                      {:else if !hideWarnings}
                        <span class="text-amber-400" title="Missing estimate"
                          >⚠️</span
                        >
                      {:else}
                        <span class="text-neutral-500">—</span>
                      {/if}
                    </div>
                  </td>
                  <td class="px-2 py-1.5 text-right">
                    <div class="flex justify-end">
                      <PriorityDisplay priority={parent.priority || 0} />
                    </div>
                  </td>
                  <td class="px-2 py-1.5 text-right">
                    <div class="flex gap-1 justify-end items-center">
                      {#if !hideWarnings && noRecentComment}
                        <span
                          class="text-amber-400 shrink-0"
                          title="No comment since last business day">⚠️</span
                        >
                      {/if}
                      <span
                        class={!hideWarnings && noRecentComment
                          ? "text-amber-400"
                          : "text-neutral-300"}>{commentRecency}</span
                      >
                    </div>
                  </td>
                  <td class="px-2 py-1.5 text-right text-neutral-300">
                    {parent.comment_count !== null &&
                    parent.comment_count !== undefined
                      ? parent.comment_count
                      : "—"}
                  </td>
                  <td class="px-2 py-1.5 text-right">
                    <div class="flex gap-1 justify-end items-center">
                      {#if !hideWarnings && staleWIP}
                        <span
                          class="text-amber-400 shrink-0"
                          title="Over 14 days in WIP">⚠️</span
                        >
                      {/if}
                      <span
                        class={!hideWarnings && staleWIP
                          ? "text-amber-400"
                          : "text-neutral-300"}
                        >{formatIssueWIPAge(parent)}</span
                      >
                    </div>
                  </td>
                </tr>
                <!-- Subissue rows -->
                {#each subissues as subissue}
                  {@const subNoRecentComment = checkNoRecentComment(subissue)}
                  {@const subStaleWIP = isStaleWIP(subissue)}
                  {@const subCommentRecency = getCommentRecency(
                    subissue.last_comment_at
                  )}
                  <tr
                    class="border-b transition-colors cursor-pointer border-white/5 hover:bg-white/5"
                    onclick={() => {
                      if (subissue.url && browser) {
                        window.open(
                          subissue.url,
                          "_blank",
                          "noopener,noreferrer"
                        );
                      }
                    }}
                    role="button"
                    tabindex="0"
                    onkeydown={(e) => {
                      if (
                        (e.key === "Enter" || e.key === " ") &&
                        subissue.url &&
                        browser
                      ) {
                        e.preventDefault();
                        window.open(
                          subissue.url,
                          "_blank",
                          "noopener,noreferrer"
                        );
                      }
                    }}
                  >
                    <td class="px-2 py-1.5">
                      <div class="flex gap-2 items-center pl-6">
                        <span class="text-neutral-400 shrink-0">↳</span>
                        <span class="font-mono text-neutral-500 shrink-0"
                          >{subissue.identifier}</span
                        >
                        <span
                          class="text-neutral-200 truncate"
                          title={subissue.title}>{subissue.title}</span
                        >
                      </div>
                    </td>
                    {#if showAssignee}
                      <td
                        class="px-2 py-1.5 w-[120px] min-w-[120px] max-w-[120px]"
                      >
                        {#if subissue.assignee_name}
                          <UserProfile
                            name={subissue.assignee_name}
                            avatarUrl={subissue.assignee_avatar_url}
                            size="xs"
                          />
                        {:else}
                          <span class="text-neutral-500 text-xs"
                            >Unassigned</span
                          >
                        {/if}
                      </td>
                    {/if}
                    <td
                      class="px-2 py-1.5 text-neutral-400 truncate max-w-[100px]"
                    >
                      {subissue.team_name}
                    </td>
                    <td class="px-2 py-1.5">
                      <StatusDisplay
                        stateName={subissue.state_name || ""}
                        stateType={subissue.state_type || ""}
                        showWarnings={!hideWarnings}
                        warnings={[]}
                      />
                    </td>
                    <td class="px-2 py-1.5 text-right text-neutral-300">
                      <div class="flex gap-1 justify-end items-center">
                        {#if subissue.estimate !== null && subissue.estimate !== undefined}
                          {Math.round(subissue.estimate)}
                        {:else if !hideWarnings}
                          <span class="text-amber-400" title="Missing estimate"
                            >⚠️</span
                          >
                        {:else}
                          <span class="text-neutral-500">—</span>
                        {/if}
                      </div>
                    </td>
                    <td class="px-2 py-1.5 text-right">
                      <div class="flex justify-end">
                        <PriorityDisplay priority={subissue.priority || 0} />
                      </div>
                    </td>
                    <td class="px-2 py-1.5 text-right">
                      <div class="flex gap-1 justify-end items-center">
                        {#if !hideWarnings && subNoRecentComment}
                          <span
                            class="text-amber-400 shrink-0"
                            title="No comment since last business day">⚠️</span
                          >
                        {/if}
                        <span
                          class={!hideWarnings && subNoRecentComment
                            ? "text-amber-400"
                            : "text-neutral-300"}>{subCommentRecency}</span
                        >
                      </div>
                    </td>
                    <td class="px-2 py-1.5 text-right text-neutral-300">
                      {subissue.comment_count !== null &&
                      subissue.comment_count !== undefined
                        ? subissue.comment_count
                        : "—"}
                    </td>
                    <td class="px-2 py-1.5 text-right">
                      <div class="flex gap-1 justify-end items-center">
                        {#if !hideWarnings && subStaleWIP}
                          <span
                            class="text-amber-400 shrink-0"
                            title="Over 14 days in WIP">⚠️</span
                          >
                        {/if}
                        <span
                          class={!hideWarnings && subStaleWIP
                            ? "text-amber-400"
                            : "text-neutral-300"}
                          >{formatIssueWIPAge(subissue)}</span
                        >
                      </div>
                    </td>
                  </tr>
                {/each}
              {:else}
                {@const issue = groupedIssue}
                {@const missingEstimate = checkMissingEstimate(issue)}
                {@const noRecentComment = checkNoRecentComment(issue)}
                {@const staleWIP = isStaleWIP(issue)}
                {@const commentRecency = getCommentRecency(
                  issue.last_comment_at
                )}
                <tr
                  class="border-b transition-colors cursor-pointer border-white/5 hover:bg-white/5"
                  onclick={() => {
                    if (issue.url && browser) {
                      window.open(issue.url, "_blank", "noopener,noreferrer");
                    }
                  }}
                  role="button"
                  tabindex="0"
                  onkeydown={(e) => {
                    if (
                      (e.key === "Enter" || e.key === " ") &&
                      issue.url &&
                      browser
                    ) {
                      e.preventDefault();
                      window.open(issue.url, "_blank", "noopener,noreferrer");
                    }
                  }}
                >
                  <td class="px-2 py-1.5">
                    <div class="flex gap-2 items-center">
                      <span class="font-mono text-neutral-500 shrink-0"
                        >{issue.identifier}</span
                      >
                      <span
                        class="text-neutral-200 truncate"
                        title={issue.title}>{issue.title}</span
                      >
                    </div>
                  </td>
                  {#if showAssignee}
                    <td
                      class="px-2 py-1.5 w-[120px] min-w-[120px] max-w-[120px]"
                    >
                      {#if issue.assignee_name}
                        <UserProfile
                          name={issue.assignee_name}
                          avatarUrl={issue.assignee_avatar_url}
                          size="xs"
                        />
                      {:else}
                        <span class="text-neutral-500 text-xs">Unassigned</span>
                      {/if}
                    </td>
                  {/if}
                  <td
                    class="px-2 py-1.5 text-neutral-400 truncate max-w-[100px]"
                  >
                    {issue.team_name}
                  </td>
                  <td class="px-2 py-1.5">
                    <StatusDisplay
                      stateName={issue.state_name || ""}
                      stateType={issue.state_type || ""}
                      showWarnings={!hideWarnings}
                      warnings={!issue.parent_id &&
                      hasSubissueStatusMismatch(
                        issue as Issue,
                        issues as Issue[]
                      )
                        ? [
                            {
                              type: "status-mismatch",
                              message:
                                "Parent issue is done but has incomplete subissues",
                            },
                          ]
                        : []}
                    />
                  </td>
                  <td class="px-2 py-1.5 text-right text-neutral-300">
                    <div class="flex gap-1 justify-end items-center">
                      {#if issue.estimate !== null && issue.estimate !== undefined}
                        {Math.round(issue.estimate)}
                      {:else if !hideWarnings}
                        <span class="text-amber-400" title="Missing estimate"
                          >⚠️</span
                        >
                      {:else}
                        <span class="text-neutral-500">—</span>
                      {/if}
                    </div>
                  </td>
                  <td class="px-2 py-1.5 text-right">
                    <div class="flex justify-end">
                      <PriorityDisplay priority={issue.priority || 0} />
                    </div>
                  </td>
                  <td class="px-2 py-1.5 text-right">
                    <div class="flex gap-1 justify-end items-center">
                      {#if !hideWarnings && noRecentComment}
                        <span
                          class="text-amber-400 shrink-0"
                          title="No comment since last business day">⚠️</span
                        >
                      {/if}
                      <span
                        class={!hideWarnings && noRecentComment
                          ? "text-amber-400"
                          : "text-neutral-300"}>{commentRecency}</span
                      >
                    </div>
                  </td>
                  <td class="px-2 py-1.5 text-right text-neutral-300">
                    {issue.comment_count !== null &&
                    issue.comment_count !== undefined
                      ? issue.comment_count
                      : "—"}
                  </td>
                  <td class="px-2 py-1.5 text-right">
                    <div class="flex gap-1 justify-end items-center">
                      {#if !hideWarnings && staleWIP}
                        <span
                          class="text-amber-400 shrink-0"
                          title="Over 14 days in WIP">⚠️</span
                        >
                      {/if}
                      <span
                        class={!hideWarnings && staleWIP
                          ? "text-amber-400"
                          : "text-neutral-300"}>{formatIssueWIPAge(issue)}</span
                      >
                    </div>
                  </td>
                </tr>
              {/if}
            {/each}
          {/each}
        </tbody>
      </table>
    </div>
  </div>
{/if}

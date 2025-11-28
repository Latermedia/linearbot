<script lang="ts">
  import { browser } from "$app/environment";
  import {
    formatCommentRecency,
    calculateWIPAge,
    formatWIPAge,
  } from "$lib/utils/project-helpers";
  import {
    hasMissingEstimate,
    hasMissingPriority,
    hasNoRecentComment,
  } from "../../utils/issue-validators";
  import UserProfile from "./UserProfile.svelte";

  interface IssueData {
    id: string;
    identifier: string;
    title: string;
    estimate: number | null;
    priority: number;
    last_comment_at: string | null;
    started_at: string | null;
    url: string;
    team_name: string;
    project_name: string | null;
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
    if (shouldSuppressAlerts(issue)) return false;
    return !issue.priority || issue.priority === 0;
  }

  function checkNoRecentComment(issue: IssueData): boolean {
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
</script>

{#if issues.length === 0}
  <div class="text-sm text-neutral-400">No issues found</div>
{:else}
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
            class="px-2 py-1.5 font-medium text-right text-neutral-400 w-[70px] min-w-[70px]"
            >Points</th
          >
          <th
            class="px-2 py-1.5 font-medium text-right text-neutral-400 w-[70px] min-w-[70px]"
            >Priority</th
          >
          <th
            class="px-2 py-1.5 font-medium text-right text-neutral-400 w-[100px] min-w-[100px]"
            title="Time since last comment">Last Comment</th
          >
          <th
            class="px-2 py-1.5 font-medium text-right text-neutral-400 w-[70px] min-w-[70px]"
            >WIP Age</th
          >
        </tr>
      </thead>
      <tbody>
        {#each issues as issue}
          {@const missingEstimate = checkMissingEstimate(issue)}
          {@const missingPriority = checkMissingPriority(issue)}
          {@const noRecentComment = checkNoRecentComment(issue)}
          {@const staleWIP = isStaleWIP(issue)}
          {@const commentRecency = getCommentRecency(issue.last_comment_at)}
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
                <span class="text-neutral-200 truncate" title={issue.title}
                  >{issue.title}</span
                >
              </div>
            </td>
            {#if showAssignee}
              <td class="px-2 py-1.5 w-[120px] min-w-[120px] max-w-[120px]">
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
            <td class="px-2 py-1.5 text-neutral-400 truncate max-w-[100px]">
              {issue.team_name}
            </td>
            <td class="px-2 py-1.5 text-right text-neutral-300">
              <div class="flex gap-1 justify-end items-center">
                {#if issue.estimate !== null && issue.estimate !== undefined}
                  {Math.round(issue.estimate)}
                {:else if !hideWarnings}
                  <span class="text-amber-400" title="Missing estimate">⚠️</span
                  >
                {:else}
                  <span class="text-neutral-500">—</span>
                {/if}
              </div>
            </td>
            <td class="px-2 py-1.5 text-right text-neutral-300">
              <div class="flex gap-1 justify-end items-center">
                {#if issue.priority && issue.priority > 0}
                  {issue.priority}
                {:else if !hideWarnings}
                  <span class="text-amber-400" title="Missing priority">⚠️</span
                  >
                {:else}
                  <span class="text-neutral-500">—</span>
                {/if}
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
        {/each}
      </tbody>
    </table>
  </div>
{/if}

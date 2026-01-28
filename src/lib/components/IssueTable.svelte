<script lang="ts">
  import { browser } from "$app/environment";
  import {
    groupIssuesByParent,
    type GroupedIssue,
    groupIssuesBy,
    type GroupByOption,
  } from "$lib/utils/project-helpers";
  import { hasSubissueStatusMismatch } from "../../utils/issue-validators";
  import {
    calculateWIPAge,
    formatWIPAge,
    calculateIssueAccuracyRatio,
    formatAccuracyRatio,
    getAccuracyColorClass,
    formatCommentRecency,
  } from "$lib/utils/project-helpers";
  import {
    hasNoRecentComment,
    hasMissingEstimate,
  } from "../../utils/issue-validators";
  import {
    calculateBugAgeDays,
    formatBugAge,
    getBugAgeColorClass,
    getWIPAgeColorClass,
  } from "$lib/utils/status-colors";
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
    created_at: string;
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
    showTeam = true,
    showIdentifier = false,
    showEstimateAccuracy = false,
    showBugAge = false,
    daysPerStoryPoint = null,
    groupByState = false,
    hideWarnings = false,
    noMaxHeight = false,
  }: {
    issues: IssueData[];
    showAssignee?: boolean;
    showTeam?: boolean;
    showIdentifier?: boolean;
    showEstimateAccuracy?: boolean;
    showBugAge?: boolean;
    daysPerStoryPoint?: number | null;
    groupByState?: boolean;
    hideWarnings?: boolean;
    noMaxHeight?: boolean;
  } = $props();

  let groupBy: GroupByOption = $state("none");

  function _formatIssueWIPAge(issue: IssueData): string {
    if (!issue.started_at) return "—";
    const started = new Date(issue.started_at);
    const now = new Date();
    const diffDays =
      (now.getTime() - started.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays < 1) return "< 1d";
    return `${Math.round(diffDays)}d`;
  }

  function _isStaleWIP(issue: IssueData): boolean {
    if (shouldSuppressAlerts(issue)) return false;
    if (!issue.started_at) return false;
    const started = new Date(issue.started_at);
    const now = new Date();
    const diffDays =
      (now.getTime() - started.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays >= 14; // WIP_AGE_THRESHOLDS.WIP_AGE_DAYS
  }

  function _checkMissingEstimate(issue: IssueData): boolean {
    // Exclude subissues from estimate warnings (estimates are optional for sub-issues)
    if (issue.parent_id) return false;
    if (shouldSuppressAlerts(issue)) return false;
    return issue.estimate === null || issue.estimate === undefined;
  }

  function _checkMissingPriority(issue: IssueData): boolean {
    // Exclude subissues from priority warnings
    if (issue.parent_id) return false;
    if (shouldSuppressAlerts(issue)) return false;
    return !issue.priority || issue.priority === 0;
  }

  function _checkNoRecentComment(issue: IssueData): boolean {
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

  function _getCommentRecency(lastCommentAt: string | null): string {
    if (!lastCommentAt) return "—";
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

  function formatCommentCount(count: number | null | undefined): string {
    if (count === null || count === undefined || count === 0) {
      return "—";
    }
    return String(count);
  }

  // Prepare grouped data
  const groupedData = $derived(() => {
    const issuesAsIssues = issues as Issue[];

    // State-based grouping (like ProjectDetailModal)
    if (groupByState) {
      const issuesByState = new Map<string, Issue[]>();
      for (const issue of issuesAsIssues) {
        const stateName = issue.state_name || "Unknown";
        if (!issuesByState.has(stateName)) {
          issuesByState.set(stateName, []);
        }
        issuesByState.get(stateName)!.push(issue);
      }

      // Sort by Linear's state_type: started, unstarted, triage, backlog, completed, canceled
      const stateTypeOrder: Record<string, number> = {
        started: 1,
        unstarted: 2,
        triage: 3,
        backlog: 4,
        completed: 5,
        canceled: 6,
      };

      const sortedStates = Array.from(issuesByState.entries()).sort((a, b) => {
        // Get state_type from first issue in each group
        const aStateType = a[1][0]?.state_type || "";
        const bStateType = b[1][0]?.state_type || "";
        const aPriority = stateTypeOrder[aStateType] ?? 99;
        const bPriority = stateTypeOrder[bStateType] ?? 99;
        if (aPriority !== bPriority) return aPriority - bPriority;
        return a[0].localeCompare(b[0]);
      });

      return sortedStates.map(([state, stateIssues]) => ({
        key: state,
        issues: groupIssuesByParent(stateIssues),
      }));
    }

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
  <div class="text-sm text-black-600 dark:text-black-400">No issues found</div>
{:else}
  {@const columnCount =
    (showAssignee ? 1 : 0) +
    (showTeam ? 1 : 0) +
    (showEstimateAccuracy ? 1 : 0) +
    (showBugAge ? 1 : 0) +
    6}
  <div class="space-y-2">
    <!-- Group by selector (hidden when groupByState is true) -->
    {#if !groupByState}
      <div class="flex justify-end items-center gap-2">
        <label
          for="group-by-select"
          class="text-xs text-black-600 dark:text-black-400">Group by:</label
        >
        <select
          id="group-by-select"
          bind:value={groupBy}
          class="px-2 py-1 text-xs text-black-900 dark:text-white rounded border transition-colors duration-150 bg-ambient-300 dark:bg-black-900 border-black-200 dark:border-white/10 focus:border-brand-500 focus:ring-1 focus:ring-brand-500/50 focus:outline-none"
        >
          <option value="none">None</option>
          <option value="assignee">Assignee</option>
          <option value="status">Status</option>
          <option value="priority">Priority</option>
        </select>
      </div>
    {/if}
    <div
      class="overflow-x-auto {noMaxHeight
        ? ''
        : 'max-h-[70vh] overflow-y-auto'}"
    >
      <table class="w-full text-xs min-w-[680px]">
        <thead class="sticky top-0 z-10 bg-ambient-300 dark:bg-black-900">
          <tr class="border-b border-black-200 dark:border-white/10">
            <th
              class="px-2 py-1.5 font-medium text-left text-black-600 dark:text-black-400 w-[310px] min-w-[310px]"
              >Title</th
            >
            <th
              class="px-2 py-1.5 font-medium text-left text-black-600 dark:text-black-400 w-[120px] min-w-[120px]"
              >Status</th
            >
            {#if showAssignee}
              <th
                class="px-2 py-1.5 font-medium text-left text-black-600 dark:text-black-400 w-[120px] min-w-[120px]"
                >Assignee</th
              >
            {/if}
            {#if showBugAge}
              <th
                class="px-2 py-1.5 font-medium text-right text-black-600 dark:text-black-400 w-[70px] min-w-[70px]"
                title="Days since bug was created">Bug Age</th
              >
            {/if}
            <th
              class="px-2 py-1.5 font-medium text-right text-black-600 dark:text-black-400 w-[80px] min-w-[80px]"
              >Priority</th
            >
            <th
              class="px-2 py-1.5 font-medium text-right text-black-600 dark:text-black-400 w-[70px] min-w-[70px]"
              >Points</th
            >
            <th
              class="px-2 py-1.5 font-medium text-right text-black-600 dark:text-black-400 w-[80px] min-w-[80px]"
              title="Total number of comments">Comments</th
            >
            <th
              class="px-2 py-1.5 font-medium text-right text-black-600 dark:text-black-400 w-[110px] min-w-[110px]"
              title="Time since last comment">Last Comment</th
            >
            <th
              class="px-2 py-1.5 font-medium text-right text-black-600 dark:text-black-400 w-[70px] min-w-[70px]"
              title="Days in progress">WIP Age</th
            >
            {#if showEstimateAccuracy}
              <th
                class="px-2 py-1.5 font-medium text-right text-black-600 dark:text-black-400 w-[120px] min-w-[120px]"
                title="Ratio of actual time to estimated time. 1.0x = perfect match. < 1.0x = faster than estimated, > 1.0x = slower than estimated. Green = within 30%, Yellow = 30-70% off, Red = 70%+ off."
                >Estimate Accuracy</th
              >
            {/if}
          </tr>
        </thead>
        <tbody>
          {#each groupedData() as group}
            {#if groupByState || groupBy !== "none"}
              <!-- Group header (State divider or other grouping) -->
              <tr>
                <td colspan={columnCount} class="px-2 py-2.5">
                  <span
                    class="-ml-1 text-xs font-semibold text-black-600 dark:text-black-400"
                  >
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
                {@const isCompleted = (() => {
                  const stateName = parent.state_name?.toLowerCase() || "";
                  return (
                    stateName.includes("done") ||
                    stateName.includes("completed")
                  );
                })()}
                {@const wipAge = calculateWIPAge(parent, isCompleted)}
                {@const issueAccuracyRatio =
                  showEstimateAccuracy &&
                  daysPerStoryPoint !== null &&
                  isCompleted
                    ? calculateIssueAccuracyRatio(parent, daysPerStoryPoint)
                    : null}
                {@const commentRecency = formatCommentRecency(
                  parent.last_comment_at
                )}
                {@const hasOldComment = hasNoRecentComment(parent)}
                {@const missingEstimate = hasMissingEstimate(parent)}
                {@const hasStatusMismatch = hasSubissueStatusMismatch(
                  parent,
                  issues as Issue[]
                )}
                <!-- Parent issue row -->
                <tr
                  class="border-b transition-colors cursor-pointer border-black-100 dark:border-white/5 hover:bg-ambient-600 dark:hover:bg-white/5 focus:outline-none"
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
                  <!-- Title -->
                  <td
                    class="px-2 py-1.5 text-black-800 dark:text-black-200 w-[310px] min-w-[310px] max-w-[310px]"
                  >
                    <div
                      class="overflow-hidden truncate whitespace-nowrap text-ellipsis"
                      title={parent.title}
                    >
                      {#if showIdentifier && parent.identifier}
                        <span
                          class="text-black-600 dark:text-black-500 font-mono text-xs mr-1.5"
                          >{parent.identifier}</span
                        >
                      {/if}
                      {parent.title}
                      {#if subissues.length > 0}
                        <span
                          class="ml-1 text-xs text-black-600 dark:text-black-500"
                          >({subissues.length})</span
                        >
                      {/if}
                    </div>
                  </td>
                  <!-- Status -->
                  <td class="px-2 py-1.5">
                    <StatusDisplay
                      stateName={parent.state_name || ""}
                      stateType={parent.state_type || ""}
                      showWarnings={!hideWarnings}
                      warnings={hasStatusMismatch
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
                  <!-- Assignee -->
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
                        <span class="text-xs text-black-600 dark:text-black-500"
                          >—</span
                        >
                      {/if}
                    </td>
                  {/if}
                  <!-- Bug Age -->
                  {#if showBugAge}
                    {@const bugAgeDays = calculateBugAgeDays(parent.created_at)}
                    <td
                      class="px-2 py-1.5 text-right w-[70px] min-w-[70px] {getBugAgeColorClass(
                        bugAgeDays
                      )}"
                    >
                      {formatBugAge(bugAgeDays)}
                    </td>
                  {/if}
                  <!-- Priority -->
                  <td class="px-2 py-1.5 text-right w-[80px] min-w-[80px]">
                    <div class="flex justify-end">
                      <PriorityDisplay priority={parent.priority || 0} />
                    </div>
                  </td>
                  <!-- Points -->
                  <td
                    class="px-2 py-1.5 text-right text-black-700 dark:text-black-300 w-[70px] min-w-[70px]"
                  >
                    <div class="flex gap-1.5 justify-end items-center">
                      {#if parent.estimate !== null && parent.estimate !== undefined}
                        {Math.round(parent.estimate)}
                      {:else if !hideWarnings && missingEstimate}
                        <span class="text-warning-400" title="Missing estimate"
                          >⚠️</span
                        >
                      {:else}
                        <span class="text-black-600 dark:text-black-500">—</span
                        >
                      {/if}
                    </div>
                  </td>
                  <!-- Comments -->
                  <td
                    class="px-2 py-1.5 text-right text-black-700 dark:text-black-300 w-[80px] min-w-[80px]"
                  >
                    {formatCommentCount(parent.comment_count)}
                  </td>
                  <!-- Last Comment -->
                  <td class="px-2 py-1.5 text-right w-[110px] min-w-[110px]">
                    <div class="flex gap-1.5 justify-end items-center">
                      {#if !hideWarnings && hasOldComment}
                        <span
                          class="text-warning-400 shrink-0"
                          title="No comment since last business day">⚠️</span
                        >
                      {/if}
                      <span
                        class={!hideWarnings && hasOldComment
                          ? "text-warning-400"
                          : "text-black-700 dark:text-black-300"}
                        >{commentRecency}</span
                      >
                    </div>
                  </td>
                  <!-- WIP Age -->
                  <td
                    class="px-2 py-1.5 text-right w-[70px] min-w-[70px] {getWIPAgeColorClass(
                      wipAge
                    )}"
                  >
                    {formatWIPAge(wipAge)}
                  </td>
                  {#if showEstimateAccuracy}
                    <td class="px-2 py-1.5 text-right w-[120px] min-w-[120px]">
                      {#if issueAccuracyRatio !== null}
                        <span
                          class={getAccuracyColorClass(issueAccuracyRatio)}
                          title={issueAccuracyRatio === 1.0
                            ? "Perfect match! Actual time equals estimated time (1.0x)"
                            : issueAccuracyRatio >= 1.0
                              ? `Took ${((issueAccuracyRatio - 1) * 100).toFixed(0)}% longer than estimated (goal: 1.0x)`
                              : `Completed ${((1 - issueAccuracyRatio) * 100).toFixed(0)}% faster than estimated (goal: 1.0x)`}
                        >
                          {formatAccuracyRatio(issueAccuracyRatio)}
                        </span>
                      {:else}
                        <span class="text-black-600 dark:text-black-500">—</span
                        >
                      {/if}
                    </td>
                  {/if}
                </tr>
                <!-- Subissue rows -->
                {#each subissues as subissue}
                  {@const subIsCompleted = (() => {
                    const stateName = subissue.state_name?.toLowerCase() || "";
                    return (
                      stateName.includes("done") ||
                      stateName.includes("completed")
                    );
                  })()}
                  {@const subWipAge = calculateWIPAge(subissue, subIsCompleted)}
                  {@const subIssueAccuracyRatio =
                    showEstimateAccuracy &&
                    daysPerStoryPoint !== null &&
                    subIsCompleted
                      ? calculateIssueAccuracyRatio(subissue, daysPerStoryPoint)
                      : null}
                  {@const subCommentRecency = formatCommentRecency(
                    subissue.last_comment_at
                  )}
                  {@const subHasOldComment = hasNoRecentComment(subissue)}
                  {@const subMissingEstimate = hasMissingEstimate(subissue)}
                  <tr
                    class="border-b transition-colors cursor-pointer border-black-100 dark:border-white/5 hover:bg-ambient-600 dark:hover:bg-white/5 focus:outline-none"
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
                    <!-- Title -->
                    <td
                      class="px-2 py-1.5 text-black-800 dark:text-black-200 w-[310px] min-w-[310px] max-w-[310px]"
                    >
                      <div
                        class="overflow-hidden pl-6 truncate whitespace-nowrap text-ellipsis"
                        title={subissue.title}
                      >
                        <span class="mr-1 text-black-400 shrink-0">↳</span>
                        {#if showIdentifier && subissue.identifier}
                          <span
                            class="text-black-600 dark:text-black-500 font-mono text-xs mr-1.5"
                            >{subissue.identifier}</span
                          >
                        {/if}
                        {subissue.title}
                      </div>
                    </td>
                    <!-- Status -->
                    <td class="px-2 py-1.5">
                      <StatusDisplay
                        stateName={subissue.state_name || ""}
                        stateType={subissue.state_type || ""}
                        showWarnings={!hideWarnings}
                        warnings={[]}
                      />
                    </td>
                    <!-- Assignee -->
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
                          <span
                            class="text-xs text-black-600 dark:text-black-500"
                            >—</span
                          >
                        {/if}
                      </td>
                    {/if}
                    <!-- Bug Age -->
                    {#if showBugAge}
                      {@const subBugAgeDays = calculateBugAgeDays(
                        subissue.created_at
                      )}
                      <td
                        class="px-2 py-1.5 text-right w-[70px] min-w-[70px] {getBugAgeColorClass(
                          subBugAgeDays
                        )}"
                      >
                        {formatBugAge(subBugAgeDays)}
                      </td>
                    {/if}
                    <!-- Priority -->
                    <td class="px-2 py-1.5 text-right w-[80px] min-w-[80px]">
                      <div class="flex justify-end">
                        <PriorityDisplay priority={subissue.priority || 0} />
                      </div>
                    </td>
                    <!-- Points -->
                    <td
                      class="px-2 py-1.5 text-right text-black-700 dark:text-black-300 w-[70px] min-w-[70px]"
                    >
                      <div class="flex gap-1.5 justify-end items-center">
                        {#if subissue.estimate !== null && subissue.estimate !== undefined}
                          {Math.round(subissue.estimate)}
                        {:else if !hideWarnings && subMissingEstimate}
                          <span
                            class="text-warning-400"
                            title="Missing estimate">⚠️</span
                          >
                        {:else}
                          <span class="text-black-600 dark:text-black-500"
                            >—</span
                          >
                        {/if}
                      </div>
                    </td>
                    <!-- Comments -->
                    <td
                      class="px-2 py-1.5 text-right text-black-700 dark:text-black-300 w-[80px] min-w-[80px]"
                    >
                      {formatCommentCount(subissue.comment_count)}
                    </td>
                    <!-- Last Comment -->
                    <td class="px-2 py-1.5 text-right w-[110px] min-w-[110px]">
                      <div class="flex gap-1.5 justify-end items-center">
                        {#if !hideWarnings && subHasOldComment}
                          <span
                            class="text-warning-400 shrink-0"
                            title="No comment since last business day">⚠️</span
                          >
                        {/if}
                        <span
                          class={!hideWarnings && subHasOldComment
                            ? "text-warning-400"
                            : "text-black-700 dark:text-black-300"}
                          >{subCommentRecency}</span
                        >
                      </div>
                    </td>
                    <!-- WIP Age -->
                    <td
                      class="px-2 py-1.5 text-right w-[70px] min-w-[70px] {getWIPAgeColorClass(
                        subWipAge
                      )}"
                    >
                      {formatWIPAge(subWipAge)}
                    </td>
                    {#if showEstimateAccuracy}
                      <td
                        class="px-2 py-1.5 text-right w-[120px] min-w-[120px]"
                      >
                        {#if subIssueAccuracyRatio !== null}
                          <span
                            class={getAccuracyColorClass(subIssueAccuracyRatio)}
                            title={subIssueAccuracyRatio === 1.0
                              ? "Perfect match! Actual time equals estimated time (1.0x)"
                              : subIssueAccuracyRatio >= 1.0
                                ? `Took ${((subIssueAccuracyRatio - 1) * 100).toFixed(0)}% longer than estimated (goal: 1.0x)`
                                : `Completed ${((1 - subIssueAccuracyRatio) * 100).toFixed(0)}% faster than estimated (goal: 1.0x)`}
                          >
                            {formatAccuracyRatio(subIssueAccuracyRatio)}
                          </span>
                        {:else}
                          <span class="text-black-600 dark:text-black-500"
                            >—</span
                          >
                        {/if}
                      </td>
                    {/if}
                  </tr>
                {/each}
              {:else}
                {@const issue = groupedIssue}
                {@const isCompleted = (() => {
                  const stateName = issue.state_name?.toLowerCase() || "";
                  return (
                    stateName.includes("done") ||
                    stateName.includes("completed")
                  );
                })()}
                {@const wipAge = calculateWIPAge(issue, isCompleted)}
                {@const issueAccuracyRatio =
                  showEstimateAccuracy &&
                  daysPerStoryPoint !== null &&
                  isCompleted
                    ? calculateIssueAccuracyRatio(issue, daysPerStoryPoint)
                    : null}
                {@const commentRecency = formatCommentRecency(
                  issue.last_comment_at
                )}
                {@const hasOldComment = hasNoRecentComment(issue)}
                {@const missingEstimate = hasMissingEstimate(issue)}
                <tr
                  class="border-b transition-colors cursor-pointer border-black-100 dark:border-white/5 hover:bg-ambient-600 dark:hover:bg-white/5 focus:outline-none"
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
                  <!-- Title -->
                  <td
                    class="px-2 py-1.5 text-black-800 dark:text-black-200 w-[310px] min-w-[310px] max-w-[310px]"
                  >
                    <div
                      class="overflow-hidden truncate whitespace-nowrap text-ellipsis"
                      title={issue.title}
                    >
                      {#if showIdentifier && issue.identifier}
                        <span
                          class="text-black-600 dark:text-black-500 font-mono text-xs mr-1.5"
                          >{issue.identifier}</span
                        >
                      {/if}
                      {issue.title}
                    </div>
                  </td>
                  <!-- Status -->
                  <td class="px-2 py-1.5">
                    <StatusDisplay
                      stateName={issue.state_name || ""}
                      stateType={issue.state_type || ""}
                      showWarnings={!hideWarnings}
                      warnings={[]}
                    />
                  </td>
                  <!-- Assignee -->
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
                        <span class="text-xs text-black-600 dark:text-black-500"
                          >—</span
                        >
                      {/if}
                    </td>
                  {/if}
                  <!-- Bug Age -->
                  {#if showBugAge}
                    {@const bugAgeDays = calculateBugAgeDays(issue.created_at)}
                    <td
                      class="px-2 py-1.5 text-right w-[70px] min-w-[70px] {getBugAgeColorClass(
                        bugAgeDays
                      )}"
                    >
                      {formatBugAge(bugAgeDays)}
                    </td>
                  {/if}
                  <!-- Priority -->
                  <td class="px-2 py-1.5 text-right w-[80px] min-w-[80px]">
                    <div class="flex justify-end">
                      <PriorityDisplay priority={issue.priority || 0} />
                    </div>
                  </td>
                  <!-- Points -->
                  <td
                    class="px-2 py-1.5 text-right text-black-700 dark:text-black-300 w-[70px] min-w-[70px]"
                  >
                    <div class="flex gap-1.5 justify-end items-center">
                      {#if issue.estimate !== null && issue.estimate !== undefined}
                        {Math.round(issue.estimate)}
                      {:else if !hideWarnings && missingEstimate}
                        <span class="text-warning-400" title="Missing estimate"
                          >⚠️</span
                        >
                      {:else}
                        <span class="text-black-600 dark:text-black-500">—</span
                        >
                      {/if}
                    </div>
                  </td>
                  <!-- Comments -->
                  <td
                    class="px-2 py-1.5 text-right text-black-700 dark:text-black-300 w-[80px] min-w-[80px]"
                  >
                    {formatCommentCount(issue.comment_count)}
                  </td>
                  <!-- Last Comment -->
                  <td class="px-2 py-1.5 text-right w-[110px] min-w-[110px]">
                    <div class="flex gap-1.5 justify-end items-center">
                      {#if !hideWarnings && hasOldComment}
                        <span
                          class="text-warning-400 shrink-0"
                          title="No comment since last business day">⚠️</span
                        >
                      {/if}
                      <span
                        class={!hideWarnings && hasOldComment
                          ? "text-warning-400"
                          : "text-black-700 dark:text-black-300"}
                        >{commentRecency}</span
                      >
                    </div>
                  </td>
                  <!-- WIP Age -->
                  <td
                    class="px-2 py-1.5 text-right w-[70px] min-w-[70px] {getWIPAgeColorClass(
                      wipAge
                    )}"
                  >
                    {formatWIPAge(wipAge)}
                  </td>
                  {#if showEstimateAccuracy}
                    <td class="px-2 py-1.5 text-right w-[120px] min-w-[120px]">
                      {#if issueAccuracyRatio !== null}
                        <span
                          class={getAccuracyColorClass(issueAccuracyRatio)}
                          title={issueAccuracyRatio === 1.0
                            ? "Perfect match! Actual time equals estimated time (1.0x)"
                            : issueAccuracyRatio >= 1.0
                              ? `Took ${((issueAccuracyRatio - 1) * 100).toFixed(0)}% longer than estimated (goal: 1.0x)`
                              : `Completed ${((1 - issueAccuracyRatio) * 100).toFixed(0)}% faster than estimated (goal: 1.0x)`}
                        >
                          {formatAccuracyRatio(issueAccuracyRatio)}
                        </span>
                      {:else}
                        <span class="text-black-600 dark:text-black-500">—</span
                        >
                      {/if}
                    </td>
                  {/if}
                </tr>
              {/if}
            {/each}
          {/each}
        </tbody>
      </table>
    </div>
  </div>
{/if}

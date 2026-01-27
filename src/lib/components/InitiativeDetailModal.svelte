<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import { marked } from "marked";
  import Badge from "./Badge.svelte";
  import UserProfile from "./UserProfile.svelte";
  import Modal from "./Modal.svelte";
  import ProjectsListTable from "./ProjectsListTable.svelte";
  import {
    formatDateFull,
    formatRelativeDate,
    getHealthDisplay,
  } from "$lib/utils/project-helpers";
  import type { ProjectSummary } from "$lib/project-data";
  import type { ProjectUpdate } from "../../linear/client";

  interface InitiativeData {
    id: string;
    name: string;
    description: string | null;
    content: string | null;
    status: string | null;
    target_date: string | null;
    completed_at: string | null;
    started_at: string | null;
    archived_at: string | null;
    health: string | null;
    health_updated_at: string | null;
    health_updates: string | null;
    owner_id: string | null;
    owner_name: string | null;
    creator_id: string | null;
    creator_name: string | null;
    project_ids: string | null;
    created_at: string;
    updated_at: string;
  }

  let {
    initiative,
    onclose,
  }: {
    initiative: InitiativeData;
    onclose: () => void;
  } = $props();

  let initiativeUrl = $state<string | null>(null);
  let linkedProjects = $state<ProjectSummary[]>([]);
  let projectsLoading = $state(true);
  let showAllHealthUpdates = $state(false);

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

  async function fetchInitiativeUrl() {
    if (!browser) return;
    try {
      // Try to get workspace from an issue URL
      const response = await fetch("/api/issues/with-projects");
      if (response.ok) {
        const data = await response.json();
        const firstIssue = data.issues?.[0];
        if (firstIssue?.url) {
          const workspaceMatch = firstIssue.url.match(
            /https:\/\/linear\.app\/([^/]+)/
          );
          if (workspaceMatch) {
            const workspace = workspaceMatch[1];
            initiativeUrl = `https://linear.app/${workspace}/initiative/${initiative.id}`;
          }
        }
      }
    } catch (_error) {
      // Silently fail - link just won't be available
    }
  }

  async function fetchLinkedProjects() {
    if (!browser) return;
    try {
      projectsLoading = true;
      const projectIds = parseProjectIds(initiative.project_ids);
      if (projectIds.length === 0) {
        linkedProjects = [];
        projectsLoading = false;
        return;
      }

      const foundProjects: ProjectSummary[] = [];

      // Fetch projects from API
      const response = await fetch("/api/projects");
      if (response.ok) {
        const data = await response.json();
        const allProjects = data.projects || [];
        const projectMap = new Map(
          allProjects.map((p: any) => [p.project_id, p])
        );

        for (const projectId of projectIds) {
          const projectData = projectMap.get(projectId);
          if (projectData) {
            // Convert to ProjectSummary format
            foundProjects.push({
              projectId: projectData.project_id,
              projectName: projectData.project_name || projectData.project_id,
              completedIssues: projectData.completed_issues || 0,
              inProgressIssues: projectData.in_progress_issues || 0,
              totalIssues: projectData.total_issues || 0,
              engineerCount: projectData.engineer_count || 0,
              teams: new Set(
                projectData.teams ? JSON.parse(projectData.teams) : []
              ),
              startDate: projectData.start_date,
              targetDate: projectData.target_date,
              lastActivityDate: projectData.last_activity_date,
              projectStatus: projectData.project_status,
              projectStateCategory: projectData.project_state_category,
              projectHealth: projectData.project_health,
              hasViolations: projectData.has_violations === 1,
              hasStatusMismatch: projectData.has_status_mismatch === 1,
              isStaleUpdate: projectData.is_stale_update === 1,
              missingLead: projectData.missing_lead === 1,
              projectLeadName: projectData.project_lead_name,
              projectDescription: projectData.project_description,
              lastSyncedAt: projectData.last_synced_at,
            });
          }
        }
      }

      linkedProjects = foundProjects;
    } catch (error) {
      console.error("Failed to fetch linked projects:", error);
      linkedProjects = [];
    } finally {
      projectsLoading = false;
    }
  }

  const healthDisplay = $derived(getHealthBadgeDisplay(initiative.health));
  const projectIds = $derived(parseProjectIds(initiative.project_ids));

  function parseHealthUpdates(
    healthUpdatesJson: string | null
  ): ProjectUpdate[] {
    if (!healthUpdatesJson) return [];
    try {
      const updates = JSON.parse(healthUpdatesJson);
      return Array.isArray(updates) ? updates : [];
    } catch {
      return [];
    }
  }

  const healthUpdates = $derived(parseHealthUpdates(initiative.health_updates));

  // Render markdown content
  function renderMarkdown(markdown: string | null): string {
    if (!markdown) return "";
    try {
      return marked.parse(markdown, { breaks: true, gfm: true });
    } catch (error) {
      console.error("Failed to parse markdown:", error);
      return markdown; // Return raw text if parsing fails
    }
  }

  const renderedContent = $derived(renderMarkdown(initiative.content));

  onMount(() => {
    fetchInitiativeUrl();
    fetchLinkedProjects();
  });
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
      class="flex justify-between items-start p-6 pb-4 border-b shrink-0 border-black-200 dark:border-white/10"
    >
      <div class="flex-1 min-w-0">
        <h2
          id="modal-title"
          class="flex gap-2 items-center text-xl font-medium text-black-900 dark:text-white"
        >
          {initiative.name}
          {#if initiativeUrl}
            <a
              href={initiativeUrl}
              target="_blank"
              rel="noopener noreferrer"
              class="ml-2 text-sm text-brand-400 underline transition-colors duration-150 hover:text-brand-300"
            >
              Open in Linear →
            </a>
          {/if}
        </h2>
        {#if initiative.description}
          <div class="mt-1.5 text-sm text-black-400">
            {initiative.description}
          </div>
        {/if}
        <div class="flex gap-2 items-center mt-2">
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
          {/if}
          <Badge
            variant={healthDisplay.variant}
            class={healthDisplay.colorClass}
          >
            {healthDisplay.text}
          </Badge>
        </div>
      </div>
      <button
        class="inline-flex justify-center items-center p-1.5 rounded transition-colors duration-150 cursor-pointer text-black-400 hover:text-white hover:bg-black-100 dark:bg-white/10"
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
    <!-- Metadata -->
    <div class="grid grid-cols-2 gap-6 mb-6 sm:grid-cols-3">
      {#if initiative.owner_name}
        <div>
          <div class="mb-1 text-xs text-black-500">Owner</div>
          <div class="flex gap-2 items-center">
            <UserProfile
              name={initiative.owner_name}
              avatarUrl={null}
              size="sm"
            />
          </div>
        </div>
      {/if}
      {#if initiative.creator_name}
        <div>
          <div class="mb-1 text-xs text-black-500">Creator</div>
          <div class="flex gap-2 items-center">
            <UserProfile
              name={initiative.creator_name}
              avatarUrl={null}
              size="sm"
            />
          </div>
        </div>
      {/if}
      {#if projectIds.length > 0}
        <div>
          <div class="mb-1 text-xs text-black-500">Linked Projects</div>
          <div class="text-sm font-medium text-black-900 dark:text-white">
            {projectIds.length}
          </div>
        </div>
      {/if}
    </div>

    <!-- Dates -->
    <div class="mb-6">
      <div class="mb-3 text-sm font-medium text-black-300">Dates</div>
      <div class="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {#if initiative.target_date}
          <div>
            <div class="mb-1 text-xs text-black-500">Target Date</div>
            <div class="text-sm text-black-900 dark:text-white">
              {formatDateFull(initiative.target_date)}
            </div>
          </div>
        {/if}
        {#if initiative.completed_at}
          <div>
            <div class="mb-1 text-xs text-black-500">Completed</div>
            <div class="text-sm text-black-900 dark:text-white">
              {formatDateFull(initiative.completed_at)}
            </div>
          </div>
        {/if}
        {#if initiative.started_at}
          <div>
            <div class="mb-1 text-xs text-black-500">Started</div>
            <div class="text-sm text-black-900 dark:text-white">
              {formatDateFull(initiative.started_at)}
            </div>
          </div>
        {/if}
        {#if initiative.archived_at}
          <div>
            <div class="mb-1 text-xs text-black-500">Archived</div>
            <div class="text-sm text-black-900 dark:text-white">
              {formatDateFull(initiative.archived_at)}
            </div>
          </div>
        {/if}
        <div>
          <div class="mb-1 text-xs text-black-500">Created</div>
          <div class="text-sm text-black-900 dark:text-white">
            {formatDateFull(initiative.created_at)}
          </div>
        </div>
        <div>
          <div class="mb-1 text-xs text-black-500">Updated</div>
          <div class="text-sm text-black-900 dark:text-white">
            {formatRelativeDate(initiative.updated_at)}
          </div>
        </div>
      </div>
    </div>

    <!-- Health -->
    <div class="mb-6">
      <div class="mb-2 text-xs text-black-500">Health</div>
      {#if healthUpdates.length > 0}
        {@const latestUpdate = healthUpdates[0]}
        {@const updateHealthDisplay = latestUpdate.health
          ? getHealthDisplay(latestUpdate.health)
          : null}
        {@const updateDate = new Date(latestUpdate.createdAt)}
        {@const daysSinceUpdate = Math.floor(
          (Date.now() - updateDate.getTime()) / (1000 * 60 * 60 * 24)
        )}
        {@const isStaleHealth = daysSinceUpdate > 7}

        {#if isStaleHealth}
          <div class="flex gap-2 items-center mb-2 text-xs text-warning-500">
            <span>⚠️</span>
            <span>Health update is {daysSinceUpdate} days old</span>
          </div>
        {/if}

        {#if showAllHealthUpdates}
          <div class="space-y-3">
            {#each healthUpdates as update (update.id)}
              {@const currentUpdateHealthDisplay = update.health
                ? getHealthDisplay(update.health)
                : null}
              <div class="p-3 rounded-md border bg-black-800/50 border-white/5">
                <div class="flex gap-2 items-center mb-2">
                  {#if currentUpdateHealthDisplay}
                    <Badge
                      variant={currentUpdateHealthDisplay.variant}
                      class={currentUpdateHealthDisplay.colorClass}
                    >
                      {currentUpdateHealthDisplay.text}
                    </Badge>
                  {/if}
                  <span class="text-xs text-black-500">
                    {formatRelativeDate(update.createdAt)}
                  </span>
                  {#if update.userName}
                    <span class="text-black-600">•</span>
                    <UserProfile
                      name={update.userName}
                      avatarUrl={update.userAvatarUrl}
                      size="xs"
                    />
                  {/if}
                </div>
                <div
                  class="text-sm leading-relaxed whitespace-pre-wrap text-black-200"
                >
                  {update.body}
                </div>
              </div>
            {/each}
            <button
              onclick={() => (showAllHealthUpdates = false)}
              class="mt-2 text-xs text-brand-400 underline transition-colors duration-150 cursor-pointer hover:text-brand-300"
            >
              Show only latest update
            </button>
          </div>
        {:else}
          <div class="p-3 rounded-md border bg-black-800/50 border-white/5">
            <div class="flex gap-2 items-center mb-2">
              {#if updateHealthDisplay}
                <Badge
                  variant={updateHealthDisplay.variant}
                  class={updateHealthDisplay.colorClass}
                >
                  {updateHealthDisplay.text}
                </Badge>
              {/if}
              <span class="text-xs text-black-500">
                {formatRelativeDate(latestUpdate.createdAt)}
              </span>
              {#if latestUpdate.userName}
                <span class="text-black-600">•</span>
                <UserProfile
                  name={latestUpdate.userName}
                  avatarUrl={latestUpdate.userAvatarUrl}
                  size="xs"
                />
              {/if}
            </div>
            <div
              class="text-sm leading-relaxed whitespace-pre-wrap text-black-200"
            >
              {latestUpdate.body}
            </div>
            {#if healthUpdates.length > 1}
              <button
                onclick={() => (showAllHealthUpdates = true)}
                class="mt-2 text-xs text-brand-400 underline transition-colors duration-150 cursor-pointer hover:text-brand-300"
              >
                +{healthUpdates.length - 1} more update{healthUpdates.length -
                  1 ===
                1
                  ? ""
                  : "s"}
              </button>
            {/if}
          </div>
        {/if}
      {:else if initiative.health_updated_at}
        <div class="p-3 rounded-md border bg-black-800/50 border-white/5">
          <div class="flex gap-2 items-center">
            <Badge
              variant={healthDisplay.variant}
              class={healthDisplay.colorClass}
            >
              {healthDisplay.text}
            </Badge>
            <span class="text-xs text-black-500">
              Updated {formatRelativeDate(initiative.health_updated_at)}
            </span>
          </div>
        </div>
      {:else}
        <div class="p-3 rounded-md border bg-black-800/50 border-white/5">
          <p class="text-sm text-black-400">No health updates available</p>
        </div>
      {/if}
    </div>

    <!-- Content -->
    <div class="mb-6">
      <div class="mb-3 text-sm font-medium text-black-300">Content</div>
      {#if initiative.content}
        <div class="markdown-content text-sm leading-relaxed text-black-200">
          <!-- eslint-disable-next-line svelte/no-at-html-tags -->
          {@html renderedContent}
        </div>
      {:else}
        <div class="p-3 rounded-md border bg-black-800/50 border-white/5">
          <p class="text-sm text-black-400">No content available</p>
        </div>
      {/if}
    </div>

    <!-- Projects Table -->
    <div class="mb-6">
      <div class="mb-2 text-xs text-black-500">Projects</div>
      {#if projectsLoading}
        <div class="text-sm text-black-400">Loading projects...</div>
      {:else}
        <ProjectsListTable projects={linkedProjects} hideWarnings={false} />
      {/if}
    </div>
  {/snippet}
</Modal>

<style>
  :global(.markdown-content h1),
  :global(.markdown-content h2),
  :global(.markdown-content h3),
  :global(.markdown-content h4),
  :global(.markdown-content h5),
  :global(.markdown-content h6) {
    font-weight: 600;
    color: rgb(255 255 255);
    margin-top: 1rem;
    margin-bottom: 0.5rem;
  }

  :global(.markdown-content h1) {
    font-size: 1.25rem;
    line-height: 1.75rem;
  }

  :global(.markdown-content h2) {
    font-size: 1.125rem;
    line-height: 1.75rem;
  }

  :global(.markdown-content h3) {
    font-size: 1rem;
    line-height: 1.5rem;
  }

  :global(.markdown-content p) {
    margin-bottom: 0.75rem;
  }

  :global(.markdown-content ul),
  :global(.markdown-content ol) {
    margin-bottom: 0.75rem;
    margin-left: 1.5rem;
  }

  :global(.markdown-content ul) {
    list-style-type: disc;
  }

  :global(.markdown-content ol) {
    list-style-type: decimal;
  }

  :global(.markdown-content li) {
    margin-bottom: 0.25rem;
  }

  :global(.markdown-content strong) {
    font-weight: 600;
    color: rgb(255 255 255);
  }

  :global(.markdown-content em) {
    font-style: italic;
  }

  :global(.markdown-content code) {
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    font-family:
      ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
      "Courier New", monospace;
    background-color: rgb(38 38 38);
    color: rgb(196 181 253);
  }

  :global(.markdown-content pre) {
    padding: 0.75rem;
    border-radius: 0.375rem;
    background-color: rgb(23 23 23);
    border: 1px solid rgba(255, 255, 255, 0.1);
    overflow-x: auto;
    margin-bottom: 0.75rem;
  }

  :global(.markdown-content pre code) {
    background-color: transparent;
    padding: 0;
    color: rgb(229 229 229);
  }

  :global(.markdown-content a) {
    color: rgb(196 181 253);
    text-decoration: underline;
    transition: color 150ms;
  }

  :global(.markdown-content a:hover) {
    color: rgb(167 139 250);
  }

  :global(.markdown-content blockquote) {
    padding-left: 1rem;
    border-left: 2px solid rgb(64 64 64);
    font-style: italic;
    color: rgb(212 212 212);
    margin-top: 0.75rem;
    margin-bottom: 0.75rem;
  }

  :global(.markdown-content hr) {
    border-color: rgb(64 64 64);
    margin-top: 1rem;
    margin-bottom: 1rem;
  }

  :global(.markdown-content table) {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 0.75rem;
  }

  :global(.markdown-content th),
  :global(.markdown-content td) {
    border: 1px solid rgba(255, 255, 255, 0.1);
    padding: 0.5rem 0.75rem;
    text-align: left;
  }

  :global(.markdown-content th) {
    background-color: rgba(38, 38, 38, 0.5);
    font-weight: 600;
    color: rgb(255 255 255);
  }
</style>

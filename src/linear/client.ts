import { LinearClient } from "@linear/sdk";
import { PAGINATION, TIMEOUTS } from "../constants/thresholds.js";

/**
 * Custom error for rate limit detection
 */
export class RateLimitError extends Error {
  constructor(message: string = "Rate limit exceeded") {
    super(message);
    this.name = "RateLimitError";
  }
}

/**
 * Check if an error from Linear SDK is a rate limit error
 * Linear SDK wraps rate limit errors with type "Ratelimited" and extensions.statusCode 429
 */
function isRateLimitError(error: any): boolean {
  // Check direct status code
  if (error?.statusCode === 429 || error?.response?.status === 429) {
    return true;
  }

  // Check Linear SDK error structure - the SDK sets type: "Ratelimited"
  if (error?.type === "Ratelimited" || error?.type === "ratelimited") {
    return true;
  }

  // Check GraphQL error extensions - Linear returns statusCode 429 in extensions
  if (
    error?.response?.errors?.[0]?.extensions?.statusCode === 429 ||
    error?.response?.errors?.[0]?.extensions?.code === "RATELIMITED"
  ) {
    return true;
  }

  // Check error message for rate limit indicators (most reliable fallback)
  const errorMessage = String(error?.message || error?.error || "");
  if (
    errorMessage.includes("Rate limit") ||
    errorMessage.includes("rate limit") ||
    errorMessage.includes("RATELIMITED") ||
    errorMessage.includes("ratelimited")
  ) {
    return true;
  }

  return false;
}

export interface LabelData {
  id: string;
  name: string;
  color: string;
  description: string | null;
  team: { id: string; name: string } | null;
  parent: { id: string; name: string } | null;
}

export interface LinearIssueData {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  teamId: string;
  teamName: string;
  teamKey: string;
  stateId: string;
  stateName: string;
  stateType: string;
  assigneeId: string | null;
  assigneeName: string | null;
  assigneeAvatarUrl: string | null;
  creatorId: string | null;
  creatorName: string | null;
  priority: number;
  estimate: number | null;
  lastCommentAt: Date | null;
  commentCount: number | null;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  canceledAt: Date | null;
  url: string;
  projectId: string | null;
  projectName: string | null;
  projectStateCategory: string | null;
  projectStatus: string | null;
  projectHealth: string | null;
  projectUpdatedAt: Date | null;
  projectLeadId: string | null;
  projectLeadName: string | null;
  projectLabels: string[];
  projectTargetDate: string | null; // Linear's target date for the project
  projectStartDate: string | null; // Linear's start date for the project
  projectCompletedAt: string | null; // Linear's completedAt date for the project
  parentId: string | null; // For subissue detection
  labels: LabelData[] | null;
}

export interface ProjectUpdate {
  id: string;
  createdAt: string;
  updatedAt: string;
  body: string;
  health: string | null;
  userId: string | null;
  userName: string | null;
  userAvatarUrl: string | null;
}

export interface LinearInitiativeData {
  id: string;
  name: string;
  description: string | null;
  status: string | null;
  targetDate: string | null;
  completedAt: string | null;
  startedAt: string | null;
  archivedAt: string | null;
  health: string | null;
  healthUpdatedAt: string | null;
  ownerId: string | null;
  ownerName: string | null;
  creatorId: string | null;
  creatorName: string | null;
  projectIds: string[];
  createdAt: string;
  updatedAt: string;
}

export class LinearAPIClient {
  private client: LinearClient;
  private queryCounter?: () => void;

  constructor(apiKey: string, queryCounter?: () => void) {
    this.client = new LinearClient({ apiKey });
    this.queryCounter = queryCounter;
  }

  private incrementQueryCount(): void {
    if (this.queryCounter) {
      this.queryCounter();
    }
  }

  async fetchStartedIssues(
    onProgress?: (current: number, pageSize: number) => void
  ): Promise<LinearIssueData[]> {
    const issues: LinearIssueData[] = [];
    let hasMore = true;
    let cursor: string | undefined;
    let pageCount = 0;

    // Use raw GraphQL to fetch everything in ONE query per page
    const query = `
      query GetStartedIssues($first: Int!, $after: String) {
        issues(
          first: $first
          after: $after
          filter: { state: { type: { eq: "started" } } }
        ) {
          nodes {
            id
            identifier
            title
            description
            priority
            estimate
            url
            createdAt
            updatedAt
            startedAt
            completedAt
            canceledAt
            parent {
              id
            }
            labels {
              nodes {
                id
                name
                color
                description
                team {
                  id
                  name
                }
                parent {
                  id
                  name
                }
              }
            }
            comments(first: 250, orderBy: createdAt) {
              nodes {
                createdAt
              }
              pageInfo {
                hasNextPage
              }
            }
            team {
              id
              name
              key
            }
            state {
              id
              name
              type
            }
            assignee {
              id
              name
              avatarUrl
            }
            creator {
              id
              name
            }
            project {
              id
              name
              state
              status {
                name
              }
              health
              updatedAt
              targetDate
              startDate
              completedAt
              labels {
                nodes {
                  name
                }
              }
              lead {
                id
                name
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;

    while (hasMore) {
      let response: any;
      try {
        this.incrementQueryCount();
        response = await this.client.client.rawRequest(query, {
          first: PAGINATION.GRAPHQL_PAGE_SIZE,
          after: cursor,
        });
      } catch (error: any) {
        // Check for rate limit using comprehensive detection
        if (isRateLimitError(error)) {
          throw new RateLimitError("Linear API rate limit exceeded");
        }
        throw error;
      }

      const data = response.data.issues;

      for (const issue of data.nodes) {
        // Skip issues without team or state (shouldn't happen but be safe)
        if (!issue.team || !issue.state) continue;

        const lastComment = issue.comments?.nodes?.[0];
        // Count comments from nodes array (fetches up to 250 comments)
        // Note: If there are more than 250 comments, we'll only count up to 250
        const commentCount = issue.comments?.nodes?.length ?? null;
        issues.push({
          id: issue.id,
          identifier: issue.identifier,
          title: issue.title,
          description: issue.description || null,
          teamId: issue.team.id,
          teamName: issue.team.name,
          teamKey: issue.team.key,
          stateId: issue.state.id,
          stateName: issue.state.name,
          stateType: issue.state.type,
          assigneeId: issue.assignee?.id || null,
          assigneeName: issue.assignee?.name || null,
          assigneeAvatarUrl: issue.assignee?.avatarUrl || null,
          creatorId: issue.creator?.id || null,
          creatorName: issue.creator?.name || null,
          priority: issue.priority,
          estimate: issue.estimate || null,
          lastCommentAt: lastComment?.createdAt
            ? new Date(lastComment.createdAt)
            : null,
          commentCount: commentCount,
          createdAt: new Date(issue.createdAt),
          updatedAt: new Date(issue.updatedAt),
          startedAt: issue.startedAt ? new Date(issue.startedAt) : null,
          completedAt: issue.completedAt ? new Date(issue.completedAt) : null,
          canceledAt: issue.canceledAt ? new Date(issue.canceledAt) : null,
          url: issue.url,
          projectId: issue.project?.id || null,
          projectName: issue.project?.name || null,
          projectStateCategory: issue.project?.state || null,
          projectStatus: issue.project?.status?.name || null,
          projectHealth: issue.project?.health || null,
          projectUpdatedAt: issue.project?.updatedAt
            ? new Date(issue.project.updatedAt)
            : null,
          projectLeadId: issue.project?.lead?.id || null,
          projectLeadName: issue.project?.lead?.name || null,
          projectLabels:
            issue.project?.labels?.nodes?.map(
              (l: { name: string }) => l.name
            ) || [],
          projectTargetDate: issue.project?.targetDate || null,
          projectStartDate: issue.project?.startDate || null,
          projectCompletedAt: issue.project?.completedAt || null,
          parentId: issue.parent?.id || null,
          labels:
            issue.labels?.nodes?.map((l: any) => ({
              id: l.id,
              name: l.name,
              color: l.color,
              description: l.description || null,
              team: l.team ? { id: l.team.id, name: l.team.name } : null,
              parent: l.parent
                ? { id: l.parent.id, name: l.parent.name }
                : null,
            })) || null,
        });
      }

      hasMore = data.pageInfo.hasNextPage;
      cursor = data.pageInfo.endCursor ?? undefined;
      pageCount++;

      if (onProgress) {
        onProgress(issues.length, data.nodes.length);
      }

      // Safety break to avoid infinite loops
      if (pageCount > PAGINATION.MAX_PAGES) {
        console.warn(
          `Warning: Fetched ${PAGINATION.MAX_PAGES}+ pages, stopping to avoid infinite loop`
        );
        break;
      }
    }

    return issues;
  }

  async fetchRecentlyUpdatedIssues(
    days: number,
    onProgress?: (current: number, pageSize: number) => void
  ): Promise<LinearIssueData[]> {
    const issues: LinearIssueData[] = [];
    let hasMore = true;
    let cursor: string | undefined;
    let pageCount = 0;

    // Calculate cutoff date (days ago)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffDateISO = cutoffDate.toISOString();

    // Use raw GraphQL to fetch everything in ONE query per page
    const query = `
      query GetRecentlyUpdatedIssues($first: Int!, $after: String, $cutoffDate: DateTimeOrDuration!) {
        issues(
          first: $first
          after: $after
          filter: { updatedAt: { gte: $cutoffDate } }
        ) {
          nodes {
            id
            identifier
            title
            description
            priority
            estimate
            url
            createdAt
            updatedAt
            startedAt
            completedAt
            canceledAt
            parent {
              id
            }
            labels {
              nodes {
                id
                name
                color
                description
                team {
                  id
                  name
                }
                parent {
                  id
                  name
                }
              }
            }
            comments(first: 250, orderBy: createdAt) {
              nodes {
                createdAt
              }
              pageInfo {
                hasNextPage
              }
            }
            team {
              id
              name
              key
            }
            state {
              id
              name
              type
            }
            assignee {
              id
              name
              avatarUrl
            }
            creator {
              id
              name
            }
            project {
              id
              name
              state
              status {
                name
              }
              health
              updatedAt
              targetDate
              startDate
              completedAt
              labels {
                nodes {
                  name
                }
              }
              lead {
                id
                name
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;

    while (hasMore) {
      let response: any;
      try {
        response = await this.client.client.rawRequest(query, {
          first: PAGINATION.GRAPHQL_PAGE_SIZE,
          after: cursor,
          cutoffDate: cutoffDateISO,
        });
      } catch (error: any) {
        // Check for rate limit using comprehensive detection
        if (isRateLimitError(error)) {
          throw new RateLimitError("Linear API rate limit exceeded");
        }
        throw error;
      }

      const data = response.data.issues;

      for (const issue of data.nodes) {
        // Skip issues without team or state (shouldn't happen but be safe)
        if (!issue.team || !issue.state) continue;

        const lastComment = issue.comments?.nodes?.[0];
        // Count comments from nodes array (fetches up to 250 comments)
        // Note: If there are more than 250 comments, we'll only count up to 250
        const commentCount = issue.comments?.nodes?.length ?? null;
        issues.push({
          id: issue.id,
          identifier: issue.identifier,
          title: issue.title,
          description: issue.description || null,
          teamId: issue.team.id,
          teamName: issue.team.name,
          teamKey: issue.team.key,
          stateId: issue.state.id,
          stateName: issue.state.name,
          stateType: issue.state.type,
          assigneeId: issue.assignee?.id || null,
          assigneeName: issue.assignee?.name || null,
          assigneeAvatarUrl: issue.assignee?.avatarUrl || null,
          creatorId: issue.creator?.id || null,
          creatorName: issue.creator?.name || null,
          priority: issue.priority,
          estimate: issue.estimate || null,
          lastCommentAt: lastComment?.createdAt
            ? new Date(lastComment.createdAt)
            : null,
          commentCount: commentCount,
          createdAt: new Date(issue.createdAt),
          updatedAt: new Date(issue.updatedAt),
          startedAt: issue.startedAt ? new Date(issue.startedAt) : null,
          completedAt: issue.completedAt ? new Date(issue.completedAt) : null,
          canceledAt: issue.canceledAt ? new Date(issue.canceledAt) : null,
          url: issue.url,
          projectId: issue.project?.id || null,
          projectName: issue.project?.name || null,
          projectStateCategory: issue.project?.state || null,
          projectStatus: issue.project?.status?.name || null,
          projectHealth: issue.project?.health || null,
          projectUpdatedAt: issue.project?.updatedAt
            ? new Date(issue.project.updatedAt)
            : null,
          projectLeadId: issue.project?.lead?.id || null,
          projectLeadName: issue.project?.lead?.name || null,
          projectLabels:
            issue.project?.labels?.nodes?.map(
              (l: { name: string }) => l.name
            ) || [],
          projectTargetDate: issue.project?.targetDate || null,
          projectStartDate: issue.project?.startDate || null,
          projectCompletedAt: issue.project?.completedAt || null,
          parentId: issue.parent?.id || null,
          labels:
            issue.labels?.nodes?.map((l: any) => ({
              id: l.id,
              name: l.name,
              color: l.color,
              description: l.description || null,
              team: l.team ? { id: l.team.id, name: l.team.name } : null,
              parent: l.parent
                ? { id: l.parent.id, name: l.parent.name }
                : null,
            })) || null,
        });
      }

      hasMore = data.pageInfo.hasNextPage;
      cursor = data.pageInfo.endCursor ?? undefined;
      pageCount++;

      if (onProgress) {
        onProgress(issues.length, data.nodes.length);
      }

      // Safety break to avoid infinite loops
      if (pageCount > PAGINATION.MAX_PAGES) {
        console.warn(
          `Warning: Fetched ${PAGINATION.MAX_PAGES}+ pages, stopping to avoid infinite loop`
        );
        break;
      }
    }

    return issues;
  }

  async fetchIssuesByProjects(
    projectIds: string[],
    onProgress?: (
      current: number,
      pageSize?: number,
      projectIndex?: number,
      totalProjects?: number
    ) => void,
    projectDescriptionsMap?: Map<string, string | null>,
    projectUpdatesMap?: Map<string, ProjectUpdate[]>
  ): Promise<LinearIssueData[]> {
    if (projectIds.length === 0) return [];

    const issues: LinearIssueData[] = [];
    const totalProjects = projectIds.length;

    // Fetch issues for each project (Linear doesn't support OR in project filters)
    for (
      let projectIndex = 0;
      projectIndex < projectIds.length;
      projectIndex++
    ) {
      const projectId = projectIds[projectIndex];
      let hasMore = true;
      let cursor: string | undefined;
      let pageCount = 0;
      const projectIssues: LinearIssueData[] = [];
      let projectName: string | null = null;

      // Notify start of project
      if (onProgress) {
        onProgress(issues.length, undefined, projectIndex, totalProjects);
      }

      const query = `
        query GetProjectIssues($first: Int!, $after: String, $projectId: ID!) {
          issues(
            first: $first
            after: $after
            filter: { project: { id: { eq: $projectId } } }
          ) {
            nodes {
              id
              identifier
              title
              description
              priority
              estimate
              url
              createdAt
              updatedAt
              startedAt
              completedAt
              canceledAt
              parent {
                id
              }
              comments(first: 250, orderBy: createdAt) {
                nodes {
                  createdAt
                }
                pageInfo {
                  hasNextPage
                }
              }
              team {
                id
                name
                key
              }
              state {
                id
                name
                type
              }
              assignee {
                id
                name
                avatarUrl
              }
              creator {
                id
                name
              }
              project {
                id
                name
                state
                status {
                  name
                }
                health
                updatedAt
                targetDate
                startDate
                labels {
                  nodes {
                    name
                  }
                }
                lead {
                  id
                  name
                }
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `;

      while (hasMore) {
        let response: any;
        try {
          this.incrementQueryCount();
          response = await this.client.client.rawRequest(query, {
            first: PAGINATION.GRAPHQL_PAGE_SIZE,
            after: cursor,
            projectId,
          });
        } catch (error: any) {
          // Check for rate limit using comprehensive detection
          if (isRateLimitError(error)) {
            throw new RateLimitError("Linear API rate limit exceeded");
          }
          throw error;
        }

        const data = response.data.issues;

        for (const issue of data.nodes) {
          // Skip issues without team or state
          if (!issue.team || !issue.state) continue;

          // Skip duplicates (issue might already be in started issues)
          if (issues.some((i) => i.id === issue.id)) continue;

          // Capture project name from first issue
          if (!projectName && issue.project?.name) {
            projectName = issue.project.name;
          }

          const lastComment = issue.comments?.nodes?.[0];
          // Count comments from nodes array (fetches up to 250 comments)
          // Note: If there are more than 250 comments, we'll only count up to 250
          const commentCount = issue.comments?.nodes?.length ?? null;
          const issueData = {
            id: issue.id,
            identifier: issue.identifier,
            title: issue.title,
            description: issue.description || null,
            teamId: issue.team.id,
            teamName: issue.team.name,
            teamKey: issue.team.key,
            stateId: issue.state.id,
            stateName: issue.state.name,
            stateType: issue.state.type,
            assigneeId: issue.assignee?.id || null,
            assigneeName: issue.assignee?.name || null,
            assigneeAvatarUrl: issue.assignee?.avatarUrl || null,
            creatorId: issue.creator?.id || null,
            creatorName: issue.creator?.name || null,
            priority: issue.priority,
            estimate: issue.estimate || null,
            lastCommentAt: lastComment?.createdAt
              ? new Date(lastComment.createdAt)
              : null,
            commentCount: commentCount,
            createdAt: new Date(issue.createdAt),
            updatedAt: new Date(issue.updatedAt),
            startedAt: issue.startedAt ? new Date(issue.startedAt) : null,
            completedAt: issue.completedAt ? new Date(issue.completedAt) : null,
            canceledAt: issue.canceledAt ? new Date(issue.canceledAt) : null,
            url: issue.url,
            projectId: issue.project?.id || null,
            projectName: issue.project?.name || null,
            projectStateCategory: issue.project?.state || null,
            projectStatus: issue.project?.status?.name || null,
            projectHealth: issue.project?.health || null,
            projectUpdatedAt: issue.project?.updatedAt
              ? new Date(issue.project.updatedAt)
              : null,
            projectLeadId: issue.project?.lead?.id || null,
            projectLeadName: issue.project?.lead?.name || null,
            projectLabels:
              issue.project?.labels?.nodes?.map(
                (l: { name: string }) => l.name
              ) || [],
            projectTargetDate: issue.project?.targetDate || null,
            projectStartDate: issue.project?.startDate || null,
            parentId: issue.parent?.id || null,
          };

          issues.push(issueData);
          projectIssues.push(issueData);
        }

        hasMore = data.pageInfo.hasNextPage;
        cursor = data.pageInfo.endCursor ?? undefined;
        pageCount++;

        // Log progress for this project during pagination
        const projectDisplayName = projectName || projectId;
        const currentCount = projectIssues.length;
        const pageSize = data.nodes.length;
        console.log(
          `[SYNC] Project ${projectIndex + 1}/${totalProjects} (${projectDisplayName}, ID: ${projectId}): ${currentCount} issues (${pageSize} in this page)`
        );

        if (onProgress) {
          onProgress(
            issues.length,
            data.nodes.length,
            projectIndex,
            totalProjects
          );
        }

        // Safety break
        if (pageCount > PAGINATION.MAX_PAGES) {
          console.warn(
            `Warning: Fetched ${PAGINATION.MAX_PAGES}+ pages for project ${projectId}, stopping`
          );
          break;
        }
      }

      // Log summary for this project
      const projectDisplayName = projectName || projectId;
      const finalCount = projectIssues.length;
      console.log(
        `[SYNC] Project ${projectIndex + 1}/${totalProjects} summary: ${projectDisplayName} (ID: ${projectId}) - ${finalCount} issues`
      );

      // Fetch project description along the way
      if (projectDescriptionsMap !== undefined) {
        try {
          const description = await this.fetchProjectDescription(projectId);
          projectDescriptionsMap.set(projectId, description);
        } catch (error: any) {
          // Check for rate limit
          if (error instanceof RateLimitError) {
            throw error;
          }
          console.error(
            `[SYNC] Failed to fetch description for project ${projectId}:`,
            error
          );
          projectDescriptionsMap.set(projectId, null);
        }
      }

      // Fetch project updates along the way
      if (projectUpdatesMap !== undefined) {
        try {
          const updates = await this.fetchProjectUpdates(projectId);
          projectUpdatesMap.set(projectId, updates);
          if (updates.length > 0) {
            console.log(
              `[SYNC] Fetched ${updates.length} project update(s) for project: ${projectDisplayName || projectId}`
            );
          }
        } catch (error: any) {
          // Check for rate limit
          if (error instanceof RateLimitError) {
            throw error;
          }
          console.error(
            `[SYNC] Failed to fetch updates for project ${projectId}:`,
            error
          );
          projectUpdatesMap.set(projectId, []);
        }
      }
    }

    return issues;
  }

  async testConnection(): Promise<boolean> {
    try {
      this.incrementQueryCount();
      // Add a timeout to avoid hanging
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("Connection timeout")),
          TIMEOUTS.API_TIMEOUT_MS
        )
      );

      await Promise.race([this.client.viewer, timeoutPromise]);
      return true;
    } catch (error) {
      console.error(
        "Connection test failed:",
        error instanceof Error ? error.message : error
      );
      return false;
    }
  }

  async fetchProjectDescription(projectId: string): Promise<string | null> {
    const query = `
      query GetProjectDescription($projectId: String!) {
        project(id: $projectId) {
          id
          description
        }
      }
    `;

    let response: any;
    try {
      this.incrementQueryCount();
      response = await this.client.client.rawRequest(query, {
        projectId,
      });
    } catch (error: any) {
      // Check for rate limit using comprehensive detection
      if (isRateLimitError(error)) {
        throw new RateLimitError("Linear API rate limit exceeded");
      }
      // For other errors, log but don't fail the sync - descriptions are optional
      console.error(
        `Failed to fetch project description for ${projectId}:`,
        error instanceof Error ? error.message : error
      );
      return null;
    }

    const project = response.data?.project;
    if (!project) {
      return null;
    }

    return project.description || null;
  }

  async fetchProjectUpdates(projectId: string): Promise<ProjectUpdate[]> {
    const query = `
      query GetProjectUpdates($projectId: String!) {
        project(id: $projectId) {
          id
          projectUpdates {
            nodes {
              id
              createdAt
              updatedAt
              body
              health
              user {
                id
                name
                avatarUrl
              }
            }
          }
        }
      }
    `;

    let response: any;
    try {
      this.incrementQueryCount();
      response = await this.client.client.rawRequest(query, {
        projectId,
      });
    } catch (error: any) {
      // Check for rate limit using comprehensive detection
      if (isRateLimitError(error)) {
        throw new RateLimitError("Linear API rate limit exceeded");
      }
      // For other errors, log but don't fail the sync - project updates are optional
      console.error(
        `Failed to fetch project updates for ${projectId}:`,
        error instanceof Error ? error.message : error
      );
      return [];
    }

    const project = response.data?.project;
    if (!project || !project.projectUpdates) {
      return [];
    }

    return (project.projectUpdates.nodes || []).map((node: any) => ({
      id: node.id,
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
      body: node.body,
      health: node.health,
      userId: node.user?.id || null,
      userName: node.user?.name || null,
      userAvatarUrl: node.user?.avatarUrl || null,
    }));
  }

  /**
   * Fetch initiative updates (health updates) from Linear API
   */
  async fetchInitiativeUpdates(initiativeId: string): Promise<ProjectUpdate[]> {
    const query = `
      query GetInitiativeUpdates($initiativeId: String!) {
        initiative(id: $initiativeId) {
          id
          initiativeUpdates {
            nodes {
              id
              createdAt
              updatedAt
              body
              health
              user {
                id
                name
                avatarUrl
              }
            }
          }
        }
      }
    `;

    let response: any;
    try {
      this.incrementQueryCount();
      response = await this.client.client.rawRequest(query, {
        initiativeId,
      });
    } catch (error: any) {
      // Check for rate limit using comprehensive detection
      if (isRateLimitError(error)) {
        throw new RateLimitError("Linear API rate limit exceeded");
      }
      // For other errors, log but don't fail the sync - initiative updates are optional
      console.error(
        `Failed to fetch initiative updates for ${initiativeId}:`,
        error instanceof Error ? error.message : error
      );
      return [];
    }

    const initiative = response.data?.initiative;
    if (!initiative || !initiative.initiativeUpdates) {
      return [];
    }

    return (initiative.initiativeUpdates.nodes || []).map((node: any) => ({
      id: node.id,
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
      body: node.body,
      health: node.health,
      userId: node.user?.id || null,
      userName: node.user?.name || null,
      userAvatarUrl: node.user?.avatarUrl || null,
    }));
  }

  /**
   * Fetch all planned projects (project_state_category contains "planned")
   * Returns array of project IDs
   */
  async fetchPlannedProjects(): Promise<string[]> {
    const projectIds: string[] = [];
    let hasMore = true;
    let cursor: string | undefined;
    let pageCount = 0;

    const query = `
      query GetPlannedProjects($first: Int!, $after: String) {
        projects(
          first: $first
          after: $after
        ) {
          nodes {
            id
            state
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;

    while (hasMore) {
      let response: any;
      try {
        this.incrementQueryCount();
        response = await this.client.client.rawRequest(query, {
          first: PAGINATION.GRAPHQL_PAGE_SIZE,
          after: cursor,
        });
      } catch (error: any) {
        if (isRateLimitError(error)) {
          throw new RateLimitError("Linear API rate limit exceeded");
        }
        throw error;
      }

      const data = response.data.projects;

      for (const project of data.nodes) {
        // Check if project state contains "planned" (case-insensitive)
        const state = (project.state || "").toLowerCase();
        if (state.includes("planned")) {
          projectIds.push(project.id);
        }
      }

      hasMore = data.pageInfo.hasNextPage;
      cursor = data.pageInfo.endCursor ?? undefined;
      pageCount++;

      // Safety break to avoid infinite loops
      if (pageCount > PAGINATION.MAX_PAGES) {
        console.warn(
          `Warning: Fetched ${PAGINATION.MAX_PAGES}+ pages of projects, stopping to avoid infinite loop`
        );
        break;
      }
    }

    return projectIds;
  }

  /**
   * Fetch projects completed in the last 6 months
   * Returns array of project IDs
   */
  async fetchCompletedProjects(): Promise<string[]> {
    const projectIds: string[] = [];
    let hasMore = true;
    let cursor: string | undefined;
    let pageCount = 0;

    // Calculate date 6 months ago
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const _sixMonthsAgoISO = sixMonthsAgo.toISOString();

    const query = `
      query GetCompletedProjects($first: Int!, $after: String) {
        projects(
          first: $first
          after: $after
        ) {
          nodes {
            id
            state
            completedAt
            updatedAt
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;

    while (hasMore) {
      let response: any;
      try {
        this.incrementQueryCount();
        response = await this.client.client.rawRequest(query, {
          first: PAGINATION.GRAPHQL_PAGE_SIZE,
          after: cursor,
        });
      } catch (error: any) {
        if (isRateLimitError(error)) {
          throw new RateLimitError("Linear API rate limit exceeded");
        }
        throw error;
      }

      const data = response.data.projects;

      for (const project of data.nodes) {
        // Check if project is completed and was completed/updated in last 6 months
        const state = (project.state || "").toLowerCase();
        const isCompleted =
          state.includes("completed") ||
          state.includes("done") ||
          state === "canceled";

        if (isCompleted) {
          // Check if completedAt or updatedAt is within last 6 months
          const completedAt = project.completedAt
            ? new Date(project.completedAt)
            : null;
          const updatedAt = project.updatedAt
            ? new Date(project.updatedAt)
            : null;

          const relevantDate = completedAt || updatedAt;
          if (relevantDate && relevantDate >= sixMonthsAgo) {
            projectIds.push(project.id);
          }
        }
      }

      hasMore = data.pageInfo.hasNextPage;
      cursor = data.pageInfo.endCursor ?? undefined;
      pageCount++;

      // Safety break to avoid infinite loops
      if (pageCount > PAGINATION.MAX_PAGES) {
        console.warn(
          `Warning: Fetched ${PAGINATION.MAX_PAGES}+ pages of projects, stopping to avoid infinite loop`
        );
        break;
      }
    }

    return projectIds;
  }

  /**
   * Introspect GraphQL schema to discover available fields on a type
   */
  async introspectType(typeName: string): Promise<any> {
    const query = `
      query IntrospectType($typeName: String!) {
        __type(name: $typeName) {
          name
          kind
          description
          fields {
            name
            description
            type {
              name
              kind
              ofType {
                name
                kind
              }
            }
          }
        }
      }
    `;

    try {
      this.incrementQueryCount();
      const response = await this.client.client.rawRequest(query, {
        typeName,
      });
      return response.data;
    } catch (error: any) {
      if (isRateLimitError(error)) {
        throw new RateLimitError("Linear API rate limit exceeded");
      }
      throw error;
    }
  }

  /**
   * Explore initiatives - fetch sample initiatives to see available fields
   */
  async exploreInitiatives(): Promise<any> {
    const query = `
      query ExploreInitiatives($first: Int!) {
        initiatives(first: $first) {
          nodes {
            id
            name
            description
            status
            targetDate
            sortOrder
            createdAt
            updatedAt
            completedAt
            archivedAt
            startedAt
            projects {
              nodes {
                id
                name
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;

    try {
      this.incrementQueryCount();
      const response = await this.client.client.rawRequest(query, {
        first: 10,
      });
      return response.data;
    } catch (error: any) {
      if (isRateLimitError(error)) {
        throw new RateLimitError("Linear API rate limit exceeded");
      }
      throw error;
    }
  }

  /**
   * Explore issue labels - fetch sample issues with labels to see available fields
   */
  async exploreIssueLabels(): Promise<any> {
    const query = `
      query ExploreIssueLabels($first: Int!) {
        issues(first: $first) {
          nodes {
            id
            identifier
            title
            labels {
              nodes {
                id
                name
                color
                description
                team {
                  id
                  name
                }
                parent {
                  id
                  name
                }
                createdAt
                updatedAt
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;

    try {
      this.incrementQueryCount();
      const response = await this.client.client.rawRequest(query, {
        first: 20,
      });
      return response.data;
    } catch (error: any) {
      if (isRateLimitError(error)) {
        throw new RateLimitError("Linear API rate limit exceeded");
      }
      throw error;
    }
  }

  /**
   * Explore project completion dates - fetch sample projects with completedAt field
   */
  async exploreProjectCompletionDates(): Promise<any> {
    const query = `
      query ExploreProjectCompletionDates($first: Int!) {
        projects(first: $first) {
          nodes {
            id
            name
            state
            status {
              name
            }
            createdAt
            updatedAt
            startedAt
            targetDate
            completedAt
            canceledAt
            progress
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;

    try {
      this.incrementQueryCount();
      const response = await this.client.client.rawRequest(query, {
        first: 20,
      });
      return response.data;
    } catch (error: any) {
      if (isRateLimitError(error)) {
        throw new RateLimitError("Linear API rate limit exceeded");
      }
      throw error;
    }
  }

  /**
   * Fetch all initiatives from Linear API
   */
  async fetchInitiatives(
    onProgress?: (current: number, pageSize: number) => void
  ): Promise<LinearInitiativeData[]> {
    const initiatives: LinearInitiativeData[] = [];
    let hasMore = true;
    let cursor: string | undefined;
    let pageCount = 0;

    const query = `
      query GetInitiatives($first: Int!, $after: String) {
        initiatives(first: $first, after: $after) {
          nodes {
            id
            name
            description
            status
            targetDate
            completedAt
            startedAt
            archivedAt
            health
            healthUpdatedAt
            owner {
              id
              name
            }
            creator {
              id
              name
            }
            projects {
              nodes {
                id
              }
            }
            createdAt
            updatedAt
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;

    while (hasMore) {
      let response: any;
      try {
        this.incrementQueryCount();
        response = await this.client.client.rawRequest(query, {
          first: PAGINATION.GRAPHQL_PAGE_SIZE,
          after: cursor,
        });
      } catch (error: any) {
        if (isRateLimitError(error)) {
          throw new RateLimitError("Linear API rate limit exceeded");
        }
        throw error;
      }

      const data = response.data.initiatives;

      for (const initiative of data.nodes) {
        initiatives.push({
          id: initiative.id,
          name: initiative.name,
          description: initiative.description || null,
          status: initiative.status || null,
          targetDate: initiative.targetDate || null,
          completedAt: initiative.completedAt || null,
          startedAt: initiative.startedAt || null,
          archivedAt: initiative.archivedAt || null,
          health: initiative.health || null,
          healthUpdatedAt: initiative.healthUpdatedAt || null,
          ownerId: initiative.owner?.id || null,
          ownerName: initiative.owner?.name || null,
          creatorId: initiative.creator?.id || null,
          creatorName: initiative.creator?.name || null,
          projectIds:
            initiative.projects?.nodes?.map((p: { id: string }) => p.id) || [],
          createdAt: initiative.createdAt,
          updatedAt: initiative.updatedAt,
        });
      }

      hasMore = data.pageInfo.hasNextPage;
      cursor = data.pageInfo.endCursor ?? undefined;
      pageCount++;

      if (onProgress) {
        onProgress(initiatives.length, data.nodes.length);
      }

      // Safety break to avoid infinite loops
      if (pageCount > PAGINATION.MAX_PAGES) {
        console.warn(
          `Warning: Fetched ${PAGINATION.MAX_PAGES}+ pages of initiatives, stopping to avoid infinite loop`
        );
        break;
      }
    }

    return initiatives;
  }
}

export function createLinearClient(
  apiKey?: string,
  queryCounter?: () => void
): LinearAPIClient {
  const key = apiKey || process.env.LINEAR_API_KEY;
  if (!key) {
    throw new Error("LINEAR_API_KEY is not set in environment variables");
  }
  return new LinearAPIClient(key, queryCounter);
}

import { LinearClient } from "@linear/sdk";

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
  priority: number;
  createdAt: Date;
  updatedAt: Date;
  url: string;
  projectId: string | null;
  projectName: string | null;
  projectState: string | null;
  projectUpdatedAt: Date | null;
}

export class LinearAPIClient {
  private client: LinearClient;

  constructor(apiKey: string) {
    this.client = new LinearClient({ apiKey });
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
            url
            createdAt
            updatedAt
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
            }
            project {
              id
              name
              state
              updatedAt
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
      const response: any = await this.client.client.rawRequest(query, {
        first: 100,
        after: cursor,
      });

      const data = response.data.issues;

      for (const issue of data.nodes) {
        // Skip issues without team or state (shouldn't happen but be safe)
        if (!issue.team || !issue.state) continue;

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
          priority: issue.priority,
          createdAt: new Date(issue.createdAt),
          updatedAt: new Date(issue.updatedAt),
          url: issue.url,
          projectId: issue.project?.id || null,
          projectName: issue.project?.name || null,
          projectState: issue.project?.state || null,
          projectUpdatedAt: issue.project?.updatedAt
            ? new Date(issue.project.updatedAt)
            : null,
        });
      }

      hasMore = data.pageInfo.hasNextPage;
      cursor = data.pageInfo.endCursor ?? undefined;
      pageCount++;

      if (onProgress) {
        onProgress(issues.length, data.nodes.length);
      }

      // Safety break to avoid infinite loops
      if (pageCount > 100) {
        console.warn(
          "Warning: Fetched 100+ pages, stopping to avoid infinite loop"
        );
        break;
      }
    }

    return issues;
  }

  async fetchIssuesByProjects(
    projectIds: string[],
    onProgress?: (current: number, pageSize: number) => void
  ): Promise<LinearIssueData[]> {
    if (projectIds.length === 0) return [];

    const issues: LinearIssueData[] = [];

    // Fetch issues for each project (Linear doesn't support OR in project filters)
    for (const projectId of projectIds) {
      let hasMore = true;
      let cursor: string | undefined;
      let pageCount = 0;

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
              url
              createdAt
              updatedAt
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
              }
              project {
                id
                name
                state
                updatedAt
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
        const response: any = await this.client.client.rawRequest(query, {
          first: 100,
          after: cursor,
          projectId,
        });

        const data = response.data.issues;

        for (const issue of data.nodes) {
          // Skip issues without team or state
          if (!issue.team || !issue.state) continue;

          // Skip duplicates (issue might already be in started issues)
          if (issues.some((i) => i.id === issue.id)) continue;

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
            priority: issue.priority,
            createdAt: new Date(issue.createdAt),
            updatedAt: new Date(issue.updatedAt),
            url: issue.url,
            projectId: issue.project?.id || null,
            projectName: issue.project?.name || null,
            projectState: issue.project?.state || null,
            projectUpdatedAt: issue.project?.updatedAt
              ? new Date(issue.project.updatedAt)
              : null,
          });
        }

        hasMore = data.pageInfo.hasNextPage;
        cursor = data.pageInfo.endCursor ?? undefined;
        pageCount++;

        if (onProgress) {
          onProgress(issues.length, data.nodes.length);
        }

        // Safety break
        if (pageCount > 100) {
          console.warn(
            `Warning: Fetched 100+ pages for project ${projectId}, stopping`
          );
          break;
        }
      }
    }

    return issues;
  }

  async commentOnIssue(issueId: string, message: string): Promise<boolean> {
    try {
      const mutation = `
        mutation CreateComment($issueId: String!, $body: String!) {
          commentCreate(input: { issueId: $issueId, body: $body }) {
            success
            comment {
              id
            }
          }
        }
      `;

      const response: any = await this.client.client.rawRequest(mutation, {
        issueId,
        body: message,
      });

      return response.data.commentCreate.success;
    } catch (error) {
      console.error(
        `Failed to comment on issue ${issueId}:`,
        error instanceof Error ? error.message : error
      );
      return false;
    }
  }

  /**
   * Check if an issue has a recent comment containing specific text
   */
  async hasRecentCommentWithText(
    issueId: string,
    searchText: string,
    hoursAgo: number = 24
  ): Promise<boolean> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setHours(cutoffDate.getHours() - hoursAgo);

      const query = `
        query GetIssueComments($issueId: String!) {
          issue(id: $issueId) {
            comments(first: 50, orderBy: createdAt) {
              nodes {
                id
                body
                createdAt
                user {
                  name
                  isMe
                }
              }
            }
          }
        }
      `;

      const response: any = await this.client.client.rawRequest(query, {
        issueId,
      });

      const comments = response.data.issue?.comments?.nodes || [];

      // Check if any recent comments contain the search text
      for (const comment of comments) {
        const commentDate = new Date(comment.createdAt);

        // Check if comment is recent enough and contains our warning text
        if (commentDate >= cutoffDate && comment.body.includes(searchText)) {
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error(
        `Error checking comments for issue ${issueId}:`,
        error instanceof Error ? error.message : String(error)
      );
      return false; // Assume no comment if there's an error
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      // Add a timeout to avoid hanging
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Connection timeout")), 10000)
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
}

export function createLinearClient(apiKey?: string): LinearAPIClient {
  const key = apiKey || process.env.LINEAR_API_KEY;
  if (!key) {
    throw new Error("LINEAR_API_KEY is not set in environment variables");
  }
  return new LinearAPIClient(key);
}

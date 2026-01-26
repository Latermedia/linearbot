import type { Issue } from "../db/schema";

/**
 * Browser-compatible database queries using typed API endpoints
 * These call the server-side API routes which use src/db/queries.ts
 */

export async function getAllIssues(): Promise<Issue[]> {
  const response = await fetch("/api/issues");
  if (!response.ok) {
    throw new Error("Failed to fetch all issues");
  }
  const data = await response.json();
  return data.issues;
}

export async function getStartedIssues(): Promise<Issue[]> {
  const response = await fetch("/api/issues/started");
  if (!response.ok) {
    throw new Error("Failed to fetch started issues");
  }
  const data = await response.json();
  return data.issues;
}

export async function getIssuesWithProjects(): Promise<Issue[]> {
  const response = await fetch("/api/issues/with-projects");
  if (!response.ok) {
    throw new Error("Failed to fetch issues with projects");
  }
  const data = await response.json();
  return data.issues || [];
}

export async function getStartedProjectIssuesWithAssignees(): Promise<Issue[]> {
  const response = await fetch("/api/issues/started/with-projects");
  if (!response.ok) {
    throw new Error("Failed to fetch started project issues");
  }
  const data = await response.json();
  return data.issues;
}

export async function getTotalIssueCount(): Promise<number> {
  const response = await fetch("/api/issues/count");
  if (!response.ok) {
    throw new Error("Failed to fetch issue count");
  }
  const data = await response.json();
  return data.count;
}

export async function getStartedIssuesByTeams(
  teamKeys: string[]
): Promise<Issue[]> {
  if (teamKeys.length === 0) return [];

  const teamsParam = teamKeys.join(",");
  const response = await fetch(
    `/api/issues/started/by-teams?teams=${encodeURIComponent(teamsParam)}`
  );
  if (!response.ok) {
    throw new Error("Failed to fetch issues by teams");
  }
  const data = await response.json();
  return data.issues;
}

export async function getAllProjects() {
  const response = await fetch("/api/projects");
  if (!response.ok) {
    throw new Error("Failed to fetch projects");
  }
  const data = await response.json();
  return data.projects;
}

export async function getProjectById(projectId: string) {
  const response = await fetch(`/api/projects/${projectId}`);
  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    throw new Error("Failed to fetch project");
  }
  const data = await response.json();
  return data.project;
}

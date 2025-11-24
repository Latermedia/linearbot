import type { Issue } from "../../db/schema";
import type { ProjectSummary } from "../project-data";

/**
 * Get total number of issues completed in the last N days across executive projects
 */
export function getTotalCompletedInPeriod(
  issues: Issue[],
  projectIds: string[],
  days: number = 14
): number {
  if (!issues || issues.length === 0 || projectIds.length === 0) return 0;

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  // Filter issues for executive projects
  const executiveIssues = issues.filter((i) =>
    i.project_id ? projectIds.includes(i.project_id) : false
  );

  // Count issues completed in the date range
  const recentlyCompleted = executiveIssues.filter((issue) => {
    const stateName = issue.state_name?.toLowerCase() || "";
    const isCompleted = stateName.includes("done") || stateName.includes("completed");
    if (!isCompleted) return false;

    const completedDate = issue.completed_at
      ? new Date(issue.completed_at)
      : issue.updated_at
      ? new Date(issue.updated_at)
      : null;

    return completedDate && completedDate >= cutoffDate;
  });

  return recentlyCompleted.length;
}

/**
 * Calculate recent velocity based on issues completed in the last N days
 * This gives a more accurate picture of current throughput than lifetime average velocity
 */
export function getRecentVelocity(
  issues: Issue[],
  projectIds: string[],
  days: number = 14
): number {
  if (!issues || issues.length === 0 || projectIds.length === 0) return 0;

  const completedCount = getTotalCompletedInPeriod(issues, projectIds, days);
  const weeks = days / 7;
  
  return completedCount / weeks;
}

/**
 * Get total number of unique active engineers across all executive projects
 */
export function getTotalActiveEngineers(projects: ProjectSummary[]): number {
  if (!projects || projects.length === 0) return 0;

  const allEngineers = new Set<string>();
  for (const project of projects) {
    for (const engineer of project.engineers) {
      allEngineers.add(engineer);
    }
  }

  return allEngineers.size;
}


import type { ProjectSummary } from "../project-data";
import type { Issue } from "../../db/schema";

/**
 * Format date as "MMM YYYY" (e.g., "Jan 2024")
 */
export function formatDate(dateStr: string | null): string {
  if (!dateStr) return "N/A";
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

/**
 * Format date as "MMM D, YYYY" (e.g., "Jan 15, 2024")
 */
export function formatDateFull(date: Date | string | null): string {
  if (!date) return "N/A";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Format date as relative time (e.g., "Today", "2d ago", "3w ago")
 */
export function formatRelativeDate(dateStr: string | null): string {
  if (!dateStr) return "N/A";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

/**
 * Format comment recency (time since last comment) in hours/days
 * Returns "Never" if no comment, or relative time like "2h ago", "3d ago"
 */
export function formatCommentRecency(lastCommentAt: string | null): string {
  if (!lastCommentAt) return "Never";
  const lastComment = new Date(lastCommentAt);
  const now = new Date();
  const diffMs = now.getTime() - lastComment.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffHours < 1) return "<1h ago";
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "1d ago";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

/**
 * Calculate progress percentage (rounded)
 */
export function getProgressPercent(project: ProjectSummary): number {
  if (!project.totalIssues || project.totalIssues === 0) return 0;
  return Math.round((project.completedIssues / project.totalIssues) * 100);
}

/**
 * Calculate completed percentage (decimal)
 */
export function getCompletedPercent(project: ProjectSummary): number {
  if (!project.totalIssues || project.totalIssues === 0) return 0;
  return (project.completedIssues / project.totalIssues) * 100;
}

/**
 * Calculate WIP (work in progress) percentage
 */
export function getWIPPercent(project: ProjectSummary): number {
  if (!project.totalIssues || project.totalIssues === 0) return 0;
  return (project.inProgressIssues / project.totalIssues) * 100;
}

/**
 * Check if project has health issues (status mismatch, stale update, or missing lead)
 */
export function hasHealthIssues(project: ProjectSummary): boolean {
  return (
    project.hasStatusMismatch || project.isStaleUpdate || project.missingLead
  );
}

/**
 * Alias for hasHealthIssues (used in GanttChart as hasDiscrepancies)
 */
export const hasDiscrepancies = hasHealthIssues;

/**
 * Get backlog count (issues in backlog/todo/unstarted states)
 */
export function getBacklogCount(project: ProjectSummary): number {
  const backlogStates = ["backlog", "todo", "unstarted"];
  let count = 0;
  for (const [state, stateCount] of project.issuesByState) {
    if (backlogStates.includes(state.toLowerCase())) {
      count += stateCount;
    }
  }
  return count;
}

/**
 * Get violation summary as array of strings
 * Returns empty array if no violations
 */
export function getViolationSummary(project: ProjectSummary): string[] {
  const violations: string[] = [];

  // Project-level violations
  if (project.missingLead) {
    violations.push("Missing project lead");
  }
  if (project.isStaleUpdate) {
    violations.push("Missing project update (7+ days)");
  }
  if (project.hasStatusMismatch) {
    violations.push("Status mismatch");
  }
  if (project.missingHealth) {
    violations.push("Missing project health");
  }

  // Issue-level violations (only include if count > 0)
  if (project.missingEstimateCount > 0) {
    violations.push(`${project.missingEstimateCount} missing points`);
  }
  if (project.missingPriorityCount > 0) {
    violations.push(`${project.missingPriorityCount} missing priority`);
  }
  if (project.noRecentCommentCount > 0) {
    violations.push(`${project.noRecentCommentCount} no recent comment`);
  }
  if (project.wipAgeViolationCount > 0) {
    violations.push(`${project.wipAgeViolationCount} WIP age violation`);
  }
  if (project.missingDescriptionCount > 0) {
    violations.push(`${project.missingDescriptionCount} missing description`);
  }

  return violations;
}

/**
 * Get health display configuration for badges
 */
export function getHealthDisplay(health: string | null): {
  text: string;
  variant: "default" | "destructive" | "secondary" | "outline";
  colorClass: string;
} {
  if (!health) {
    return { text: "—", variant: "outline", colorClass: "" };
  }

  const healthLower = health.toLowerCase();
  if (healthLower === "ontrack" || healthLower === "on track") {
    return {
      text: "On Track",
      variant: "default",
      colorClass: "!text-green-600 dark:!text-green-500",
    };
  }
  if (healthLower === "atrisk" || healthLower === "at risk") {
    return {
      text: "At Risk",
      variant: "default",
      colorClass: "!text-amber-600 dark:!text-amber-500",
    };
  }
  if (healthLower === "offtrack" || healthLower === "off track") {
    return { text: "Off Track", variant: "destructive", colorClass: "" };
  }

  // Fallback for any other values
  return { text: health, variant: "outline", colorClass: "" };
}

/**
 * Calculate total points (sum of estimates) from issues
 */
export function calculateTotalPoints(issues: Issue[]): {
  total: number;
  missing: number;
} {
  let total = 0;
  let missing = 0;
  for (const issue of issues) {
    if (issue.estimate === null || issue.estimate === undefined) {
      missing++;
    } else {
      total += issue.estimate;
    }
  }
  return { total, missing };
}

/**
 * Calculate average cycle time (time from started to completed) in days
 */
export function calculateAverageCycleTime(issues: Issue[]): number | null {
  const completedIssues = issues.filter((issue) => {
    const stateName = issue.state_name?.toLowerCase() || "";
    return stateName.includes("done") || stateName.includes("completed");
  });

  if (completedIssues.length === 0) return null;

  let totalDays = 0;
  let count = 0;

  for (const issue of completedIssues) {
    // Use started_at if available, otherwise fallback to created_at
    const startTime = issue.started_at 
      ? new Date(issue.started_at).getTime()
      : new Date(issue.created_at).getTime();
    const completedTime = issue.completed_at
      ? new Date(issue.completed_at).getTime()
      : new Date(issue.updated_at).getTime();
    const days = (completedTime - startTime) / (1000 * 60 * 60 * 24);
    if (days > 0) {
      totalDays += days;
      count++;
    }
  }

  return count > 0 ? totalDays / count : null;
}

/**
 * Calculate average lead time (time from created to completed) in days
 */
export function calculateAverageLeadTime(issues: Issue[]): number | null {
  const completedIssues = issues.filter((issue) => {
    const stateName = issue.state_name?.toLowerCase() || "";
    return stateName.includes("done") || stateName.includes("completed");
  });

  if (completedIssues.length === 0) return null;

  let totalDays = 0;
  let count = 0;

  for (const issue of completedIssues) {
    const createdTime = new Date(issue.created_at).getTime();
    const completedTime = issue.completed_at
      ? new Date(issue.completed_at).getTime()
      : new Date(issue.updated_at).getTime();
    const days = (completedTime - createdTime) / (1000 * 60 * 60 * 24);
    if (days > 0) {
      totalDays += days;
      count++;
    }
  }

  return count > 0 ? totalDays / count : null;
}

/**
 * Calculate project age in days
 */
export function calculateProjectAge(startDate: string | null): number | null {
  if (!startDate) return null;
  const start = new Date(startDate).getTime();
  const now = Date.now();
  return (now - start) / (1000 * 60 * 60 * 24);
}

/**
 * Format time in days (e.g., "4.6d", "5.8d")
 */
export function formatTimeDays(days: number | null): string {
  if (days === null) return "N/A";
  return `${days.toFixed(1)}d`;
}

/**
 * Format project age (e.g., "2mo", "3w")
 */
export function formatProjectAge(days: number | null): string {
  if (days === null) return "N/A";
  if (days < 7) return `${Math.round(days)}d`;
  if (days < 30) return `${Math.round(days / 7)}w`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${Math.round(days / 365)}y`;
}

/**
 * Calculate velocity (issues completed per week)
 */
export function calculateVelocity(
  issues: Issue[],
  startDate: string | null
): number {
  const completedIssues = issues.filter((issue) => {
    const stateName = issue.state_name?.toLowerCase() || "";
    return stateName.includes("done") || stateName.includes("completed");
  });

  if (completedIssues.length === 0 || !startDate) return 0;

  const start = new Date(startDate).getTime();
  const now = Date.now();
  const weeks = Math.max(1, (now - start) / (1000 * 60 * 60 * 24 * 7));

  return completedIssues.length / weeks;
}

/**
 * Format velocity (e.g., "1.1 issues/week")
 */
export function formatVelocity(velocity: number): string {
  return `${velocity.toFixed(1)}`;
}

/**
 * Calculate velocity by team
 */
export function calculateVelocityByTeam(
  issues: Issue[],
  startDate: string | null
): Map<string, number> {
  const teamVelocities = new Map<string, number>();
  const teams = new Set(issues.map((i) => i.team_key));

  for (const team of teams) {
    const teamIssues = issues.filter((i) => i.team_key === team);
    const velocity = calculateVelocity(teamIssues, startDate);
    if (velocity > 0) {
      teamVelocities.set(team, velocity);
    }
  }

  return teamVelocities;
}

/**
 * Calculate Linear progress by points (completed points / total points)
 */
export function calculateLinearProgress(issues: Issue[]): number | null {
  const { total, missing } = calculateTotalPoints(issues);
  if (total === 0) return null;

  const completedIssues = issues.filter((issue) => {
    const stateName = issue.state_name?.toLowerCase() || "";
    return stateName.includes("done") || stateName.includes("completed");
  });

  let completedPoints = 0;
  for (const issue of completedIssues) {
    if (issue.estimate !== null && issue.estimate !== undefined) {
      completedPoints += issue.estimate;
    }
  }

  return total > 0 ? completedPoints / total : null;
}

/**
 * Format percentage (e.g., "92.5%")
 */
export function formatPercent(percent: number): string {
  return `${percent.toFixed(1)}%`;
}

/**
 * Calculate estimate accuracy (% of completed issues where actual cycle time was within 20% of estimated time)
 *
 * Linear's `estimate` field is story points (1, 2, 3, 5, 8), not days. To calculate accuracy,
 * we need to convert story points to estimated days. A common conversion is:
 * - 1 story point ≈ 0.5-1 day
 * - 2 story points ≈ 1-2 days
 * - 3 story points ≈ 2-3 days
 * - 5 story points ≈ 3-5 days
 * - 8 story points ≈ 5-8 days
 *
 * We'll use a simple conversion: 1 story point = 1 day (can be adjusted based on team velocity)
 */
export function calculateEstimateAccuracy(issues: Issue[]): number | null {
  const completedIssues = issues
    .filter((issue) => {
      const stateName = issue.state_name?.toLowerCase() || "";
      return stateName.includes("done") || stateName.includes("completed");
    })
    .filter((issue) => issue.estimate !== null && issue.estimate !== undefined);

  if (completedIssues.length === 0) return null;

  // Calculate average days per story point from completed issues to calibrate
  let totalStoryPoints = 0;
  let totalDays = 0;
  let issuesWithData = 0;

  for (const issue of completedIssues) {
    if (!issue.estimate) continue;

    // Use cycle time (started → completed) if available, otherwise fallback to created → updated
    const startTime = issue.started_at 
      ? new Date(issue.started_at).getTime()
      : new Date(issue.created_at).getTime();
    const completedTime = issue.completed_at
      ? new Date(issue.completed_at).getTime()
      : new Date(issue.updated_at).getTime();
    const actualDays = (completedTime - startTime) / (1000 * 60 * 60 * 24);

    if (actualDays > 0) {
      totalStoryPoints += issue.estimate;
      totalDays += actualDays;
      issuesWithData++;
    }
  }

  if (issuesWithData === 0) return null;

  // Calculate conversion factor: average days per story point
  const daysPerStoryPoint = totalDays / totalStoryPoints;

  // Now check accuracy using ratio-based scoring with partial credit
  // Accurate: within 20% variance (0.8x to 1.2x inclusive) = 1.0
  // Moderate: 20-70% variance (0.3-0.8x or 1.2-1.7x) = 0.5
  // Inaccurate: >70% variance (<0.3x or >1.7x) = 0.0
  let totalScore = 0;
  let issuesWithAccuracy = 0;

  for (const issue of completedIssues) {
    if (!issue.estimate) continue;

    const startTime = issue.started_at 
      ? new Date(issue.started_at).getTime()
      : new Date(issue.created_at).getTime();
    const completedTime = issue.completed_at
      ? new Date(issue.completed_at).getTime()
      : new Date(issue.updated_at).getTime();
    const actualDays = (completedTime - startTime) / (1000 * 60 * 60 * 24);

    if (actualDays <= 0) continue;

    const estimatedDays = issue.estimate * daysPerStoryPoint;
    if (estimatedDays <= 0) continue;

    const ratio = actualDays / estimatedDays;
    issuesWithAccuracy++;

    // Accurate: 0.8x to 1.2x inclusive (within 20% variance)
    if (ratio >= 0.8 && ratio <= 1.2) {
      totalScore += 1.0;
    }
    // Moderate: 0.3-0.8x or 1.2-1.7x (20-70% variance, matching yellow/amber color range)
    else if ((ratio >= 0.3 && ratio < 0.8) || (ratio > 1.2 && ratio <= 1.7)) {
      totalScore += 0.5;
    }
    // Inaccurate: <0.3x or >1.7x (>70% variance)
    else {
      totalScore += 0.0;
    }
  }

  if (issuesWithAccuracy === 0) return null;

  return (totalScore / issuesWithAccuracy) * 100;
}

/**
 * Get velocity trend display (increasing/decreasing/stable)
 */
export function getVelocityTrendDisplay(
  trend: "increasing" | "decreasing" | "stable" | "unknown"
): {
  icon: string;
  colorClass: string;
} {
  if (trend === "increasing") {
    return { icon: "→", colorClass: "text-green-500" };
  }
  if (trend === "decreasing") {
    return { icon: "←", colorClass: "text-red-500" };
  }
  return { icon: "—", colorClass: "text-neutral-500" };
}

/**
 * Calculate WIP age for an issue (time from started to now/completed)
 * 
 * For completed issues: Only calculate if started_at exists (we need to know when it was started)
 * For started issues: Use started_at if available, otherwise fallback to created_at
 */
export function calculateWIPAge(issue: Issue, isCompleted: boolean): number | null {
  // Only calculate for started or completed issues
  const stateName = issue.state_name?.toLowerCase() || "";
  const isStarted = issue.state_type === "started" || stateName.includes("progress") || stateName.includes("started");
  
  if (!isStarted && !isCompleted) return null;

  // For completed issues, we MUST have started_at to calculate WIP age
  // (can't use created_at fallback - that would give us lead time, not WIP age)
  if (isCompleted && !issue.started_at) {
    return null;
  }

  // Use started_at if available, otherwise fallback to created_at (for currently started issues only)
  const startTime = issue.started_at 
    ? new Date(issue.started_at).getTime()
    : (isStarted ? new Date(issue.created_at).getTime() : null);
  
  if (!startTime) return null;
  
  // For completed issues, use completed_at if available, otherwise updated_at
  // For started issues, use now
  const endTime = isCompleted
    ? (issue.completed_at ? new Date(issue.completed_at).getTime() : new Date(issue.updated_at).getTime())
    : Date.now();
  
  const days = (endTime - startTime) / (1000 * 60 * 60 * 24);
  return days > 0 ? days : null;
}

/**
 * Format WIP age as string (e.g., "5.2d", "12d")
 */
export function formatWIPAge(days: number | null): string {
  if (days === null) return "—";
  return `${days.toFixed(1)}d`;
}

/**
 * Calculate estimate accuracy ratio for a single issue
 * Returns ratio (actualDays / estimatedDays) or null if not applicable
 * Examples: 1.0 = perfect match, 1.2 = 20% over, 0.8 = 20% under
 */
export function calculateIssueAccuracyRatio(
  issue: Issue,
  daysPerStoryPoint: number
): number | null {
  if (!issue.estimate) return null;
  
  const stateName = issue.state_name?.toLowerCase() || "";
  const isCompleted = stateName.includes("done") || stateName.includes("completed");
  if (!isCompleted) return null;

  const startTime = issue.started_at 
    ? new Date(issue.started_at).getTime()
    : new Date(issue.created_at).getTime();
  const completedTime = issue.completed_at
    ? new Date(issue.completed_at).getTime()
    : new Date(issue.updated_at).getTime();
  const actualDays = (completedTime - startTime) / (1000 * 60 * 60 * 24);
  
  if (actualDays <= 0) return null;

  const estimatedDays = issue.estimate * daysPerStoryPoint;
  if (estimatedDays <= 0) return null;
  
  return actualDays / estimatedDays;
}

/**
 * Format accuracy ratio as string (e.g., "1.2x", "0.8x", "1.0x")
 */
export function formatAccuracyRatio(ratio: number | null): string {
  if (ratio === null) return "—";
  return `${ratio.toFixed(1)}x`;
}

/**
 * Get color class for accuracy ratio
 * Green: within 30% (0.7-1.3)
 * Yellow: 30-70% off (0.3-0.7 or 1.3-1.7)
 * Red: 70%+ off (< 0.3 or > 1.7)
 */
export function getAccuracyColorClass(ratio: number | null): string {
  if (ratio === null) return "text-neutral-500";
  
  // Green: within 30% (0.7 to 1.3 inclusive)
  if (ratio >= 0.7 && ratio <= 1.3) {
    return "text-green-400";
  } 
  // Yellow: 30-70% off (0.3-0.7 or 1.3-1.7)
  else if ((ratio >= 0.3 && ratio < 0.7) || (ratio > 1.3 && ratio <= 1.7)) {
    return "text-amber-400";
  } 
  // Red: 70%+ off
  else {
    return "text-red-400";
  }
}

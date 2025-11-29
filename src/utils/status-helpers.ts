import type { Issue } from "../db/schema.js";
import {
  WIP_THRESHOLDS,
  MULTI_PROJECT_THRESHOLDS,
  PROJECT_THRESHOLDS,
} from "../constants/thresholds.js";

export interface StatusInfo {
  emoji: string;
  label: string;
  color: string;
}

/**
 * Get WIP status badge based on issue count for an assignee
 * Thresholds: >= 8 critical, >= 6 warning, >= 4 ok, < 4 good
 */
export function getWIPStatus(count: number): StatusInfo {
  if (count >= WIP_THRESHOLDS.CRITICAL) {
    return { emoji: "●", label: "CRITICAL", color: "red" };
  } else if (count >= WIP_THRESHOLDS.WARNING) {
    return { emoji: "◉", label: "WARNING", color: "yellow" };
  } else if (count >= WIP_THRESHOLDS.OK) {
    return { emoji: "○", label: "OK", color: "white" };
  } else {
    return { emoji: "✓", label: "GOOD", color: "green" };
  }
}

/**
 * Get multi-project status badge based on project count
 * Thresholds: >= 4 critical, >= 3 warning, 2 caution, 1 focused
 */
export function getMultiProjectStatus(count: number): StatusInfo {
  if (count >= MULTI_PROJECT_THRESHOLDS.CRITICAL) {
    return { emoji: "●", label: "CRITICAL", color: "red" };
  } else if (count >= MULTI_PROJECT_THRESHOLDS.WARNING) {
    return { emoji: "◉", label: "WARNING", color: "yellow" };
  } else if (count === MULTI_PROJECT_THRESHOLDS.CAUTION) {
    return { emoji: "○", label: "CAUTION", color: "white" };
  } else {
    return { emoji: "✓", label: "FOCUSED", color: "green" };
  }
}

/**
 * Check if a project is active based on its issues
 * Active = has started issues OR recent activity (within 14 days)
 */
export function isProjectActive(issues: Issue[]): boolean {
  const hasStartedIssues = issues.some((i) => i.state_type === "started");
  const cutoffDate = new Date();
  cutoffDate.setDate(
    cutoffDate.getDate() - PROJECT_THRESHOLDS.RECENT_ACTIVITY_DAYS
  );
  const hasRecentActivity = issues.some(
    (i) => new Date(i.updated_at) > cutoffDate
  );
  return hasStartedIssues || hasRecentActivity;
}

/**
 * Check if a project has status mismatch
 * Mismatch = has started issues but project state is not "started" or "in progress"
 */
export function hasStatusMismatch(
  projectStateCategory: string | null,
  issues: Issue[]
): boolean {
  const hasStartedIssues = issues.some((i) => i.state_type === "started");
  const state = projectStateCategory?.toLowerCase() || "";
  const isProjectStarted =
    state.includes("progress") ||
    state.includes("started") ||
    state === "started";
  return hasStartedIssues && !isProjectStarted;
}

/**
 * Check if a project has stale updates (no activity in 7+ days)
 */
export function isStaleUpdate(lastActivityDate: string | null): boolean {
  if (!lastActivityDate) return true;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - PROJECT_THRESHOLDS.STALE_DAYS);
  return new Date(lastActivityDate) < cutoffDate;
}

/**
 * Check if a project is missing a lead
 * Missing = has active work or is in active state but no lead assigned
 */
export function isMissingLead(
  projectStateCategory: string | null,
  projectLeadName: string | null,
  issues: Issue[]
): boolean {
  const hasActiveWork = issues.some((i) => i.state_type === "started");
  const state = projectStateCategory?.toLowerCase() || "";
  const isActiveState =
    state.includes("progress") ||
    state.includes("started") ||
    state === "started";

  return (hasActiveWork || isActiveState) && !projectLeadName;
}

/**
 * Check if a project is in planned state
 * Planned = project_state_category contains "planned" (case-insensitive)
 */
export function isPlannedProject(projectStateCategory: string | null): boolean {
  if (!projectStateCategory) return false;
  return projectStateCategory.toLowerCase().includes("planned");
}

/**
 * Check if a project is completed in the last 6 months
 * Completed = project_state_category indicates completion AND completedAt/updatedAt within last 6 months
 */
export function isCompletedProject(
  projectStateCategory: string | null,
  completedAt: Date | string | null,
  updatedAt?: Date | string | null
): boolean {
  if (!projectStateCategory) return false;

  const state = projectStateCategory.toLowerCase();
  const isCompleted =
    state.includes("completed") ||
    state.includes("done") ||
    state === "canceled";

  if (!isCompleted) return false;

  // Check if completed/updated within last 6 months
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const completedDate = completedAt
    ? new Date(completedAt)
    : updatedAt
      ? new Date(updatedAt)
      : null;

  if (!completedDate) return false;

  return completedDate >= sixMonthsAgo;
}

/**
 * Check if a project has WIP (work in progress) issues
 * WIP = has at least one issue with state_type = "started"
 */
export function isWIPProject(issues: Issue[]): boolean {
  return issues.some((i) => i.state_type === "started");
}

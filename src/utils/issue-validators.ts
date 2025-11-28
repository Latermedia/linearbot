import type { Issue } from "../db/schema.js";
import { WIP_AGE_THRESHOLDS } from "../constants/thresholds.js";

/**
 * Get the cutoff date for business day comment checking
 * Monday: check since Thursday (72+ hours ago)
 * Tuesday: check since Friday (72+ hours ago)
 * Wednesday-Friday: check since previous business day (48+ hours ago)
 * Saturday/Sunday: same as Friday (check since Wednesday)
 */
function getBusinessDayCutoff(): Date {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const cutoff = new Date(now);

  if (dayOfWeek === 0) {
    // Sunday: check since Thursday (4 days ago, but only 1 business day, same as Monday)
    cutoff.setDate(cutoff.getDate() - 4);
  } else if (dayOfWeek === 1) {
    // Monday: check since Thursday (4 days ago, but only 1 business day)
    cutoff.setDate(cutoff.getDate() - 4);
  } else if (dayOfWeek === 2) {
    // Tuesday: check since Friday (4 days ago, but only 1 business day)
    cutoff.setDate(cutoff.getDate() - 4);
  } else {
    // Wednesday-Friday, Saturday: check since previous business day (2 days ago)
    cutoff.setDate(cutoff.getDate() - 2);
  }

  // Set to end of day to be inclusive
  cutoff.setHours(23, 59, 59, 999);
  return cutoff;
}

/**
 * Check if issue has no recent comment (using business days only)
 * Monday: checks for comment since Thursday (72+ hours)
 * Tuesday: checks for comment since Friday (72+ hours)
 * Wednesday-Friday: checks for comment since previous business day (48+ hours)
 */
export function hasNoRecentComment(
  issue: Issue,
  hoursThreshold?: number // Deprecated, kept for API compatibility
): boolean {
  if (!issue.last_comment_at) return true;
  const lastComment = new Date(issue.last_comment_at);
  const cutoff = getBusinessDayCutoff();
  return lastComment < cutoff;
}

/**
 * Check if issue is missing an estimate
 */
export function hasMissingEstimate(issue: Issue): boolean {
  return !issue.estimate;
}

/**
 * Check if issue is missing priority (priority = 0)
 */
export function hasMissingPriority(issue: Issue): boolean {
  return issue.priority === 0;
}

/**
 * Get violation indicators as emoji string for an issue
 * Returns string with space-separated emoji indicators
 */
export function getViolationIndicators(issue: Issue): string {
  const indicators: string[] = [];
  if (hasMissingEstimate(issue)) indicators.push("📏"); // Missing estimate
  if (hasNoRecentComment(issue)) indicators.push("💬"); // No recent comment
  if (hasMissingPriority(issue)) indicators.push("🔴"); // Missing/zero priority
  return indicators.join(" ");
}

/**
 * Violation counts for a set of issues
 */
export interface ViolationCounts {
  missingEstimate: number;
  noRecentComment: number;
  missingPriority: number;
  total: number;
}

/**
 * Count all violations across a set of issues
 */
export function countViolations(issues: Issue[]): ViolationCounts {
  const missingEstimate = issues.filter(hasMissingEstimate).length;
  const noRecentComment = issues.filter(hasNoRecentComment).length;
  const missingPriority = issues.filter(hasMissingPriority).length;

  return {
    missingEstimate,
    noRecentComment,
    missingPriority,
    total: missingEstimate + noRecentComment + missingPriority,
  };
}

/**
 * Check if issue has WIP age violation (started >14 days ago)
 */
export function hasWIPAgeViolation(issue: Issue): boolean {
  if (!issue.started_at) return false;
  const startedDate = new Date(issue.started_at);
  const now = new Date();
  const daysDiff =
    (now.getTime() - startedDate.getTime()) / (1000 * 60 * 60 * 24);
  return daysDiff > WIP_AGE_THRESHOLDS.WIP_AGE_DAYS;
}

/**
 * Check if issue is missing description
 */
export function hasMissingDescription(issue: Issue): boolean {
  return !issue.description || issue.description.trim() === "";
}

/**
 * Check if issues have any violations
 */
export function hasViolations(issues: Issue[]): boolean {
  return issues.some(
    (issue) =>
      hasMissingEstimate(issue) ||
      hasNoRecentComment(issue) ||
      hasMissingPriority(issue)
  );
}

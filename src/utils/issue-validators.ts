import type { Issue } from "../db/schema.js";
import { COMMENT_THRESHOLDS } from "../constants/thresholds.js";

/**
 * Check if issue has no recent comment (>24 hours by default)
 */
export function hasNoRecentComment(
  issue: Issue,
  hoursThreshold: number = COMMENT_THRESHOLDS.RECENT_HOURS
): boolean {
  if (!issue.last_comment_at) return true;
  const lastComment = new Date(issue.last_comment_at);
  const now = new Date();
  const hoursDiff = (now.getTime() - lastComment.getTime()) / (1000 * 60 * 60);
  return hoursDiff > hoursThreshold;
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


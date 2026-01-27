import type { Issue, Project } from "../db/schema.js";
import { WIP_AGE_THRESHOLDS } from "../constants/thresholds.js";

/**
 * Get the cutoff date for business day comment checking (3 business days)
 * Excludes weekends from the calculation.
 *
 * Examples (3 business days back):
 * - Thursday: check since Monday (3 calendar days ago)
 * - Friday: check since Tuesday (3 calendar days ago)
 * - Saturday: check since Wednesday (3 calendar days ago)
 * - Sunday: check since Wednesday (4 calendar days ago)
 * - Monday: check since Wednesday (5 calendar days ago)
 * - Tuesday: check since Thursday (5 calendar days ago)
 * - Wednesday: check since Friday (5 calendar days ago)
 */
function getBusinessDayCutoff(): Date {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const cutoff = new Date(now);

  // Calculate calendar days to subtract for 3 business days
  // The formula accounts for weekends
  let daysToSubtract: number;

  switch (dayOfWeek) {
    case 0: // Sunday: 3 business days ago = Wednesday (4 calendar days)
      daysToSubtract = 4;
      break;
    case 1: // Monday: 3 business days ago = Wednesday (5 calendar days)
      daysToSubtract = 5;
      break;
    case 2: // Tuesday: 3 business days ago = Thursday (5 calendar days)
      daysToSubtract = 5;
      break;
    case 3: // Wednesday: 3 business days ago = Friday (5 calendar days)
      daysToSubtract = 5;
      break;
    case 4: // Thursday: 3 business days ago = Monday (3 calendar days)
      daysToSubtract = 3;
      break;
    case 5: // Friday: 3 business days ago = Tuesday (3 calendar days)
      daysToSubtract = 3;
      break;
    case 6: // Saturday: 3 business days ago = Wednesday (3 calendar days)
      daysToSubtract = 3;
      break;
    default:
      daysToSubtract = 3;
  }

  cutoff.setDate(cutoff.getDate() - daysToSubtract);

  // Set to end of day to be inclusive
  cutoff.setHours(23, 59, 59, 999);
  return cutoff;
}

/**
 * Check if issue has no recent comment (using 3 business days, excluding weekends)
 * A comment is considered "stale" if it's older than 3 business days.
 *
 * Only applies to WIP issues (state_type === "started")
 */
export function hasNoRecentComment(
  issue: Issue,
  _hoursThreshold?: number // Deprecated, kept for API compatibility
): boolean {
  // Only check comment recency for WIP issues
  if (issue.state_type !== "started") return false;
  // Suppress alerts for cancelled/duplicate issues
  if (shouldSuppressAlerts(issue)) return false;
  if (!issue.last_comment_at) return true;
  const lastComment = new Date(issue.last_comment_at);
  const cutoff = getBusinessDayCutoff();
  return lastComment < cutoff;
}

/**
 * Check if issue should have alerts suppressed (cancelled/duplicate states)
 */
export function shouldSuppressAlerts(issue: Issue): boolean {
  return isCancelledOrDuplicate(issue);
}

/**
 * Check if issue is cancelled or duplicate and should be excluded from progress calculations.
 * These issues should NOT be counted in:
 * - Total issue counts
 * - Progress bar calculations
 * - Velocity projections
 *
 * Linear uses state_type "canceled" for cancelled issues, and state_name may include
 * "cancel", "cancelled", or "duplicate".
 */
export function isCancelledOrDuplicate(issue: Issue): boolean {
  const stateName = issue.state_name?.toLowerCase() || "";
  return (
    stateName.includes("cancel") ||
    stateName.includes("duplicate") ||
    issue.state_type === "canceled"
  );
}

/**
 * Check if issue is missing an estimate
 * Note: 0-point estimates are valid (explicitly sized as zero)
 * Note: Sub-issues do not require estimates (optional)
 */
export function hasMissingEstimate(issue: Issue): boolean {
  // Exclude subissues from estimate warnings (estimates are optional for sub-issues)
  if (isSubissue(issue)) return false;
  // Suppress alerts for cancelled/duplicate issues
  if (shouldSuppressAlerts(issue)) return false;
  return issue.estimate === null;
}

/**
 * Check if issue is a subissue (has a parent)
 */
export function isSubissue(issue: Issue): boolean {
  return issue.parent_id !== null && issue.parent_id !== undefined;
}

/**
 * Check if a parent issue has incomplete subissues
 * Incomplete = not completed and not canceled
 */
export function hasIncompleteSubissues(
  parentId: string,
  allIssues: Issue[]
): boolean {
  const subissues = allIssues.filter((issue) => issue.parent_id === parentId);
  return subissues.some(
    (subissue) =>
      subissue.state_type !== "completed" && subissue.state_type !== "canceled"
  );
}

/**
 * Check if a parent issue has status mismatch (done but has incomplete subissues)
 * Computed on-the-fly, not persisted (following pattern of other issue-level warnings)
 */
export function hasSubissueStatusMismatch(
  issue: Issue,
  allIssues: Issue[]
): boolean {
  // Only check parent issues
  if (isSubissue(issue)) return false;

  // Check if issue is done/completed
  const stateName = issue.state_name?.toLowerCase() || "";
  const isDone =
    issue.state_type === "completed" ||
    stateName.includes("done") ||
    stateName.includes("completed");

  if (!isDone) return false;

  // Check if it has incomplete subissues
  return hasIncompleteSubissues(issue.id, allIssues);
}

/**
 * Check if issue is missing priority (priority = 0)
 * Excludes subissues from priority warnings
 */
export function hasMissingPriority(issue: Issue): boolean {
  // Exclude subissues from priority warnings
  if (isSubissue(issue)) return false;
  // Suppress alerts for cancelled/duplicate issues
  if (shouldSuppressAlerts(issue)) return false;
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
  if (hasMissingScopedLabel(issue)) indicators.push("🏷️"); // Missing scoped label
  return indicators.join(" ");
}

/**
 * Violation counts for a set of issues
 */
export interface ViolationCounts {
  missingEstimate: number;
  noRecentComment: number;
  missingPriority: number;
  missingScopedLabel: number;
  total: number;
}

/**
 * Count all violations across a set of issues
 */
export function countViolations(issues: Issue[]): ViolationCounts {
  const missingEstimate = issues.filter(hasMissingEstimate).length;
  const noRecentComment = issues.filter(hasNoRecentComment).length;
  const missingPriority = issues.filter(hasMissingPriority).length;
  const missingScopedLabel = issues.filter(hasMissingScopedLabel).length;

  return {
    missingEstimate,
    noRecentComment,
    missingPriority,
    missingScopedLabel,
    total:
      missingEstimate + noRecentComment + missingPriority + missingScopedLabel,
  };
}

/**
 * Check if issue has WIP age violation (in progress for >14 days)
 * Only applies to issues currently in "started" state, not completed issues.
 */
export function hasWIPAgeViolation(issue: Issue): boolean {
  // Suppress alerts for cancelled/duplicate issues
  if (shouldSuppressAlerts(issue)) return false;
  // Only check issues currently in progress (started state)
  if (issue.state_type !== "started") return false;
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
  // Suppress alerts for cancelled/duplicate issues
  if (shouldSuppressAlerts(issue)) return false;
  return !issue.description || issue.description.trim() === "";
}

/**
 * Check if issue is missing required scoped label
 * Required scoped label for issues is "type:" (with colon)
 * Note: Testing needed to verify API structure - scoped labels may appear as
 * parent.name === "scoped" with name === "type:", or may have different structure
 */
export function hasMissingScopedLabel(issue: Issue): boolean {
  // Suppress alerts for cancelled/duplicate issues
  if (shouldSuppressAlerts(issue)) return false;

  // If no labels, it's missing
  if (!issue.labels) return true;

  try {
    const labels = JSON.parse(issue.labels) as Array<{
      name: string;
      parent?: { name: string } | null;
    }>;

    // Check if any label has parent.name === "scoped" AND name starts with "type:"
    const hasTypeLabel = labels.some(
      (label) =>
        label.parent?.name === "scoped" && label.name.startsWith("type:")
    );

    return !hasTypeLabel;
  } catch (error) {
    // If JSON parsing fails, consider it missing
    console.error("Failed to parse labels JSON:", error);
    return true;
  }
}

/**
 * Check if issues have any violations
 */
export function hasViolations(issues: Issue[]): boolean {
  return issues.some(
    (issue) =>
      hasMissingEstimate(issue) ||
      hasNoRecentComment(issue) ||
      hasMissingPriority(issue) ||
      hasMissingScopedLabel(issue)
  );
}

/**
 * Required RICE scoped labels for projects
 */
const REQUIRED_RICE_LABELS = [
  "RICE - Confidence:",
  "RICE - Effort Project Size:",
  "RICE - Impact:",
  "RICE - Reach:",
];

/**
 * Check if project is missing required RICE scoped labels
 * Required labels:
 * - RICE - Confidence:
 * - RICE - Effort Project Size:
 * - RICE - Impact:
 * - RICE - Reach:
 * Note: Testing needed to verify API structure - scoped labels may appear as
 * parent.name === "scoped" with names matching the RICE labels above, or may have different structure
 */
export function hasMissingProjectScopedLabels(project: Project): boolean {
  // If no labels, it's missing
  if (!project.labels) return true;

  try {
    const labels = JSON.parse(project.labels) as Array<{
      name: string;
      parent?: { name: string } | null;
    }>;

    // Check if all required RICE labels are present
    // Labels should have parent.name === "scoped" and name matching one of the required labels
    const foundLabels = new Set<string>();
    for (const label of labels) {
      if (label.parent?.name === "scoped") {
        // Check if this label matches any of the required RICE labels
        for (const requiredLabel of REQUIRED_RICE_LABELS) {
          if (
            label.name === requiredLabel ||
            label.name.startsWith(requiredLabel)
          ) {
            foundLabels.add(requiredLabel);
            break;
          }
        }
      }
    }

    // Return true if any required label is missing
    return foundLabels.size < REQUIRED_RICE_LABELS.length;
  } catch (error) {
    // If JSON parsing fails, consider it missing
    console.error("Failed to parse project labels JSON:", error);
    return true;
  }
}

/**
 * Quality Health Pillar Calculation
 *
 * Core Question: Are we building stable or creating debt?
 * Core Metric: Composite score based on bug metrics
 *
 * Metrics:
 * - Total open bugs
 * - Bugs opened in period (14 days)
 * - Bugs closed in period (14 days)
 * - Net bug change (opened - closed)
 * - Average age of open bugs
 * - Max age of open bugs
 *
 * Composite Score (0-100, higher = healthier):
 * - 30% weight: Open bug count penalty
 * - 40% weight: Net bug change penalty
 * - 30% weight: Average age penalty
 */

import type { Issue } from "../../db/schema.js";
import type {
  QualityHealthV1,
  PillarStatus,
} from "../../types/metrics-snapshot.js";

/** Default measurement period in days */
const DEFAULT_PERIOD_DAYS = 14;

/** Composite score thresholds */
const HEALTHY_SCORE_THRESHOLD = 70;
const WARNING_SCORE_THRESHOLD = 40;

/**
 * Label structure from Linear's API
 */
interface LabelData {
  id?: string;
  name: string;
  parent?: {
    id?: string;
    name: string;
  } | null;
}

/**
 * Check if an issue has a bug label
 *
 * Matches:
 * 1. Scoped label "type: bug" (name="bug" with parent.name="type")
 * 2. Any label containing "bug" in the name (e.g., "Social Bug", "Influence Brand Bug")
 *
 * @param issue - The issue to check
 * @returns true if the issue has a bug label
 */
export function isBugIssue(issue: Issue): boolean {
  if (!issue.labels) return false;

  try {
    const labels = JSON.parse(issue.labels) as Array<string | LabelData>;

    return labels.some((label) => {
      // Handle string labels (legacy format)
      if (typeof label === "string") {
        return label.toLowerCase().includes("bug");
      }

      // Handle object labels
      const labelName = label.name?.toLowerCase() || "";

      // Match 1: Scoped label "type: bug" (name="bug" with parent.name="type")
      if (labelName === "bug" && label.parent?.name?.toLowerCase() === "type") {
        return true;
      }

      // Match 2: Any label containing "bug" in the name
      if (labelName.includes("bug")) {
        return true;
      }

      return false;
    });
  } catch {
    return false;
  }
}

/**
 * Check if an issue is open (not completed or canceled)
 */
export function isOpenIssue(issue: Issue): boolean {
  return issue.state_type !== "completed" && issue.state_type !== "canceled";
}

/**
 * Calculate the age of an issue in days
 *
 * @param issue - The issue to calculate age for
 * @returns Age in days since created
 */
export function calculateIssueAgeDays(issue: Issue): number {
  const createdAt = new Date(issue.created_at).getTime();
  const now = Date.now();
  return (now - createdAt) / (1000 * 60 * 60 * 24);
}

/**
 * Calculate composite quality score
 *
 * Weights:
 * - 30%: Open bug count (-2 points per open bug, max 100)
 * - 40%: Net bug change (-10 points per net new bug, max 100)
 * - 30%: Average age (-1 point per day average age, max 100)
 *
 * @param openCount - Number of open bugs
 * @param netChange - Net bugs added (opened - closed)
 * @param avgAge - Average age of open bugs in days
 * @returns Score from 0-100 (higher = healthier)
 */
export function calculateCompositeScore(
  openCount: number,
  netChange: number,
  avgAge: number
): number {
  // Calculate individual scores (0-100 each)
  const openCountScore = Math.max(0, 100 - openCount * 2);
  const netChangeScore = Math.max(0, 100 - netChange * 10);
  const ageScore = Math.max(0, 100 - avgAge * 1);

  // Apply weights
  const weightedScore =
    openCountScore * 0.3 + netChangeScore * 0.4 + ageScore * 0.3;

  return Math.round(weightedScore);
}

/**
 * Determine quality status from composite score
 */
export function getQualityStatus(compositeScore: number): PillarStatus {
  if (compositeScore >= HEALTHY_SCORE_THRESHOLD) return "healthy";
  if (compositeScore >= WARNING_SCORE_THRESHOLD) return "warning";
  return "critical";
}

/**
 * Calculate Quality Health metrics from issues data
 *
 * @param issues - All issues to analyze
 * @param periodDays - Measurement period in days (default 14)
 * @param issueFilter - Optional filter function to scope to specific issues
 * @returns QualityHealthV1 metrics object
 */
export function calculateQualityHealth(
  issues: Issue[],
  periodDays: number = DEFAULT_PERIOD_DAYS,
  issueFilter?: (issue: Issue) => boolean
): QualityHealthV1 {
  const now = Date.now();
  const periodStart = now - periodDays * 24 * 60 * 60 * 1000;

  // Apply filter if provided
  const filteredIssues = issueFilter ? issues.filter(issueFilter) : issues;

  // Get all bug issues
  const bugIssues = filteredIssues.filter(isBugIssue);

  // Open bugs (not completed/canceled)
  const openBugs = bugIssues.filter(isOpenIssue);

  // Bugs opened in period
  const bugsOpened = bugIssues.filter(
    (b) => new Date(b.created_at).getTime() >= periodStart
  );

  // Bugs closed in period
  const bugsClosed = bugIssues.filter(
    (b) => b.completed_at && new Date(b.completed_at).getTime() >= periodStart
  );

  // Calculate ages
  const bugAges = openBugs.map(calculateIssueAgeDays);
  const avgAge =
    bugAges.length > 0
      ? bugAges.reduce((a, b) => a + b, 0) / bugAges.length
      : 0;
  const maxAge = bugAges.length > 0 ? Math.max(...bugAges) : 0;

  // Calculate net change
  const netChange = bugsOpened.length - bugsClosed.length;

  // Calculate composite score
  const compositeScore = calculateCompositeScore(
    openBugs.length,
    netChange,
    avgAge
  );

  // Determine status
  const status = getQualityStatus(compositeScore);

  return {
    openBugCount: openBugs.length,
    bugsOpenedInPeriod: bugsOpened.length,
    bugsClosedInPeriod: bugsClosed.length,
    netBugChange: netChange,
    averageBugAgeDays: Math.round(avgAge * 10) / 10,
    maxBugAgeDays: Math.round(maxAge * 10) / 10,
    compositeScore,
    status,
  };
}

/**
 * Calculate Quality Health for a specific team
 *
 * @param teamKey - The team key to filter by
 * @param issues - All issues
 * @param periodDays - Measurement period in days
 * @returns QualityHealthV1 for the team
 */
export function calculateQualityHealthForTeam(
  teamKey: string,
  issues: Issue[],
  periodDays: number = DEFAULT_PERIOD_DAYS
): QualityHealthV1 {
  return calculateQualityHealth(
    issues,
    periodDays,
    (issue) => issue.team_key.toUpperCase() === teamKey.toUpperCase()
  );
}

/**
 * Calculate Quality Health for a domain
 *
 * @param domainTeamKeys - Array of team keys in the domain
 * @param issues - All issues
 * @param periodDays - Measurement period in days
 * @returns QualityHealthV1 for the domain
 */
export function calculateQualityHealthForDomain(
  domainTeamKeys: string[],
  issues: Issue[],
  periodDays: number = DEFAULT_PERIOD_DAYS
): QualityHealthV1 {
  const domainKeysUpper = domainTeamKeys.map((k) => k.toUpperCase());

  return calculateQualityHealth(issues, periodDays, (issue) =>
    domainKeysUpper.includes(issue.team_key.toUpperCase())
  );
}

/**
 * Get the oldest open bugs
 *
 * @param issues - All issues
 * @param limit - Maximum number of bugs to return
 * @returns Array of oldest open bugs with their age
 */
export function getOldestOpenBugs(
  issues: Issue[],
  limit: number = 10
): { issue: Issue; ageDays: number }[] {
  const openBugs = issues.filter((i) => isBugIssue(i) && isOpenIssue(i));

  return openBugs
    .map((issue) => ({
      issue,
      ageDays: calculateIssueAgeDays(issue),
    }))
    .sort((a, b) => b.ageDays - a.ageDays)
    .slice(0, limit);
}

/**
 * Get bug trends over time
 *
 * @param issues - All issues
 * @param periods - Number of periods to calculate
 * @param periodDays - Days per period
 * @returns Array of net bug changes per period (oldest first)
 */
export function getBugTrends(
  issues: Issue[],
  periods: number = 4,
  periodDays: number = 7
): { periodStart: Date; periodEnd: Date; netChange: number }[] {
  const now = Date.now();
  const results: { periodStart: Date; periodEnd: Date; netChange: number }[] =
    [];

  const bugIssues = issues.filter(isBugIssue);

  for (let i = periods - 1; i >= 0; i--) {
    const periodEnd = now - i * periodDays * 24 * 60 * 60 * 1000;
    const periodStart = periodEnd - periodDays * 24 * 60 * 60 * 1000;

    const opened = bugIssues.filter((b) => {
      const createdAt = new Date(b.created_at).getTime();
      return createdAt >= periodStart && createdAt < periodEnd;
    });

    const closed = bugIssues.filter((b) => {
      if (!b.completed_at) return false;
      const completedAt = new Date(b.completed_at).getTime();
      return completedAt >= periodStart && completedAt < periodEnd;
    });

    results.push({
      periodStart: new Date(periodStart),
      periodEnd: new Date(periodEnd),
      netChange: opened.length - closed.length,
    });
  }

  return results;
}

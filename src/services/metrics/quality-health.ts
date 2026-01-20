/**
 * Quality Health Pillar Calculation
 *
 * Core Question: Are we building stable or creating debt?
 * Core Metric: Composite score based on bug metrics (per-engineer scaling)
 *
 * Metrics:
 * - Total open bugs (scaled per engineer)
 * - Bugs opened in period (14 days)
 * - Bugs closed in period (14 days)
 * - Net bug change (opened - closed, scaled per engineer)
 * - Average age of open bugs
 * - Max age of open bugs
 *
 * Composite Score (0-100, higher = healthier):
 * - 30% weight: Bugs per engineer penalty
 * - 40% weight: Net bug change per engineer penalty
 * - 30% weight: Average age penalty
 *
 * Status Thresholds (unified with all pillars):
 * - >= 90% = healthy
 * - 75-90% = warning
 * - < 75% = critical
 */

import type { Issue } from "../../db/schema.js";
import type { QualityHealthV1 } from "../../types/metrics-snapshot.js";
import { getPillarStatus } from "../../types/metrics-snapshot.js";

/** Default measurement period in days */
const DEFAULT_PERIOD_DAYS = 14;

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
 * Per-engineer scaling thresholds for quality score
 *
 * These determine when each component score hits zero:
 * - BUG_PENALTY_PER_ENG: 12 → score = 0 at ~8.3 bugs per engineer
 * - NET_PENALTY_PER_ENG: 200 → score = 0 at 0.5 net new bugs per engineer (14 days)
 * - AGE_PENALTY_PER_DAY: 0.5 → score = 0 at 200 days average age
 */
const BUG_PENALTY_PER_ENG = 12;
const NET_PENALTY_PER_ENG = 200;
const AGE_PENALTY_PER_DAY = 0.5;

/**
 * Calculate composite quality score (per-engineer scaling)
 *
 * Weights:
 * - 30%: Bugs per engineer
 * - 40%: Net bug change per engineer (14 days)
 * - 30%: Average age of open bugs
 *
 * @param openCount - Number of open bugs
 * @param netChange - Net bugs added (opened - closed)
 * @param avgAge - Average age of open bugs in days
 * @param engineerCount - Number of engineers for scaling (defaults to 1)
 * @returns Score from 0-100 (higher = healthier)
 */
export function calculateCompositeScore(
  openCount: number,
  netChange: number,
  avgAge: number,
  engineerCount: number = 1
): number {
  const engCount = Math.max(1, engineerCount);

  // Per-engineer metrics
  const bugsPerEng = openCount / engCount;
  const netPerEng = netChange / engCount;

  // Calculate individual scores (0-100 each)
  const bugScore = Math.max(0, 100 - bugsPerEng * BUG_PENALTY_PER_ENG);
  const netScore = Math.max(0, 100 - netPerEng * NET_PENALTY_PER_ENG);
  const ageScore = Math.max(0, 100 - avgAge * AGE_PENALTY_PER_DAY);

  // Apply weights
  const weightedScore = bugScore * 0.3 + netScore * 0.4 + ageScore * 0.3;

  return Math.round(weightedScore);
}

/**
 * Determine quality status from composite score
 *
 * Uses unified threshold logic (same as WIP and Project Health):
 * - Score >= 90% = healthy
 * - Score 75-90% = warning
 * - Score < 75% = critical
 *
 * This provides a consistent UX where users know any pillar below 75% is critical.
 */
export function getQualityStatus(compositeScore: number) {
  // Use unified getPillarStatus with inverted score (100 - score = "violation %")
  return getPillarStatus(100 - compositeScore);
}

/**
 * Calculate Quality Health metrics from issues data
 *
 * @param issues - All issues to analyze
 * @param periodDays - Measurement period in days (default 14)
 * @param issueFilter - Optional filter function to scope to specific issues
 * @param engineerCount - Number of engineers for per-engineer scaling (default 1)
 * @returns QualityHealthV1 metrics object
 */
export function calculateQualityHealth(
  issues: Issue[],
  periodDays: number = DEFAULT_PERIOD_DAYS,
  issueFilter?: (issue: Issue) => boolean,
  engineerCount: number = 1
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

  // Calculate composite score (scaled by engineer count)
  const compositeScore = calculateCompositeScore(
    openBugs.length,
    netChange,
    avgAge,
    engineerCount
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
 * @param engineerCount - Number of engineers for per-engineer scaling
 * @returns QualityHealthV1 for the team
 */
export function calculateQualityHealthForTeam(
  teamKey: string,
  issues: Issue[],
  periodDays: number = DEFAULT_PERIOD_DAYS,
  engineerCount: number = 1
): QualityHealthV1 {
  return calculateQualityHealth(
    issues,
    periodDays,
    (issue) => issue.team_key.toUpperCase() === teamKey.toUpperCase(),
    engineerCount
  );
}

/**
 * Calculate Quality Health for a domain
 *
 * @param domainTeamKeys - Array of team keys in the domain
 * @param issues - All issues
 * @param periodDays - Measurement period in days
 * @param engineerCount - Number of engineers for per-engineer scaling
 * @returns QualityHealthV1 for the domain
 */
export function calculateQualityHealthForDomain(
  domainTeamKeys: string[],
  issues: Issue[],
  periodDays: number = DEFAULT_PERIOD_DAYS,
  engineerCount: number = 1
): QualityHealthV1 {
  const domainKeysUpper = domainTeamKeys.map((k) => k.toUpperCase());

  return calculateQualityHealth(
    issues,
    periodDays,
    (issue) => domainKeysUpper.includes(issue.team_key.toUpperCase()),
    engineerCount
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

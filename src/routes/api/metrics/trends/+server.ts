import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  getMetricsSnapshotTrend,
  getMetricsSnapshotsByDateRange,
} from "../../../../db/queries.js";
import {
  safeParseMetricsSnapshot,
  type PillarStatus,
  type ProductivityStatus,
} from "../../../../types/metrics-snapshot.js";

/**
 * Complete trend data point with ALL metrics from snapshot.
 * Enables comprehensive hover state for dissecting each pillar.
 */
export interface TrendDataPoint {
  capturedAt: string;

  /** Pillar 1: Team Health - Is work flowing or stuck? */
  teamHealth: {
    /** Percentage of ICs with healthy workloads (≤5 issues AND single project) */
    healthyWorkloadPercent: number;
    /** Number of ICs with healthy workloads */
    healthyIcCount: number;
    /** Total number of ICs */
    totalIcCount: number;
    /** Number of ICs with 6+ issues (WIP overload) */
    wipViolationCount: number;
    /** Number of ICs on 2+ projects (context switching) */
    multiProjectViolationCount: number;
    /** Number of projects impacted by any IC violation */
    impactedProjectCount: number;
    /** Total number of active projects */
    totalProjectCount: number;
    /** Overall status for this pillar */
    status: PillarStatus;
  };

  /** Pillar 2: Project Health - Are projects tracking to goal? */
  velocityHealth: {
    /** Percentage of projects on track */
    onTrackPercent: number;
    /** Percentage of projects at risk */
    atRiskPercent: number;
    /** Percentage of projects off track */
    offTrackPercent: number;
    /** Count of projects by health status */
    onTrackCount: number;
    atRiskCount: number;
    offTrackCount: number;
    totalProjectCount: number;
    /** Overall status for this pillar */
    status: PillarStatus;
  };

  /** Pillar 3: Team Productivity - Is output healthy and consistent? */
  productivity: {
    /** TrueThroughput score from GetDX (14-day total) */
    trueThroughput: number | null;
    /** Number of engineers */
    engineerCount: number | null;
    /** TrueThroughput per engineer (14-day) */
    trueThroughputPerEngineer: number | null;
    /** Overall status for this pillar */
    status: ProductivityStatus;
  };

  /** Pillar 4: Quality - Are we building stable or creating debt? */
  quality: {
    /** Composite score 0-100 (higher = healthier) */
    compositeScore: number;
    /** Total open bugs with "type: bug" label */
    openBugCount: number;
    /** Bugs opened in the measurement period (14 days) */
    bugsOpenedInPeriod: number;
    /** Bugs closed in the measurement period (14 days) */
    bugsClosedInPeriod: number;
    /** Net bug change (opened - closed); positive = growing backlog */
    netBugChange: number;
    /** Average age of open bugs in days */
    averageBugAgeDays: number;
    /** Age of the oldest open bug in days */
    maxBugAgeDays: number;
    /** Overall status for this pillar */
    status: PillarStatus;
  };

  /** Pillar 5: Linear Hygiene - Are we following tactical discipline? */
  linearHygiene?: {
    /** Hygiene score 0-100 (higher = healthier) */
    hygieneScore: number;
    /** Total gaps across all engineers and projects */
    totalGaps: number;
    /** Engineers with at least one gap */
    engineersWithGaps: number;
    /** Total engineers */
    totalEngineers: number;
    /** Projects with at least one gap */
    projectsWithGaps: number;
    /** Total projects */
    totalProjects: number;
    /** Overall status for this pillar */
    status: PillarStatus;
  };
}

export interface TrendsResponse {
  success: boolean;
  level: string;
  levelId: string | null;
  dataPoints?: TrendDataPoint[];
  error?: string;
}

/**
 * GET /api/metrics/trends
 *
 * Get metrics trend data for charting.
 *
 * Query params:
 * - level: 'org' | 'domain' | 'team' (optional, defaults to 'org')
 * - levelId: domain name or team key (required for domain/team levels)
 * - limit: number of snapshots to return (default 168 = 7 days of hourly)
 * - startDate: ISO date string for date range query
 * - endDate: ISO date string for date range query
 */
export const GET: RequestHandler = async ({ url }) => {
  try {
    const level = url.searchParams.get("level") || "org";
    const levelId = url.searchParams.get("levelId");
    const limitParam = url.searchParams.get("limit");
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");

    const limit = limitParam ? parseInt(limitParam, 10) : 168;

    // Validate level parameter
    if (!["org", "domain", "team"].includes(level)) {
      return json(
        {
          success: false,
          level,
          levelId,
          error: `Invalid level: ${level}. Must be 'org', 'domain', or 'team'.`,
        } satisfies TrendsResponse,
        { status: 400 }
      );
    }

    // Validate levelId for non-org levels
    if (level !== "org" && !levelId) {
      return json(
        {
          success: false,
          level,
          levelId,
          error: `levelId is required for level '${level}'`,
        } satisfies TrendsResponse,
        { status: 400 }
      );
    }

    // Get snapshots based on query type
    let snapshots;
    if (startDate && endDate) {
      // Date range query
      snapshots = getMetricsSnapshotsByDateRange(
        level as "org" | "domain" | "team",
        level === "org" ? null : levelId,
        startDate,
        endDate
      );
    } else {
      // Limit-based query
      snapshots = getMetricsSnapshotTrend(
        level as "org" | "domain" | "team",
        level === "org" ? null : levelId,
        limit
      );
    }

    // Parse and extract trend data points with ALL metrics
    const dataPoints: TrendDataPoint[] = [];

    for (const snapshot of snapshots) {
      const parsed = safeParseMetricsSnapshot(snapshot.metrics_json);
      if (!parsed) continue;

      // Extract productivity data if available
      const productivity = parsed.teamProductivity;
      const hasProductivityData = "trueThroughput" in productivity;

      // Calculate project counts from velocity health
      const projectStatuses = parsed.velocityHealth.projectStatuses;
      const onTrackCount = projectStatuses.filter(
        (p) => p.effectiveHealth === "onTrack"
      ).length;
      const atRiskCount = projectStatuses.filter(
        (p) => p.effectiveHealth === "atRisk"
      ).length;
      const offTrackCount = projectStatuses.filter(
        (p) => p.effectiveHealth === "offTrack"
      ).length;

      dataPoints.push({
        capturedAt: snapshot.captured_at,

        // Pillar 1: Team Health - complete data
        teamHealth: {
          healthyWorkloadPercent: parsed.teamHealth.healthyWorkloadPercent,
          healthyIcCount: parsed.teamHealth.healthyIcCount,
          totalIcCount: parsed.teamHealth.totalIcCount,
          wipViolationCount: parsed.teamHealth.wipViolationCount,
          multiProjectViolationCount:
            parsed.teamHealth.multiProjectViolationCount,
          impactedProjectCount: parsed.teamHealth.impactedProjectCount,
          totalProjectCount: parsed.teamHealth.totalProjectCount,
          status: parsed.teamHealth.status,
        },

        // Pillar 2: Project Health - complete data
        velocityHealth: {
          onTrackPercent: parsed.velocityHealth.onTrackPercent,
          atRiskPercent: parsed.velocityHealth.atRiskPercent,
          offTrackPercent: parsed.velocityHealth.offTrackPercent,
          onTrackCount,
          atRiskCount,
          offTrackCount,
          totalProjectCount: projectStatuses.length,
          status: parsed.velocityHealth.status,
        },

        // Pillar 3: Productivity - complete data
        productivity: {
          trueThroughput: hasProductivityData
            ? productivity.trueThroughput
            : null,
          engineerCount: hasProductivityData
            ? productivity.engineerCount
            : null,
          trueThroughputPerEngineer: hasProductivityData
            ? productivity.trueThroughputPerEngineer
            : null,
          status: productivity.status,
        },

        // Pillar 4: Quality - complete data
        quality: {
          compositeScore: parsed.quality.compositeScore,
          openBugCount: parsed.quality.openBugCount,
          bugsOpenedInPeriod: parsed.quality.bugsOpenedInPeriod,
          bugsClosedInPeriod: parsed.quality.bugsClosedInPeriod,
          netBugChange: parsed.quality.netBugChange,
          averageBugAgeDays: parsed.quality.averageBugAgeDays,
          maxBugAgeDays: parsed.quality.maxBugAgeDays,
          status: parsed.quality.status,
        },

        // Pillar 5: Linear Hygiene - complete data (optional for backward compat)
        ...(parsed.linearHygiene
          ? {
              linearHygiene: {
                hygieneScore: parsed.linearHygiene.hygieneScore,
                totalGaps: parsed.linearHygiene.totalGaps,
                engineersWithGaps: parsed.linearHygiene.engineersWithGaps,
                totalEngineers: parsed.linearHygiene.totalEngineers,
                projectsWithGaps: parsed.linearHygiene.projectsWithGaps,
                totalProjects: parsed.linearHygiene.totalProjects,
                status: parsed.linearHygiene.status,
              },
            }
          : {}),
      });
    }

    return json({
      success: true,
      level,
      levelId: level === "org" ? null : levelId,
      dataPoints,
    } satisfies TrendsResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[API] Error fetching metrics trends:", message);

    return json(
      {
        success: false,
        level: "org",
        levelId: null,
        error: message,
      } satisfies TrendsResponse,
      { status: 500 }
    );
  }
};

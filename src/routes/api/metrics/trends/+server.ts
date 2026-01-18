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

export interface TrendDataPoint {
  capturedAt: string;
  teamHealth: {
    icViolationPercent: number;
    projectViolationPercent: number;
    healthyWorkloadPercent: number;
    status: PillarStatus;
  };
  velocityHealth: {
    onTrackPercent: number;
    atRiskPercent: number;
    offTrackPercent: number;
    status: PillarStatus;
  };
  productivity: {
    trueThroughputPerEngineer: number | null;
    status: ProductivityStatus;
  };
  quality: {
    compositeScore: number;
    openBugCount: number;
    netBugChange: number;
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

    // Parse and extract trend data points
    const dataPoints: TrendDataPoint[] = [];

    for (const snapshot of snapshots) {
      const parsed = safeParseMetricsSnapshot(snapshot.metrics_json);
      if (!parsed) continue;

      // Extract productivity data if available
      const productivity = parsed.teamProductivity;
      const trueThroughputPerEngineer =
        "trueThroughput" in productivity
          ? productivity.trueThroughputPerEngineer
          : null;

      dataPoints.push({
        capturedAt: snapshot.captured_at,
        teamHealth: {
          icViolationPercent: parsed.teamHealth.icWipViolationPercent,
          projectViolationPercent: parsed.teamHealth.projectWipViolationPercent,
          healthyWorkloadPercent: parsed.teamHealth.healthyWorkloadPercent,
          status: parsed.teamHealth.status,
        },
        velocityHealth: {
          onTrackPercent: parsed.velocityHealth.onTrackPercent,
          atRiskPercent: parsed.velocityHealth.atRiskPercent,
          offTrackPercent: parsed.velocityHealth.offTrackPercent,
          status: parsed.velocityHealth.status,
        },
        productivity: {
          trueThroughputPerEngineer,
          status: productivity.status,
        },
        quality: {
          compositeScore: parsed.quality.compositeScore,
          openBugCount: parsed.quality.openBugCount,
          netBugChange: parsed.quality.netBugChange,
          status: parsed.quality.status,
        },
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

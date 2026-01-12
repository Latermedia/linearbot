/**
 * GetDX Snapshots Service
 *
 * Fetches TrueThroughput productivity metrics from the GetDX API.
 * Uses the queries.datafeed endpoint with a saved query for PR throughput.
 */

import {
  GetDXClient,
  isGetDXConfigured,
  isPRThroughputConfigured,
} from "./client.js";

/**
 * Team productivity data from GetDX
 */
export interface GetDXTeamProductivity {
  teamId: string;
  teamName: string;
  trueThroughput: number;
  engineerCount?: number;
  // Additional fields may be present - log for inspection
  [key: string]: unknown;
}

/**
 * Snapshot response from GetDX API
 * Note: This is a preliminary structure - the actual API response
 * will be logged for inspection and this type will be refined.
 */
export interface GetDXSnapshotResponse {
  teams?: GetDXTeamProductivity[];
  // The actual structure may differ - we'll log it for inspection
  [key: string]: unknown;
}

/**
 * Processed productivity metrics by team
 */
export interface ProductivityMetrics {
  teamId: string;
  teamName: string;
  trueThroughput: number;
  prCount: number;
  engineerCount: number | null;
  trueThroughputPerEngineer: number | null;
}

/**
 * Result of fetching productivity data
 */
export interface FetchProductivityResult {
  success: boolean;
  metrics: ProductivityMetrics[];
  error?: string;
  rawResponse?: unknown; // For debugging/inspection
}

/** Number of days of data to aggregate for productivity metrics */
const PRODUCTIVITY_PERIOD_DAYS = 14;

/**
 * Fetch TrueThroughput metrics from GetDX
 *
 * This function:
 * 1. Fetches PR throughput data from GetDX Data Cloud via queries.datafeed
 * 2. Aggregates the data by team over the last 14 days
 * 3. Returns productivity metrics per team (domain)
 */
export async function fetchProductivityMetrics(): Promise<FetchProductivityResult> {
  // Check if GetDX is configured
  if (!isGetDXConfigured()) {
    console.log("[GETDX] Not configured - GETDX_API_KEY not set");
    return {
      success: false,
      metrics: [],
      error: "GetDX not configured",
    };
  }

  // Check if PR throughput datafeed is configured
  if (!isPRThroughputConfigured()) {
    console.log(
      "[GETDX] PR Throughput not configured - GETDX_PR_THROUGHPUT_FEED_TOKEN not set"
    );
    return {
      success: false,
      metrics: [],
      error: "GetDX PR Throughput datafeed not configured",
    };
  }

  const client = GetDXClient.fromEnv();
  if (!client) {
    return {
      success: false,
      metrics: [],
      error: "Failed to create GetDX client",
    };
  }

  try {
    console.log("[GETDX] Fetching PR throughput from datafeed...");

    // Fetch aggregated throughput by team for the productivity period
    const result = await client.fetchPRThroughputByTeam(
      PRODUCTIVITY_PERIOD_DAYS
    );

    if (!result.ok) {
      console.error(`[GETDX] Failed to fetch PR throughput: ${result.error}`);
      return {
        success: false,
        metrics: [],
        error: result.error,
      };
    }

    // Convert Map to ProductivityMetrics array
    const metrics: ProductivityMetrics[] = [];
    for (const [teamName, data] of result.data) {
      metrics.push({
        teamId: teamName, // Use team name as ID since that's what we have
        teamName,
        trueThroughput: data.throughput,
        prCount: data.prCount,
        engineerCount: null, // Not available from datafeed
        trueThroughputPerEngineer: null, // Can't calculate without engineer count
      });
    }

    console.log(
      `[GETDX] Fetched ${metrics.length} team productivity records (${PRODUCTIVITY_PERIOD_DAYS} day period)`
    );

    return {
      success: true,
      metrics,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`[GETDX] Error fetching productivity: ${errorMessage}`);
    return {
      success: false,
      metrics: [],
      error: errorMessage,
    };
  }
}

/**
 * Get aggregate productivity for all teams (org level)
 */
export function aggregateOrgProductivity(metrics: ProductivityMetrics[]): {
  trueThroughput: number;
  prCount: number;
  engineerCount: number | null;
  trueThroughputPerEngineer: number | null;
} {
  if (metrics.length === 0) {
    return {
      trueThroughput: 0,
      prCount: 0,
      engineerCount: null,
      trueThroughputPerEngineer: null,
    };
  }

  const totalThroughput = metrics.reduce((sum, m) => sum + m.trueThroughput, 0);
  const totalPRCount = metrics.reduce((sum, m) => sum + m.prCount, 0);

  // Only calculate engineer totals if all teams have the data
  const hasAllEngineerCounts = metrics.every((m) => m.engineerCount !== null);
  const totalEngineers = hasAllEngineerCounts
    ? metrics.reduce((sum, m) => sum + (m.engineerCount || 0), 0)
    : null;

  const perEngineer =
    totalEngineers !== null && totalEngineers > 0
      ? totalThroughput / totalEngineers
      : null;

  return {
    trueThroughput: Math.round(totalThroughput * 100) / 100,
    prCount: totalPRCount,
    engineerCount: totalEngineers,
    trueThroughputPerEngineer: perEngineer,
  };
}

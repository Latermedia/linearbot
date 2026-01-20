/**
 * Team Productivity Pillar Calculation
 *
 * Core Question: Is output healthy and consistent?
 * Core Metric: TrueThroughput from GetDX
 *
 * Target: 3 TrueThroughput per week per IC (6 per 2-week period)
 *
 * Status Thresholds (unified with all pillars):
 * - >= 90% of target = healthy
 * - 75-90% of target = warning
 * - < 75% of target = critical
 */

import type { ProductivityMetrics } from "../getdx/index.js";
import {
  getDomainForGetDXTeam,
  hasGetDXMappings,
  logGetDXTeamsForMapping,
} from "../../utils/getdx-mapping.js";
import { getPillarStatus } from "../../types/metrics-snapshot.js";

/**
 * Productivity health status
 * Extends PillarStatus with "unknown" for unconfigured thresholds
 * and "pending" for teams without GetDX data
 */
export type ProductivityStatus =
  | "healthy"
  | "warning"
  | "critical"
  | "unknown"
  | "pending";

/**
 * Productivity health result for a single entity (org/domain)
 */
export interface ProductivityHealthResult {
  trueThroughput: number;
  engineerCount: number | null;
  trueThroughputPerEngineer: number | null;
  status: ProductivityStatus;
}

/**
 * Pending productivity result (for teams without GetDX data)
 */
export interface ProductivityPendingResult {
  status: "pending";
  notes: string;
}

/**
 * Default target for per-IC throughput (over 14-day period)
 * Target: 3 TrueThroughput per week per IC = 6 per 2 weeks
 */
const DEFAULT_PRODUCTIVITY_TARGET = 6;

/**
 * Get configured productivity target from environment
 * Falls back to default target if not configured
 */
function getProductivityTarget(): number {
  if (typeof process === "undefined" || !process.env) {
    return DEFAULT_PRODUCTIVITY_TARGET;
  }

  const target = process.env.GETDX_THROUGHPUT_PER_IC_TARGET;

  if (!target) {
    return DEFAULT_PRODUCTIVITY_TARGET;
  }

  const targetNum = parseFloat(target);

  if (isNaN(targetNum) || targetNum <= 0) {
    console.warn("[PRODUCTIVITY] Invalid target value - using default");
    return DEFAULT_PRODUCTIVITY_TARGET;
  }

  return targetNum;
}

/**
 * Determine status based on per-IC throughput using unified thresholds
 *
 * Normalizes throughput to a percentage of target, then uses the same
 * threshold logic as all other pillars:
 * - >= 90% of target = healthy
 * - 75-90% of target = warning
 * - < 75% of target = critical
 */
function getStatusFromPerICThroughput(
  throughputPerIC: number | null
): ProductivityStatus {
  if (throughputPerIC === null) {
    return "unknown";
  }

  const target = getProductivityTarget();

  // Normalize to percentage of target (capped at 100% for status calculation)
  const percentOfTarget = Math.min((throughputPerIC / target) * 100, 100);

  // Use unified getPillarStatus with inverted percentage
  return getPillarStatus(100 - percentOfTarget);
}

/**
 * Calculate Productivity Health for the organization
 *
 * Aggregates all GetDX team metrics into org-level productivity.
 * Uses IC count from Team Health to calculate per-IC throughput.
 *
 * @param metrics - All productivity metrics from GetDX
 * @param icCount - Optional IC count from Team Health pillar
 * @returns ProductivityHealthResult or null if no data
 */
export function calculateProductivityHealthForOrg(
  metrics: ProductivityMetrics[],
  icCount?: number
): ProductivityHealthResult | null {
  if (metrics.length === 0) {
    return null;
  }

  // Log teams for mapping configuration (helps with setup)
  if (!hasGetDXMappings()) {
    logGetDXTeamsForMapping(metrics);
  }

  // Aggregate all teams
  const totalThroughput = metrics.reduce((sum, m) => sum + m.trueThroughput, 0);

  // Use provided IC count, or fall back to GetDX engineer counts
  const engineerCount = icCount ?? null;

  const perEngineer =
    engineerCount !== null && engineerCount > 0
      ? totalThroughput / engineerCount
      : null;

  // Status uses unified percentage-based thresholds
  const status = getStatusFromPerICThroughput(perEngineer);

  return {
    trueThroughput: Math.round(totalThroughput * 10) / 10,
    engineerCount,
    trueThroughputPerEngineer:
      perEngineer !== null ? Math.round(perEngineer * 100) / 100 : null,
    status,
  };
}

/**
 * Calculate Productivity Health for a specific domain
 *
 * Filters GetDX teams by domain name matching (case-insensitive).
 * GetDX team names map directly to domain names (e.g., "Later Social" -> "Later Social").
 * Optionally uses GETDX_DOMAIN_MAPPINGS for custom mappings.
 *
 * @param domainName - The domain name
 * @param metrics - All productivity metrics from GetDX
 * @param icCount - Optional IC count from Team Health pillar
 * @returns ProductivityHealthResult or null if no data for domain
 */
export function calculateProductivityHealthForDomain(
  domainName: string,
  metrics: ProductivityMetrics[],
  icCount?: number
): ProductivityHealthResult | null {
  // Filter metrics to teams that match this domain
  const domainMetrics = metrics.filter((m) => {
    // Check explicit mapping first
    const mappedDomain =
      getDomainForGetDXTeam(m.teamId) || getDomainForGetDXTeam(m.teamName);
    if (mappedDomain === domainName) {
      return true;
    }

    // If no explicit mapping, check if team name matches domain name directly (case-insensitive)
    if (!hasGetDXMappings()) {
      return m.teamName.toLowerCase() === domainName.toLowerCase();
    }

    return false;
  });

  if (domainMetrics.length === 0) {
    // No GetDX teams matched to this domain
    return null;
  }

  // Aggregate domain teams
  const totalThroughput = domainMetrics.reduce(
    (sum, m) => sum + m.trueThroughput,
    0
  );

  // Use provided IC count from Team Health
  const engineerCount = icCount ?? null;

  const perEngineer =
    engineerCount !== null && engineerCount > 0
      ? totalThroughput / engineerCount
      : null;

  // Status uses unified percentage-based thresholds
  const status = getStatusFromPerICThroughput(perEngineer);

  return {
    trueThroughput: Math.round(totalThroughput * 10) / 10,
    engineerCount,
    trueThroughputPerEngineer:
      perEngineer !== null ? Math.round(perEngineer * 100) / 100 : null,
    status,
  };
}

/**
 * Get productivity result for a team (always pending for now)
 *
 * Team-level GetDX integration is planned for future work.
 * For now, teams always return a pending status.
 */
export function calculateProductivityHealthForTeam(): ProductivityPendingResult {
  return {
    status: "pending",
    notes: "Team-level GetDX integration pending",
  };
}

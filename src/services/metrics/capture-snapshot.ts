/**
 * Metrics Snapshot Capture Service
 *
 * Orchestrates the capture of Four Pillars metrics at org, domain, and team levels.
 * Called after each sync to create hourly snapshots.
 */

import {
  getAllProjects,
  getAllEngineers,
  getAllIssues,
  insertMetricsSnapshot,
  getSyncMetadata,
} from "../../db/queries.js";
import type { Project, Engineer, Issue } from "../../db/schema.js";
import {
  getAllDomains,
  getTeamsForDomain,
  getDomainMappings,
} from "../../utils/domain-mapping.js";
import {
  type MetricsSnapshotV1,
  type MetricsLevel,
  CURRENT_SCHEMA_VERSION,
} from "../../types/metrics-snapshot.js";
import {
  calculateTeamHealth,
  calculateTeamHealthForTeam,
  calculateTeamHealthForDomain,
} from "./team-health.js";
import {
  calculateVelocityHealth,
  calculateVelocityHealthForTeam,
  calculateVelocityHealthForDomain,
} from "./velocity-health.js";
import {
  calculateQualityHealth,
  calculateQualityHealthForTeam,
  calculateQualityHealthForDomain,
} from "./quality-health.js";

/**
 * Result of a snapshot capture operation
 */
export interface CaptureResult {
  success: boolean;
  snapshotsCreated: number;
  error?: string;
  details?: {
    org: boolean;
    domains: string[];
    teams: string[];
  };
}

/**
 * Build a complete metrics snapshot for a given scope
 */
function buildMetricsSnapshot(
  level: MetricsLevel,
  levelId: string | null,
  engineers: Engineer[],
  projects: Project[],
  issues: Issue[],
  capturedAt: string,
  syncedAt: string | null
): MetricsSnapshotV1 {
  // Calculate each pillar based on level
  let teamHealth;
  let velocityHealth;
  let qualityHealth;

  if (level === "org") {
    teamHealth = calculateTeamHealth(engineers, projects);
    velocityHealth = calculateVelocityHealth(projects);
    qualityHealth = calculateQualityHealth(issues);
  } else if (level === "domain" && levelId) {
    const domainTeamKeys = getTeamsForDomain(levelId);
    teamHealth = calculateTeamHealthForDomain(
      domainTeamKeys,
      engineers,
      projects,
      issues
    );
    velocityHealth = calculateVelocityHealthForDomain(domainTeamKeys, projects);
    qualityHealth = calculateQualityHealthForDomain(domainTeamKeys, issues);
  } else if (level === "team" && levelId) {
    teamHealth = calculateTeamHealthForTeam(
      levelId,
      engineers,
      projects,
      issues
    );
    velocityHealth = calculateVelocityHealthForTeam(levelId, projects);
    qualityHealth = calculateQualityHealthForTeam(levelId, issues);
  } else {
    // Fallback to org-level if something is wrong
    teamHealth = calculateTeamHealth(engineers, projects);
    velocityHealth = calculateVelocityHealth(projects);
    qualityHealth = calculateQualityHealth(issues);
  }

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION as 1,
    teamHealth,
    velocityHealth,
    teamProductivity: {
      status: "pending",
      notes: "Awaiting GetDX TrueThroughput integration",
    },
    quality: qualityHealth,
    metadata: {
      capturedAt,
      syncedAt,
      level,
      levelId,
    },
  };
}

/**
 * Get all unique team keys from projects
 */
function getAllTeamKeys(projects: Project[]): string[] {
  const teamKeys = new Set<string>();

  for (const project of projects) {
    try {
      const teams = JSON.parse(project.teams || "[]") as string[];
      for (const team of teams) {
        teamKeys.add(team);
      }
    } catch {
      // Invalid JSON, skip
    }
  }

  return Array.from(teamKeys);
}

/**
 * Capture metrics snapshots at all levels (org, domain, team)
 *
 * This function queries the current database state and creates snapshots
 * for the organization, each domain, and each team.
 *
 * @returns CaptureResult with details about what was captured
 */
export async function captureMetricsSnapshots(): Promise<CaptureResult> {
  const startTime = Date.now();
  console.log("[METRICS] Starting metrics snapshot capture...");

  try {
    // Get current data from database
    const projects = getAllProjects();
    const engineers = getAllEngineers();
    const issues = getAllIssues();
    const syncMetadata = getSyncMetadata();

    const capturedAt = new Date().toISOString();
    const syncedAt = syncMetadata?.last_sync_time || null;

    let snapshotsCreated = 0;
    const capturedDomains: string[] = [];
    const capturedTeams: string[] = [];

    // 1. Capture org-level snapshot
    console.log("[METRICS] Capturing org-level snapshot...");
    const orgSnapshot = buildMetricsSnapshot(
      "org",
      null,
      engineers,
      projects,
      issues,
      capturedAt,
      syncedAt
    );

    insertMetricsSnapshot({
      captured_at: capturedAt,
      schema_version: CURRENT_SCHEMA_VERSION,
      level: "org",
      level_id: null,
      metrics_json: JSON.stringify(orgSnapshot),
    });
    snapshotsCreated++;

    // 2. Capture domain-level snapshots
    const domains = getAllDomains();
    const domainMappings = getDomainMappings();
    const hasDomainConfig = Object.keys(domainMappings).length > 0;

    if (hasDomainConfig && domains.length > 0) {
      console.log(
        `[METRICS] Capturing ${domains.length} domain-level snapshots...`
      );

      for (const domain of domains) {
        const domainSnapshot = buildMetricsSnapshot(
          "domain",
          domain,
          engineers,
          projects,
          issues,
          capturedAt,
          syncedAt
        );

        insertMetricsSnapshot({
          captured_at: capturedAt,
          schema_version: CURRENT_SCHEMA_VERSION,
          level: "domain",
          level_id: domain,
          metrics_json: JSON.stringify(domainSnapshot),
        });
        snapshotsCreated++;
        capturedDomains.push(domain);
      }
    } else {
      console.log(
        "[METRICS] No domain mappings configured, skipping domain snapshots"
      );
    }

    // 3. Capture team-level snapshots
    const teamKeys = getAllTeamKeys(projects);
    console.log(
      `[METRICS] Capturing ${teamKeys.length} team-level snapshots...`
    );

    for (const teamKey of teamKeys) {
      const teamSnapshot = buildMetricsSnapshot(
        "team",
        teamKey,
        engineers,
        projects,
        issues,
        capturedAt,
        syncedAt
      );

      insertMetricsSnapshot({
        captured_at: capturedAt,
        schema_version: CURRENT_SCHEMA_VERSION,
        level: "team",
        level_id: teamKey,
        metrics_json: JSON.stringify(teamSnapshot),
      });
      snapshotsCreated++;
      capturedTeams.push(teamKey);
    }

    const duration = Date.now() - startTime;
    console.log(
      `[METRICS] Snapshot capture complete: ${snapshotsCreated} snapshots in ${duration}ms`
    );

    return {
      success: true,
      snapshotsCreated,
      details: {
        org: true,
        domains: capturedDomains,
        teams: capturedTeams,
      },
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`[METRICS] Snapshot capture failed: ${errorMessage}`);

    return {
      success: false,
      snapshotsCreated: 0,
      error: errorMessage,
    };
  }
}

/**
 * Capture a single org-level snapshot (for testing or manual capture)
 */
export async function captureOrgSnapshot(): Promise<MetricsSnapshotV1 | null> {
  try {
    const projects = getAllProjects();
    const engineers = getAllEngineers();
    const issues = getAllIssues();
    const syncMetadata = getSyncMetadata();

    const capturedAt = new Date().toISOString();
    const syncedAt = syncMetadata?.last_sync_time || null;

    return buildMetricsSnapshot(
      "org",
      null,
      engineers,
      projects,
      issues,
      capturedAt,
      syncedAt
    );
  } catch (error) {
    console.error("[METRICS] Failed to capture org snapshot:", error);
    return null;
  }
}

/**
 * Get a summary of the latest org-level metrics for logging
 */
export function getMetricsSummary(snapshot: MetricsSnapshotV1): string {
  const { teamHealth, velocityHealth, quality } = snapshot;

  const lines = [
    `Team Health: ${teamHealth.status.toUpperCase()} (${teamHealth.healthyIcCount}/${teamHealth.totalIcCount} ICs healthy, ${teamHealth.healthyProjectCount}/${teamHealth.totalProjectCount} projects healthy)`,
    `Velocity: ${velocityHealth.status.toUpperCase()} (${velocityHealth.onTrackPercent.toFixed(1)}% on track, ${velocityHealth.atRiskPercent.toFixed(1)}% at risk, ${velocityHealth.offTrackPercent.toFixed(1)}% off track)`,
    `Quality: ${quality.status.toUpperCase()} (Score: ${quality.compositeScore}, ${quality.openBugCount} open bugs, ${quality.netBugChange >= 0 ? "+" : ""}${quality.netBugChange} net)`,
    `Productivity: ${snapshot.teamProductivity.status.toUpperCase()} (${snapshot.teamProductivity.notes})`,
  ];

  return lines.join("\n");
}

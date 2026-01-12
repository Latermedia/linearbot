import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  getLatestMetricsSnapshot,
  getAllLatestMetricsSnapshots,
  getTeamNamesByKey,
} from "../../../../db/queries.js";
import {
  safeParseMetricsSnapshot,
  type MetricsSnapshotV1,
} from "../../../../types/metrics-snapshot.js";

export interface LatestMetricsResponse {
  success: boolean;
  snapshot?: MetricsSnapshotV1;
  snapshots?: {
    level: string;
    levelId: string | null;
    snapshot: MetricsSnapshotV1;
    capturedAt: string;
  }[];
  /** Mapping of team_key to team_name for display purposes */
  teamNames?: Record<string, string>;
  error?: string;
}

/**
 * Get ignored team keys from environment variable
 */
function getIgnoredTeamKeys(): Set<string> {
  const envValue = process.env.IGNORED_TEAM_KEYS;
  if (!envValue) return new Set();
  return new Set(envValue.split(",").map((key) => key.trim().toUpperCase()));
}

/**
 * Check if a team should be ignored
 */
function isIgnoredTeam(levelId: string | null): boolean {
  if (!levelId) return false;
  const ignored = getIgnoredTeamKeys();
  return ignored.has(levelId.toUpperCase());
}

/**
 * GET /api/metrics/latest
 *
 * Get the latest metrics snapshot(s).
 *
 * Query params:
 * - level: 'org' | 'domain' | 'team' (optional, defaults to 'org')
 * - levelId: domain name or team key (required for domain/team levels)
 * - all: 'true' to get all latest snapshots across all levels
 */
export const GET: RequestHandler = async ({ url }) => {
  try {
    const level = url.searchParams.get("level") || "org";
    const levelId = url.searchParams.get("levelId");
    const all = url.searchParams.get("all") === "true";

    // Return all latest snapshots
    if (all) {
      const allSnapshots = getAllLatestMetricsSnapshots();

      const results = allSnapshots
        .map((s) => {
          // Skip ignored teams
          if (s.level === "team" && isIgnoredTeam(s.level_id)) {
            return null;
          }

          const parsed = safeParseMetricsSnapshot(s.metrics_json);
          if (!parsed) return null;

          return {
            level: s.level,
            levelId: s.level_id,
            snapshot: parsed,
            capturedAt: s.captured_at,
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

      // Include team name mapping for display purposes (excluding ignored teams)
      const allTeamNames = getTeamNamesByKey();
      const ignoredKeys = getIgnoredTeamKeys();
      const teamNames = Object.fromEntries(
        Object.entries(allTeamNames).filter(
          ([key]) => !ignoredKeys.has(key.toUpperCase())
        )
      );

      return json({
        success: true,
        snapshots: results,
        teamNames,
      } satisfies LatestMetricsResponse);
    }

    // Validate level parameter
    if (!["org", "domain", "team"].includes(level)) {
      return json(
        {
          success: false,
          error: `Invalid level: ${level}. Must be 'org', 'domain', or 'team'.`,
        } satisfies LatestMetricsResponse,
        { status: 400 }
      );
    }

    // Validate levelId for non-org levels
    if (level !== "org" && !levelId) {
      return json(
        {
          success: false,
          error: `levelId is required for level '${level}'`,
        } satisfies LatestMetricsResponse,
        { status: 400 }
      );
    }

    // Get the latest snapshot for the specified level
    const snapshot = getLatestMetricsSnapshot(
      level as "org" | "domain" | "team",
      level === "org" ? null : levelId
    );

    if (!snapshot) {
      return json(
        {
          success: false,
          error: `No metrics snapshot found for level '${level}'${levelId ? ` with id '${levelId}'` : ""}`,
        } satisfies LatestMetricsResponse,
        { status: 404 }
      );
    }

    // Parse and validate the snapshot
    const parsed = safeParseMetricsSnapshot(snapshot.metrics_json);
    if (!parsed) {
      return json(
        {
          success: false,
          error: "Failed to parse metrics snapshot",
        } satisfies LatestMetricsResponse,
        { status: 500 }
      );
    }

    return json({
      success: true,
      snapshot: parsed,
    } satisfies LatestMetricsResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[API] Error fetching latest metrics:", message);

    return json(
      {
        success: false,
        error: message,
      } satisfies LatestMetricsResponse,
      { status: 500 }
    );
  }
};

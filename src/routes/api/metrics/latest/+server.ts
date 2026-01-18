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
 * Get whitelisted team keys from environment variable
 */
function getWhitelistTeamKeys(): Set<string> {
  const envValue = process.env.WHITELIST_TEAM_KEYS;
  if (!envValue) return new Set();
  return new Set(envValue.split(",").map((key) => key.trim().toUpperCase()));
}

/**
 * Check if a team should be included based on whitelist/blacklist rules
 * Whitelist takes precedence if configured
 */
function isTeamIncluded(levelId: string | null): boolean {
  if (!levelId) return true; // Non-team levels are always included
  const whitelist = getWhitelistTeamKeys();
  const ignored = getIgnoredTeamKeys();

  // If whitelist is set, only include teams on the whitelist
  if (whitelist.size > 0) {
    return whitelist.has(levelId.toUpperCase());
  }

  // Otherwise, use blacklist - exclude teams in ignoredTeamKeys
  return !ignored.has(levelId.toUpperCase());
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
          // Skip teams that don't pass whitelist/blacklist filtering
          if (s.level === "team" && !isTeamIncluded(s.level_id)) {
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

      // Include team name mapping for display purposes (respecting whitelist/blacklist)
      const allTeamNames = getTeamNamesByKey();
      const teamNames = Object.fromEntries(
        Object.entries(allTeamNames).filter(([key]) => isTeamIncluded(key))
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

#!/usr/bin/env bun

/**
 * Standalone Migration Script: Normalize Snapshot Schema
 *
 * Fixes historical snapshots to use the current schema format:
 * 1. Recalculates status values based on underlying metrics (not simple mapping)
 * 2. Adds missing teamHealth fields with computed values
 * 3. Leaves linearHygiene undefined for historical data (no backfill)
 *
 * Self-contained version that doesn't require source imports.
 * For use on production servers where source files aren't available.
 */

import { Database } from "bun:sqlite";

const DRY_RUN = !process.argv.includes("--apply");
const DB_PATH = process.env.DATABASE_URL || "linear-bot.db";

// ============================================================================
// Status calculation functions (matching metrics-snapshot.ts thresholds)
// ============================================================================

type PillarStatus =
  | "peakFlow"
  | "strongRhythm"
  | "steadyProgress"
  | "earlyTraction"
  | "lowTraction";

/**
 * Calculate status from a health/score percentage
 * Thresholds:
 * - >80% = peakFlow
 * - 61-80% = strongRhythm
 * - 41-60% = steadyProgress
 * - 21-40% = earlyTraction
 * - 0-20% = lowTraction
 */
function getStatusFromScore(score: number): PillarStatus {
  if (score > 80) return "peakFlow";
  if (score > 60) return "strongRhythm";
  if (score > 40) return "steadyProgress";
  if (score > 20) return "earlyTraction";
  return "lowTraction";
}

/**
 * Check if a status value is a legacy format
 */
function isLegacyStatus(status: string): boolean {
  return ["healthy", "warning", "critical"].includes(status);
}

// ============================================================================
// Type definitions
// ============================================================================

interface SnapshotRow {
  id: number;
  captured_at: string;
  level: string;
  level_id: string | null;
  metrics_json: string;
}

interface TeamHealthData {
  // New fields (may be missing in old snapshots)
  healthyWorkloadPercent?: number;
  wipViolationCount?: number;
  multiProjectViolationCount?: number;
  impactedProjectCount?: number;
  // Fields that exist in both old and new
  healthyIcCount: number;
  totalIcCount: number;
  totalProjectCount: number;
  status: string;
  // Legacy fields (exist in old snapshots)
  icWipViolationPercent?: number;
  projectWipViolationPercent?: number;
  healthyProjectCount?: number;
}

interface VelocityHealthData {
  status: string;
  [key: string]: unknown;
}

interface QualityData {
  status: string;
  [key: string]: unknown;
}

interface TeamProductivityData {
  status: string;
  [key: string]: unknown;
}

interface MetricsSnapshot {
  schemaVersion: number;
  teamHealth: TeamHealthData;
  velocityHealth: VelocityHealthData;
  quality: QualityData;
  teamProductivity: TeamProductivityData;
  linearHygiene?: unknown;
  metadata: unknown;
}

interface ChangeRecord {
  id: number;
  level: string;
  levelId: string | null;
  capturedAt: string;
  statusChanges: string[];
  fieldsAdded: string[];
}

// ============================================================================
// Migration logic
// ============================================================================

function migrateSnapshot(metrics: MetricsSnapshot): {
  changed: boolean;
  statusChanges: string[];
  fieldsAdded: string[];
} {
  const statusChanges: string[] = [];
  const fieldsAdded: string[] = [];
  let changed = false;

  // First, ensure we have the metrics we need to calculate status
  const th = metrics.teamHealth;

  // Compute healthyWorkloadPercent if missing (needed for status calculation)
  let healthyWorkloadPercent: number;
  if (th.healthyWorkloadPercent !== undefined) {
    healthyWorkloadPercent = th.healthyWorkloadPercent;
  } else if (th.icWipViolationPercent !== undefined) {
    healthyWorkloadPercent = 100 - th.icWipViolationPercent;
  } else if (th.totalIcCount > 0) {
    healthyWorkloadPercent = (th.healthyIcCount / th.totalIcCount) * 100;
  } else {
    healthyWorkloadPercent = 100;
  }

  // 1. Recalculate status values based on underlying metrics

  // TeamHealth: Use healthyWorkloadPercent
  const newTeamHealthStatus = getStatusFromScore(healthyWorkloadPercent);
  if (metrics.teamHealth.status !== newTeamHealthStatus) {
    const oldStatus = metrics.teamHealth.status;
    metrics.teamHealth.status = newTeamHealthStatus;
    statusChanges.push(
      `teamHealth: ${oldStatus} → ${newTeamHealthStatus} (${healthyWorkloadPercent.toFixed(0)}%)`
    );
    changed = true;
  }

  // VelocityHealth: Use onTrackPercent
  const vh = metrics.velocityHealth as {
    onTrackPercent?: number;
    status: string;
  };
  if (vh.onTrackPercent !== undefined) {
    const newVelocityStatus = getStatusFromScore(vh.onTrackPercent);
    if (vh.status !== newVelocityStatus) {
      const oldStatus = vh.status;
      vh.status = newVelocityStatus;
      statusChanges.push(
        `velocityHealth: ${oldStatus} → ${newVelocityStatus} (${vh.onTrackPercent.toFixed(0)}%)`
      );
      changed = true;
    }
  }

  // Quality: Use compositeScore
  const q = metrics.quality as { compositeScore?: number; status: string };
  if (q.compositeScore !== undefined) {
    const newQualityStatus = getStatusFromScore(q.compositeScore);
    if (q.status !== newQualityStatus) {
      const oldStatus = q.status;
      q.status = newQualityStatus;
      statusChanges.push(
        `quality: ${oldStatus} → ${newQualityStatus} (${q.compositeScore})`
      );
      changed = true;
    }
  }

  // TeamProductivity: Recalculate based on trueThroughputPerEngineer if available
  // Target is 6 TrueThroughput per 2 weeks per IC (3/week)
  const PRODUCTIVITY_TARGET = 6;
  const tp = metrics.teamProductivity as {
    trueThroughputPerEngineer?: number | null;
    status: string;
  };

  if (
    tp.trueThroughputPerEngineer !== null &&
    tp.trueThroughputPerEngineer !== undefined
  ) {
    // Calculate percentage of target (capped at 100%)
    const percentOfTarget = Math.min(
      (tp.trueThroughputPerEngineer / PRODUCTIVITY_TARGET) * 100,
      100
    );
    // Status is based on how close to target (inverted for getPillarStatus logic)
    const newProductivityStatus = getStatusFromScore(percentOfTarget);
    if (tp.status !== newProductivityStatus) {
      const oldStatus = tp.status;
      tp.status = newProductivityStatus;
      statusChanges.push(
        `teamProductivity: ${oldStatus} → ${newProductivityStatus} (${percentOfTarget.toFixed(0)}% of target)`
      );
      changed = true;
    }
  } else if (isLegacyStatus(tp.status)) {
    // No metric available, use conservative mapping
    const oldStatus = tp.status;
    if (oldStatus === "healthy") {
      tp.status = "peakFlow";
    } else if (oldStatus === "warning") {
      tp.status = "steadyProgress";
    } else {
      tp.status = "earlyTraction";
    }
    statusChanges.push(`teamProductivity: ${oldStatus} → ${tp.status}`);
    changed = true;
  }

  // LinearHygiene: Use hygieneScore (if present)
  const lh = metrics.linearHygiene as
    | { hygieneScore?: number; status?: string }
    | undefined;
  if (lh && lh.hygieneScore !== undefined) {
    const newHygieneStatus = getStatusFromScore(lh.hygieneScore);
    if (lh.status !== newHygieneStatus) {
      const oldStatus = lh.status || "unknown";
      lh.status = newHygieneStatus;
      statusChanges.push(
        `linearHygiene: ${oldStatus} → ${newHygieneStatus} (${lh.hygieneScore})`
      );
      changed = true;
    }
  }

  // 2. Add missing teamHealth fields with computed values

  if (th.healthyWorkloadPercent === undefined) {
    th.healthyWorkloadPercent = healthyWorkloadPercent;
    fieldsAdded.push(
      `healthyWorkloadPercent=${th.healthyWorkloadPercent.toFixed(1)}`
    );
    changed = true;
  }

  if (th.wipViolationCount === undefined) {
    th.wipViolationCount = th.totalIcCount - th.healthyIcCount;
    fieldsAdded.push(`wipViolationCount=${th.wipViolationCount}`);
    changed = true;
  }

  if (th.multiProjectViolationCount === undefined) {
    // Not trackable from old data, default to 0
    th.multiProjectViolationCount = 0;
    fieldsAdded.push(`multiProjectViolationCount=0`);
    changed = true;
  }

  if (th.impactedProjectCount === undefined) {
    // Compute from projectWipViolationPercent if available
    if (
      th.projectWipViolationPercent !== undefined &&
      th.totalProjectCount > 0
    ) {
      th.impactedProjectCount = Math.round(
        (th.projectWipViolationPercent / 100) * th.totalProjectCount
      );
    } else if (th.healthyProjectCount !== undefined) {
      th.impactedProjectCount = th.totalProjectCount - th.healthyProjectCount;
    } else {
      th.impactedProjectCount = 0;
    }
    fieldsAdded.push(`impactedProjectCount=${th.impactedProjectCount}`);
    changed = true;
  }

  // Ensure legacy fields exist for backward compatibility
  if (th.icWipViolationPercent === undefined) {
    th.icWipViolationPercent = 100 - th.healthyWorkloadPercent;
    changed = true;
  }

  if (th.projectWipViolationPercent === undefined && th.totalProjectCount > 0) {
    th.projectWipViolationPercent =
      (th.impactedProjectCount / th.totalProjectCount) * 100;
    changed = true;
  }

  if (th.healthyProjectCount === undefined) {
    th.healthyProjectCount = th.totalProjectCount - th.impactedProjectCount;
    changed = true;
  }

  return { changed, statusChanges, fieldsAdded };
}

function main() {
  console.log("🔄 Snapshot Schema Migration Script\n");
  console.log(`Mode: ${DRY_RUN ? "DRY RUN (no changes)" : "APPLY CHANGES"}`);
  console.log(`Database: ${DB_PATH}\n`);

  if (DRY_RUN) {
    console.log("To apply changes, run with --apply flag:\n");
    console.log("  bun run scripts/migrate-snapshot-schema.ts --apply\n");
  }

  const db = new Database(DB_PATH);

  const snapshots = db
    .prepare(
      "SELECT id, captured_at, level, level_id, metrics_json FROM metrics_snapshots ORDER BY captured_at ASC"
    )
    .all() as SnapshotRow[];

  console.log(`Found ${snapshots.length} snapshots to process\n`);

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  const changes: ChangeRecord[] = [];

  for (const row of snapshots) {
    try {
      const metrics = JSON.parse(row.metrics_json) as MetricsSnapshot;

      const result = migrateSnapshot(metrics);

      if (!result.changed) {
        skipped++;
        continue;
      }

      changes.push({
        id: row.id,
        level: row.level,
        levelId: row.level_id,
        capturedAt: row.captured_at,
        statusChanges: result.statusChanges,
        fieldsAdded: result.fieldsAdded,
      });

      if (!DRY_RUN) {
        db.prepare(
          "UPDATE metrics_snapshots SET metrics_json = ? WHERE id = ?"
        ).run(JSON.stringify(metrics), row.id);
      }

      updated++;
    } catch (error) {
      console.error(`❌ Error processing snapshot ${row.id}:`, error);
      errors++;
    }
  }

  // Print summary
  console.log("\n" + "=".repeat(80));
  console.log("MIGRATION SUMMARY");
  console.log("=".repeat(80) + "\n");

  if (changes.length > 0) {
    // Group by level for cleaner output
    const byLevel = new Map<string, ChangeRecord[]>();
    for (const change of changes) {
      const key = `${change.level}:${change.levelId ?? "org"}`;
      if (!byLevel.has(key)) {
        byLevel.set(key, []);
      }
      byLevel.get(key)!.push(change);
    }

    // Count unique change types
    const statusChangeCount = changes.filter(
      (c) => c.statusChanges.length > 0
    ).length;
    const fieldAddCount = changes.filter(
      (c) => c.fieldsAdded.length > 0
    ).length;

    console.log("Changes overview:");
    console.log(`  - ${statusChangeCount} snapshots with status value updates`);
    console.log(`  - ${fieldAddCount} snapshots with new fields added\n`);

    // Show sample changes per level
    for (const [levelKey, levelChanges] of byLevel) {
      console.log(`\n📊 ${levelKey} (${levelChanges.length} snapshots)`);
      console.log("-".repeat(50));

      // Show first and last change as samples
      const samples =
        levelChanges.length <= 4
          ? levelChanges
          : [levelChanges[0], levelChanges[levelChanges.length - 1]];

      for (const change of samples) {
        console.log(`   ${change.capturedAt.slice(0, 16)}`);
        if (change.statusChanges.length > 0) {
          console.log(`     Status: ${change.statusChanges.join(", ")}`);
        }
        if (change.fieldsAdded.length > 0 && samples.length <= 2) {
          console.log(`     Fields: ${change.fieldsAdded.join(", ")}`);
        }
      }

      if (levelChanges.length > 4) {
        console.log(`   ... and ${levelChanges.length - 2} more snapshots`);
      }
    }
  }

  console.log("\n" + "-".repeat(50));
  console.log(`Total snapshots:     ${snapshots.length}`);
  console.log(`Updated:             ${updated}`);
  console.log(`Skipped (no change): ${skipped}`);
  console.log(`Errors:              ${errors}`);
  console.log("-".repeat(50) + "\n");

  if (DRY_RUN && updated > 0) {
    console.log("⚠️  This was a DRY RUN. No changes were made.");
    console.log("   Run with --apply to apply changes.\n");
  } else if (!DRY_RUN && updated > 0) {
    console.log("✅ Migration completed successfully!");
  } else if (updated === 0) {
    console.log("ℹ️  No snapshots needed updating.");
  }

  db.close();

  if (errors > 0) {
    process.exit(1);
  }
}

main();

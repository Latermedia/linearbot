#!/usr/bin/env bun

/**
 * Standalone Migration Script: Recalculate Quality Composite Scores
 *
 * Self-contained version that doesn't require source imports.
 * For use on production servers where source files aren't available.
 */

import { Database } from "bun:sqlite";

const DRY_RUN = !process.argv.includes("--apply");
const DB_PATH = process.env.DATABASE_URL || "linear-bot.db";

// ============================================================================
// Inline quality calculation functions (copied from quality-health.ts)
// ============================================================================

const BUG_PENALTY = 1;
const NET_PENALTY = 10;
const AGE_PENALTY_PER_DAY = 0.5;

function calculateCompositeScore(
  openCount: number,
  netChange: number,
  avgAge: number
): number {
  const bugScore = Math.min(100, Math.max(0, 100 - openCount * BUG_PENALTY));
  const netScore = Math.min(100, Math.max(0, 100 - netChange * NET_PENALTY));
  const ageScore = Math.min(
    100,
    Math.max(0, 100 - avgAge * AGE_PENALTY_PER_DAY)
  );
  const weightedScore = bugScore * 0.3 + netScore * 0.4 + ageScore * 0.3;
  return Math.round(weightedScore);
}

function getQualityStatus(compositeScore: number): string {
  const violationPercent = 100 - compositeScore;
  if (violationPercent < 10) return "healthy";
  if (violationPercent < 25) return "warning";
  return "critical";
}

// ============================================================================
// Migration logic
// ============================================================================

interface SnapshotRow {
  id: number;
  captured_at: string;
  level: string;
  level_id: string | null;
  metrics_json: string;
}

interface QualityData {
  openBugCount: number;
  netBugChange: number;
  averageBugAgeDays: number;
  compositeScore: number;
  status: string;
  [key: string]: unknown;
}

interface MetricsSnapshot {
  quality: QualityData;
  [key: string]: unknown;
}

function main() {
  console.log("🔄 Quality Score Migration Script (Standalone)\n");
  console.log(`Mode: ${DRY_RUN ? "DRY RUN (no changes)" : "APPLY CHANGES"}`);
  console.log(`Database: ${DB_PATH}\n`);

  if (DRY_RUN) {
    console.log("To apply changes, run with --apply flag:\n");
    console.log("  bun run migrate-quality-scores-standalone.ts --apply\n");
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

  const changes: Array<{
    id: number;
    level: string;
    levelId: string | null;
    capturedAt: string;
    oldScore: number;
    newScore: number;
    oldStatus: string;
    newStatus: string;
  }> = [];

  for (const row of snapshots) {
    try {
      const metrics = JSON.parse(row.metrics_json) as MetricsSnapshot;
      const quality = metrics.quality;

      if (!quality || typeof quality.openBugCount !== "number") {
        console.log(`⚠️  Skipping snapshot ${row.id}: Missing quality data`);
        skipped++;
        continue;
      }

      const newScore = calculateCompositeScore(
        quality.openBugCount,
        quality.netBugChange,
        quality.averageBugAgeDays
      );
      const newStatus = getQualityStatus(newScore);

      if (quality.compositeScore === newScore && quality.status === newStatus) {
        skipped++;
        continue;
      }

      changes.push({
        id: row.id,
        level: row.level,
        levelId: row.level_id,
        capturedAt: row.captured_at,
        oldScore: quality.compositeScore,
        newScore,
        oldStatus: quality.status,
        newStatus,
      });

      if (!DRY_RUN) {
        metrics.quality = {
          ...quality,
          compositeScore: newScore,
          status: newStatus,
        };

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
    console.log("Changes to apply:\n");

    const byLevel = new Map<string, typeof changes>();
    for (const change of changes) {
      const key = `${change.level}:${change.levelId ?? "org"}`;
      if (!byLevel.has(key)) {
        byLevel.set(key, []);
      }
      byLevel.get(key)!.push(change);
    }

    for (const [levelKey, levelChanges] of byLevel) {
      console.log(`\n📊 ${levelKey}`);
      console.log("-".repeat(40));

      const samplesToShow =
        levelChanges.length <= 6
          ? levelChanges
          : [...levelChanges.slice(0, 3), null, ...levelChanges.slice(-2)];

      for (const change of samplesToShow) {
        if (change === null) {
          console.log(`   ... ${levelChanges.length - 5} more snapshots ...`);
          continue;
        }
        const scoreDiff = change.newScore - change.oldScore;
        const arrow = scoreDiff < 0 ? "↓" : scoreDiff > 0 ? "↑" : "→";
        console.log(
          `   ${change.capturedAt.slice(0, 10)} | Score: ${change.oldScore} ${arrow} ${change.newScore} | Status: ${change.oldStatus} → ${change.newStatus}`
        );
      }
    }
  }

  console.log("\n" + "-".repeat(40));
  console.log(`Total snapshots:  ${snapshots.length}`);
  console.log(`Updated:          ${updated}`);
  console.log(`Skipped (no change): ${skipped}`);
  console.log(`Errors:           ${errors}`);
  console.log("-".repeat(40) + "\n");

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

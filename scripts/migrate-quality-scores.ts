#!/usr/bin/env bun

/**
 * Migration Script: Recalculate Quality Composite Scores
 *
 * This script migrates historical snapshots to use the new quality score calculation:
 * - Removes per-engineer scaling
 * - Properly clamps each component to 0-100 before weighting
 *
 * The raw data (openBugCount, netBugChange, averageBugAgeDays) is preserved,
 * only the derived compositeScore and status are recalculated.
 *
 * Usage:
 *   bun run scripts/migrate-quality-scores.ts          # Dry run (default)
 *   bun run scripts/migrate-quality-scores.ts --apply  # Apply changes
 */

import { getDatabase } from "../src/db/connection.js";
import {
  calculateCompositeScore,
  getQualityStatus,
} from "../src/services/metrics/quality-health.js";

const DRY_RUN = !process.argv.includes("--apply");

interface SnapshotRow {
  id: number;
  captured_at: string;
  level: string;
  level_id: string | null;
  metrics_json: string;
}

interface QualityData {
  openBugCount: number;
  bugsOpenedInPeriod: number;
  bugsClosedInPeriod: number;
  netBugChange: number;
  averageBugAgeDays: number;
  maxBugAgeDays: number;
  compositeScore: number;
  status: string;
}

interface MetricsSnapshot {
  schemaVersion: number;
  quality: QualityData;
  [key: string]: unknown;
}

function main() {
  console.log("🔄 Quality Score Migration Script\n");
  console.log(`Mode: ${DRY_RUN ? "DRY RUN (no changes)" : "APPLY CHANGES"}\n`);

  if (DRY_RUN) {
    console.log("To apply changes, run with --apply flag:\n");
    console.log("  bun run scripts/migrate-quality-scores.ts --apply\n");
  }

  const db = getDatabase();

  // Get all snapshots
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

      // Recalculate using the new formula
      const newScore = calculateCompositeScore(
        quality.openBugCount,
        quality.netBugChange,
        quality.averageBugAgeDays
      );
      const newStatus = getQualityStatus(newScore);

      // Check if there's a change
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
        // Update the snapshot
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

    // Group by level for readability
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

      // Show first 5 and last change for this level
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
    console.log("   Run with --apply to apply changes:\n");
    console.log("   bun run scripts/migrate-quality-scores.ts --apply\n");
  } else if (!DRY_RUN && updated > 0) {
    console.log("✅ Migration completed successfully!");
  } else if (updated === 0) {
    console.log("ℹ️  No snapshots needed updating.");
  }

  if (errors > 0) {
    process.exit(1);
  }
}

main();

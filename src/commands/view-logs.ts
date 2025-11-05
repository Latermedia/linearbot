#!/usr/bin/env bun

import { getLogStats, readWriteLog } from "../utils/write-log.js";

/**
 * View write operation logs and statistics
 */
function main() {
  const args = process.argv.slice(2);
  const command = args[0] || "stats";

  if (command === "stats") {
    // Show statistics
    const stats = getLogStats();

    console.log("\n📊 Write Operations Statistics\n");
    console.log(`Total operations: ${stats.total}`);
    console.log(`Success rate: ${stats.successRate.toFixed(1)}%`);
    console.log(`Last 24 hours: ${stats.last24Hours}`);

    if (Object.keys(stats.byOperation).length > 0) {
      console.log("\nBy operation type:");
      for (const [operation, count] of Object.entries(stats.byOperation)) {
        console.log(`  ${operation}: ${count}`);
      }
    }

    console.log("");
  } else if (command === "recent") {
    // Show recent logs
    const limit = parseInt(args[1]) || 10;
    const entries = readWriteLog(limit);

    console.log(`\n📝 Recent Write Operations (last ${limit})\n`);

    if (entries.length === 0) {
      console.log("No log entries found.\n");
      return;
    }

    for (const entry of entries) {
      const status = entry.success ? "✓" : "✗";
      const color = entry.success ? "\x1b[32m" : "\x1b[31m"; // green or red
      const reset = "\x1b[0m";

      console.log(
        `${color}${status}${reset} ${entry.timestamp} | ${entry.operation}`
      );
      console.log(`  ${entry.issueIdentifier}: ${entry.issueTitle}`);
      console.log(`  ${entry.issueUrl}`);

      if (entry.details) {
        if (entry.details.commentType) {
          console.log(`  Type: ${entry.details.commentType}`);
        }
      }

      if (entry.error) {
        console.log(`  Error: ${entry.error}`);
      }

      console.log("");
    }
  } else if (command === "help") {
    console.log("\nUsage: bun run view-logs [command] [options]\n");
    console.log("Commands:");
    console.log("  stats          Show statistics (default)");
    console.log("  recent [n]     Show recent n operations (default: 10)");
    console.log("  help           Show this help message");
    console.log("");
  } else {
    console.log(`Unknown command: ${command}`);
    console.log('Run "bun run view-logs help" for usage information.\n');
  }
}

main();


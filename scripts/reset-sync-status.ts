#!/usr/bin/env bun

import { setSyncStatus } from "../src/db/queries.js";

console.log("🔄 Resetting sync status to 'idle'...\n");

try {
  setSyncStatus("idle");
  console.log("✅ Sync status reset successfully!");
  console.log("   Status is now: idle\n");
} catch (error) {
  console.error(
    "❌ Reset failed:",
    error instanceof Error ? error.message : error
  );
  process.exit(1);
}

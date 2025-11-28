#!/usr/bin/env bun

import { resetDatabaseConnection, getDatabase } from "../src/db/connection.js";

console.log("🗑️  Resetting database...\n");

try {
  resetDatabaseConnection();
  // Reinitialize to ensure it's ready
  getDatabase();

  console.log("✅ Database reset successfully!");
  console.log("   All data has been deleted.");
  console.log("   Run 'bun run sync' to populate the database.\n");
} catch (error) {
  console.error(
    "❌ Reset failed:",
    error instanceof Error ? error.message : error
  );
  process.exit(1);
}

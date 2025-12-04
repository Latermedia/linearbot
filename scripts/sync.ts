#!/usr/bin/env bun

import { performSync } from "../src/services/sync/index.js";

console.log("🔄 Syncing Linear data...\n");

const result = await performSync(true, {
  onIssueCountUpdate: (count) => {
    process.stdout.write(`\r  Fetched ${count} started issues...`);
  },
  onProjectCountUpdate: (count) => {
    process.stdout.write(`\n  Found ${count} active projects...\n`);
  },
  onProjectIssueCountUpdate: (count) => {
    process.stdout.write(`\r  Fetched ${count} project issues...`);
  },
});

console.log("\n");

if (result.success) {
  console.log("✅ Sync completed successfully!");
  console.log(`   New issues: ${result.newCount}`);
  console.log(`   Updated issues: ${result.updatedCount}`);
  console.log(`   Total issues in DB: ${result.totalCount}`);
  console.log(`   Started issues: ${result.issueCount}`);
  console.log(`   Active projects: ${result.projectCount}`);
  console.log(`   Project issues: ${result.projectIssueCount}`);
  console.log("\n🚀 You can now start the web app: bun run dev\n");
} else {
  console.error("❌ Sync failed:", result.error);
  process.exit(1);
}

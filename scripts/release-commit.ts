#!/usr/bin/env bun
/**
 * Commit and tag a release
 *
 * Usage:
 *   bun run release-commit
 *
 * Prerequisites:
 *   1. Run `bun run release-prepare-patch` (or minor/major) first
 *   2. Update NEWS.md with the generated prompt
 */

import { $ } from "bun";

const VERSION_FILE = "VERSION";
const NEWS_FILE = "NEWS.md";

async function readVersion(): Promise<string> {
  const file = Bun.file(VERSION_FILE);
  if (!(await file.exists())) {
    console.error(`❌ ${VERSION_FILE} not found`);
    process.exit(1);
  }
  return (await file.text()).trim();
}

async function isFileModified(file: string): Promise<boolean> {
  const result = await $`git status --porcelain ${file}`.text();
  return result.trim().length > 0;
}

async function isNewsUpdated(version: string): Promise<boolean> {
  const news = await Bun.file(NEWS_FILE).text();
  return news.includes(`## v${version}`) || news.includes(`## ${version}`);
}

async function main() {
  const version = await readVersion();

  console.log(`\n📦 Committing release v${version}\n`);

  // Check if VERSION was modified (release-prepare was run)
  const versionModified = await isFileModified(VERSION_FILE);
  if (!versionModified) {
    console.error(`❌ ${VERSION_FILE} has no uncommitted changes`);
    console.error(
      `\n   Run 'bun run release-prepare-patch' (or minor/major) first\n`
    );
    process.exit(1);
  }

  // Check if NEWS.md has been updated for this version
  if (!(await isNewsUpdated(version))) {
    console.error(`❌ NEWS.md doesn't contain an entry for v${version}`);
    console.error(`\n   Update NEWS.md with the release notes first\n`);
    process.exit(1);
  }

  // Check if NEWS.md was also modified
  const newsModified = await isFileModified(NEWS_FILE);
  if (!newsModified) {
    console.error(`❌ ${NEWS_FILE} has no uncommitted changes`);
    console.error(`\n   The v${version} entry may be from a previous release.`);
    console.error(`   Update NEWS.md with new release notes.\n`);
    process.exit(1);
  }

  // Stage VERSION and NEWS.md
  console.log(`📂 Staging ${VERSION_FILE} and ${NEWS_FILE}...`);
  await $`git add ${VERSION_FILE} ${NEWS_FILE}`;

  // Commit
  const commitMsg = `Release v${version}`;
  console.log(`💾 Committing: "${commitMsg}"...`);
  await $`git commit -m ${commitMsg}`;

  // Tag
  console.log(`🏷️  Tagging v${version}...`);
  await $`git tag v${version}`;

  console.log("\n" + "─".repeat(40));
  console.log(`\n✅ Release v${version} committed and tagged\n`);
  console.log("To publish, run:\n");
  console.log("   git push && git push --tags\n");
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});

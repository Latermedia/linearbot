#!/usr/bin/env bun
/**
 * Prepare a release for LinearBot
 *
 * Usage:
 *   bun run release-prepare patch   # 0.1.0 → 0.1.1
 *   bun run release-prepare minor   # 0.1.0 → 0.2.0
 *   bun run release-prepare major   # 0.1.0 → 1.0.0
 *
 * Shortcuts:
 *   bun run release-prepare-patch
 *   bun run release-prepare-minor
 *   bun run release-prepare-major
 *
 * After updating NEWS.md:
 *   bun run release-commit
 */

import { $ } from "bun";

type BumpType = "patch" | "minor" | "major";

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

function bumpVersion(version: string, type: BumpType): string {
  const [major, minor, patch] = version.split(".").map(Number);

  switch (type) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
  }
}

async function getCommitsSinceLastTag(): Promise<string[]> {
  try {
    const result =
      await $`git log --oneline $(git describe --tags --abbrev=0 2>/dev/null || echo "")..HEAD`.text();
    return result.trim().split("\n").filter(Boolean);
  } catch {
    // No tags yet, get all commits
    const result = await $`git log --oneline`.text();
    return result.trim().split("\n").filter(Boolean).slice(0, 20);
  }
}

async function generateReleasePrompt(
  newVersion: string,
  commits: string[]
): Promise<string> {
  const commitList = commits.map((c) => `- ${c}`).join("\n");

  return `
Summarize these commits for NEWS.md under version ${newVersion}:

${commitList}

Format as markdown with categories (use only those that apply):
- Added (new features)
- Changed (changes to existing features)  
- Fixed (bug fixes)
- Removed (removed features)

Be terse. One line per change. Example:

## v${newVersion}

### Added
- Gantt chart export to PNG

### Fixed
- 0-point estimates no longer trigger warning
`.trim();
}

async function main() {
  const args = process.argv.slice(2);
  const bumpType = args[0] as BumpType;

  if (!["patch", "minor", "major"].includes(bumpType)) {
    console.log(`
Usage: bun run release-prepare <patch|minor|major>

  patch   0.1.0 → 0.1.1   (bug fixes)
  minor   0.1.0 → 0.2.0   (new features)
  major   0.1.0 → 1.0.0   (breaking changes)

Shortcuts:
  bun run release-prepare-patch
  bun run release-prepare-minor
  bun run release-prepare-major
`);
    process.exit(1);
  }

  // Read current version
  const currentVersion = await readVersion();
  const newVersion = bumpVersion(currentVersion, bumpType);

  console.log(`\n📦 Release: v${currentVersion} → v${newVersion}\n`);

  // Write new version
  await Bun.write(VERSION_FILE, newVersion + "\n");
  console.log(`✅ Updated ${VERSION_FILE} to ${newVersion}\n`);

  // Get commits since last tag
  const commits = await getCommitsSinceLastTag();

  if (commits.length === 0) {
    console.log("⚠️  No commits since last release\n");
  } else {
    console.log(`📝 ${commits.length} commits since last release:\n`);
    commits.forEach((c) => console.log(`   ${c}`));
  }

  // Generate prompt for NEWS.md
  const prompt = await generateReleasePrompt(newVersion, commits);

  console.log("\n" + "─".repeat(60));
  console.log("\n🤖 Use this prompt to generate NEWS.md entry:\n");
  console.log(prompt);
  console.log("\n" + "─".repeat(60));

  console.log(`
Next steps:

1. Copy the prompt above and generate NEWS.md entry
2. Add the entry to the top of ${NEWS_FILE} (below the header)
3. Run: bun run release-commit
`);
}

main().catch(console.error);

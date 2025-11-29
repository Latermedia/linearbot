#!/usr/bin/env bun
/**
 * Setup script for LinearBot
 *
 * Usage:
 *   bun run setup
 *
 * Checks prerequisites, copies .env.example, and installs dependencies.
 */

import { $ } from "bun";

interface Tool {
  name: string;
  check: string;
  macInstall: string;
  docs: string;
  note?: string;
  purpose?: string;
}

const REQUIRED_TOOLS: Tool[] = [
  {
    name: "git",
    check: "git --version",
    macInstall: "brew install git",
    docs: "https://git-scm.com/downloads",
  },
  {
    name: "bun",
    check: "bun --version",
    macInstall: "brew install oven-sh/bun/bun",
    docs: "https://bun.sh/docs/installation",
  },
];

const BREW_INFO = {
  name: "brew",
  check: "brew --version",
  macInstall:
    '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
  docs: "https://brew.sh",
  note: "Our suggested package manager for macOS. If you have opinions about package managers, you probably don't need these instructions 😉",
};

const OPTIONAL_TOOLS: Tool[] = [
  {
    name: "flyctl",
    check: "flyctl version",
    macInstall: "brew install flyctl",
    docs: "https://fly.io/docs/hands-on/install-flyctl/",
    purpose: "deploying to Fly.io",
  },
];

async function checkTool(cmd: string): Promise<boolean> {
  try {
    await $`${cmd.split(" ")[0]} ${cmd.split(" ").slice(1)}`.quiet();
    return true;
  } catch {
    return false;
  }
}

async function fileExists(path: string): Promise<boolean> {
  return await Bun.file(path).exists();
}

function isMac(): boolean {
  return process.platform === "darwin";
}

async function main() {
  console.log("\n🚀 LinearBot Setup\n");
  console.log("─".repeat(50));

  // Check required tools
  console.log("\n📋 Checking required tools...\n");

  const missingTools: Tool[] = [];

  for (const tool of REQUIRED_TOOLS) {
    const exists = await checkTool(tool.check);
    if (exists) {
      console.log(`   ✅ ${tool.name}`);
    } else {
      console.log(`   ❌ ${tool.name} — not found`);
      missingTools.push(tool);
    }
  }

  if (missingTools.length > 0) {
    console.log("\n📋 Installation instructions:\n");

    // On macOS, check if brew is available for installing missing tools
    if (isMac()) {
      const hasBrew = await checkTool(BREW_INFO.check);

      if (!hasBrew) {
        console.log(`   First, install ${BREW_INFO.name}:`);
        console.log(`      ${BREW_INFO.note}`);
        console.log(`      Install: ${BREW_INFO.macInstall}`);
        console.log(`      Docs: ${BREW_INFO.docs}\n`);
        console.log(`   Then install the missing tools:\n`);
      }

      for (const tool of missingTools) {
        console.log(`   ${tool.name}:`);
        console.log(`      Install: ${tool.macInstall}`);
        console.log(`      Docs: ${tool.docs}\n`);
      }
    } else {
      for (const tool of missingTools) {
        console.log(`   ${tool.name}:`);
        console.log(`      Docs: ${tool.docs}\n`);
      }
    }

    console.log("⛔ Install missing required tools and run setup again.\n");
    process.exit(1);
  }

  // Check optional tools
  console.log("\n📋 Checking optional tools...\n");

  for (const tool of OPTIONAL_TOOLS) {
    const exists = await checkTool(tool.check);
    if (exists) {
      console.log(`   ✅ ${tool.name}`);
    } else {
      console.log(
        `   ⚠️  ${tool.name} — not found (needed for ${tool.purpose})`
      );
      if (isMac()) {
        console.log(`      Install: ${tool.macInstall}`);
      }
      console.log(`      Docs: ${tool.docs}`);
    }
  }

  // Copy .env.example to .env
  console.log("\n📋 Setting up environment...\n");

  const envExists = await fileExists(".env");
  const envExampleExists = await fileExists(".env.example");

  if (!envExampleExists) {
    console.log("   ❌ .env.example not found — cannot create .env");
    console.log(
      "      This file should exist in the repo. Try: git checkout .env.example\n"
    );
  } else if (envExists) {
    console.log("   ✅ .env already exists (skipping copy)");
  } else {
    await $`cp .env.example .env`;
    console.log("   ✅ Created .env from .env.example");
    console.log(
      "   ⚠️  Edit .env and add your LINEAR_API_KEY and APP_PASSWORD"
    );
  }

  // Install dependencies
  console.log("\n📋 Installing dependencies...\n");

  try {
    await $`bun install`;
    console.log("\n   ✅ Dependencies installed");
  } catch (_error) {
    console.log("\n   ❌ Failed to install dependencies");
    console.log("      Try running: bun install\n");
    process.exit(1);
  }

  // Summary
  console.log("\n" + "─".repeat(50));
  console.log("\n✅ Setup complete!\n");

  if (!envExists && envExampleExists) {
    console.log("Next steps:\n");
    console.log("   1. Edit .env and add your credentials:");
    console.log(
      "      - LINEAR_API_KEY (from https://linear.app/settings/api)"
    );
    console.log("      - APP_PASSWORD (choose a secure password)\n");
    console.log("   2. Sync data from Linear:");
    console.log("      bun run sync\n");
    console.log("   3. Start the dev server:");
    console.log("      bun run dev\n");
  } else {
    console.log("Run the app:\n");
    console.log("   bun run sync    # Sync data from Linear");
    console.log("   bun run dev     # Start dev server\n");
  }
}

main().catch((err) => {
  console.error("❌ Setup failed:", err.message);
  process.exit(1);
});

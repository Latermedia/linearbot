#!/usr/bin/env bun

import { syncIssues } from "./commands/sync-issues.js";
import { listIssues } from "./commands/list-issues.js";
import { closeDatabase } from "./db/connection.js";

const COMMANDS = {
  sync: {
    name: "sync",
    description: "Sync teams, workflow states, and active issues from Linear",
    handler: syncIssues,
  },
  list: {
    name: "list",
    description: "List active issues by assignee (optional: filter by name)",
    handler: listIssues,
  },
  help: {
    name: "help",
    description: "Show this help message",
    handler: showHelp,
  },
};

function showHelp(): void {
  console.log("\n📦 Linear Bot - WIP Constraint Analysis Tool\n");
  console.log("Usage: bun start <command>\n");
  console.log("Commands:");

  for (const cmd of Object.values(COMMANDS)) {
    console.log(`  ${cmd.name.padEnd(12)} ${cmd.description}`);
  }

  console.log("\nWorkflow:");
  console.log("  1. Run 'sync' to fetch all data from Linear");
  console.log("  2. Run 'list' for interactive menu to explore issues");
  console.log("  3. Navigate with ↑↓ arrows, Enter to select\n");

  console.log("Environment:");
  console.log("  LINEAR_API_KEY   Your Linear API key (required)\n");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const commandName = args[0]?.toLowerCase();

  // Show help if no command or help requested
  if (
    !commandName ||
    commandName === "help" ||
    commandName === "--help" ||
    commandName === "-h"
  ) {
    showHelp();
    return;
  }

  // Find and execute command
  const command = COMMANDS[commandName as keyof typeof COMMANDS];

  if (!command) {
    console.error(`\n❌ Unknown command: ${commandName}\n`);
    showHelp();
    process.exit(1);
  }

  try {
    // Special handling for list command with optional assignee argument
    if (commandName === "list" && args[1]) {
      await listIssues(args[1]);
    } else {
      await command.handler();
    }
  } catch (error) {
    console.error("\n❌ Fatal error:", error);
    process.exit(1);
  } finally {
    closeDatabase();
  }
}

// Run the CLI
main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});

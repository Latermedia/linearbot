import { select } from "@inquirer/prompts";
import { getDatabase } from "../db/connection.js";
import type { Issue } from "../db/schema.js";

export async function listIssues(assigneeFilter?: string): Promise<void> {
  const db = getDatabase();

  // Get all issues
  const getIssues = db.prepare(`
    SELECT * FROM issues
    ORDER BY team_name, priority ASC, updated_at DESC
  `);
  const issues = getIssues.all() as Issue[];

  if (issues.length === 0) {
    console.log("\nNo active issues found.");
    console.log("Tip: Run 'bun start sync' to fetch issues from Linear.\n");
    return;
  }

  // Group by assignee
  const issuesByAssignee = new Map<string, Issue[]>();
  for (const issue of issues) {
    const assigneeName = issue.assignee_name || "Unassigned";
    const assigneeIssues = issuesByAssignee.get(assigneeName) || [];
    assigneeIssues.push(issue);
    issuesByAssignee.set(assigneeName, assigneeIssues);
  }

  // If filtering by assignee (non-interactive mode), show detailed view
  if (assigneeFilter) {
    displayAssigneeDetails(assigneeFilter, issuesByAssignee);
    return;
  }

  // Interactive mode - show summary and let user navigate
  await interactiveMenu(issuesByAssignee, issues.length);
}

async function interactiveMenu(
  issuesByAssignee: Map<string, Issue[]>,
  totalIssues: number
): Promise<void> {
  let running = true;

  while (running) {
    // Show summary
    displayAssigneeSummary(issuesByAssignee, totalIssues);

    // Create choices for the menu
    const sortedAssignees = Array.from(issuesByAssignee.entries())
      .sort((a, b) => b[1].length - a[1].length)
      .map(([assignee, issues]) => {
        const count = issues.length;
        const { color, status } = getWIPStatus(count);
        const displayText = `${assignee.padEnd(
          35
        )} (${count} issues)  ${status}`;
        return {
          name: color(displayText),
          value: assignee,
        };
      });

    const choices = [...sortedAssignees, { name: "↩  Exit", value: "exit" }];

    // Calculate page size based on terminal height (leave room for header/footer)
    const terminalHeight = process.stdout.rows || 20;
    const pageSize = Math.max(10, terminalHeight - 10);

    try {
      const answer = await select({
        message: "Select an assignee to view details:",
        choices,
        pageSize,
      });

      if (answer === "exit") {
        console.log("\n👋 Goodbye!\n");
        running = false;
      } else {
        // Show interactive issue list for selected assignee
        const continueAnswer = await displayInteractiveIssues(
          answer,
          issuesByAssignee
        );

        if (continueAnswer === "exit") {
          console.log("\n👋 Goodbye!\n");
          running = false;
        }
        // If "back", loop continues
      }
    } catch (error) {
      // Handle Ctrl+C gracefully
      console.log("\n\n👋 Goodbye!\n");
      running = false;
    }
  }
}

async function displayInteractiveIssues(
  assigneeName: string,
  issuesByAssignee: Map<string, Issue[]>
): Promise<string> {
  const issues = issuesByAssignee.get(assigneeName);

  if (!issues || issues.length === 0) {
    console.clear();
    console.log(`\nNO ISSUES FOUND FOR: ${assigneeName}\n`);
    return "back";
  }

  // Create interactive issue browser
  while (true) {
    console.clear();
    console.log(`\nISSUES FOR: ${assigneeName} (${issues.length} issues)`);
    console.log("Navigate with ↑↓ arrows, Enter to select\n");

    // Create compact choices - one line per issue
    const issueChoices = issues.map((issue, index) => {
      const statusPart = `(${issue.state_name})`;
      const prefix = `[${issue.identifier}] ${statusPart} `;
      const maxTitleLength = 65 - prefix.length;
      const truncatedTitle =
        issue.title.length > maxTitleLength
          ? issue.title.substring(0, maxTitleLength - 3) + "..."
          : issue.title;

      return {
        name: `${prefix}${truncatedTitle}`,
        value: index,
        description: `Team: ${issue.team_name}`,
      };
    });

    const choices = [
      ...issueChoices,
      { name: "←  Back to assignee list", value: -1 },
    ];

    // Calculate page size based on terminal height (leave room for header)
    const terminalHeight = process.stdout.rows || 20;
    const pageSize = Math.max(10, terminalHeight - 8);

    try {
      const selectedIndex = await select({
        message: "Select an issue to view details:",
        choices,
        pageSize,
      });

      if (selectedIndex === -1) {
        // Back to assignee list
        return "back";
      } else if (selectedIndex >= 0) {
        // Show full issue details
        const issue = issues[selectedIndex];
        await displayFullIssueDetails(issue);
      }
    } catch (error) {
      // Handle Ctrl+C
      return "exit";
    }
  }
}

async function displayFullIssueDetails(issue: Issue): Promise<void> {
  console.clear();
  console.log(`\n${issue.title}\n`);
  console.log(`Team:     ${issue.team_name} (${issue.team_key})`);
  console.log(`Status:   ${issue.state_name}`);
  console.log(`Assignee: ${issue.assignee_name || "Unassigned"}`);
  console.log(`\nURL:      ${issue.url}`);

  if (issue.description) {
    console.log(`\nDescription:`);
    const maxLength = 500;
    const desc =
      issue.description.length > maxLength
        ? issue.description.substring(0, maxLength) + "..."
        : issue.description;
    console.log(desc);
  }

  console.log();

  try {
    const action = await select({
      message: "What would you like to do?",
      choices: [
        { name: "🌐  Open in browser", value: "open" },
        { name: "←  Back to issue list", value: "back" },
      ],
    });

    if (action === "open") {
      // Open URL in default browser
      const { spawn } = require("child_process");
      const command =
        process.platform === "darwin"
          ? "open"
          : process.platform === "win32"
          ? "start"
          : "xdg-open";
      spawn(command, [issue.url], { detached: true, stdio: "ignore" });
      console.log("\n✓ Opening in browser...\n");
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } catch (error) {
    // Handle Ctrl+C
  }
}

function displayAssigneeSummary(
  issuesByAssignee: Map<string, Issue[]>,
  totalIssues: number
): void {
  console.clear();
  console.log("\nACTIVE ISSUES SUMMARY\n");

  console.log(
    `Total: ${totalIssues} issues across ${issuesByAssignee.size} assignees\n`
  );

  // Count violations
  const violations = Array.from(issuesByAssignee.values()).filter(
    (issues) => issues.length > 5
  ).length;
  const warnings = Array.from(issuesByAssignee.values()).filter(
    (issues) => issues.length >= 6 && issues.length <= 7
  ).length;
  const critical = Array.from(issuesByAssignee.values()).filter(
    (issues) => issues.length >= 8
  ).length;

  console.log("WIP Constraint: 3 ideal, 5 max");
  console.log(
    `Violations: ${violations} assignees (${warnings} warning, ${critical} critical)\n`
  );

  // Sort by issue count descending
  const sortedAssignees = Array.from(issuesByAssignee.entries()).sort(
    (a, b) => b[1].length - a[1].length
  );

  // Display as a table
  console.log("ASSIGNEE".padEnd(35) + "ISSUES   STATUS");

  for (const [assignee, assigneeIssues] of sortedAssignees) {
    const count = assigneeIssues.length;
    const issueCount = count.toString().padStart(3);

    // Color code based on WIP constraint
    const { color, status } = getWIPStatus(count);
    const line = `${assignee.padEnd(35)}${issueCount}  ${status}`;

    console.log(color(line));
  }

  console.log();
}

function getWIPStatus(count: number): {
  color: (str: string) => string;
  status: string;
} {
  if (count >= 8) {
    return {
      color: (str: string) => `\x1b[31m${str}\x1b[0m`, // Red
      status: "🔴 CRITICAL",
    };
  } else if (count >= 6) {
    return {
      color: (str: string) => `\x1b[33m${str}\x1b[0m`, // Yellow/Orange
      status: "🟠 WARNING",
    };
  } else if (count > 5) {
    return {
      color: (str: string) => `\x1b[33m${str}\x1b[0m`, // Yellow/Orange
      status: "⚠️  OVER",
    };
  } else if (count >= 4) {
    return {
      color: (str: string) => str, // Normal
      status: "⚪ OK",
    };
  } else {
    return {
      color: (str: string) => str, // Normal
      status: "✓ GOOD",
    };
  }
}

function displayAssigneeDetails(
  assigneeFilter: string,
  issuesByAssignee: Map<string, Issue[]>
): void {
  const issues = issuesByAssignee.get(assigneeFilter);

  if (!issues || issues.length === 0) {
    console.clear();
    console.log(`\nNO ISSUES FOUND FOR: ${assigneeFilter}\n`);
    console.log("Available assignees:");
    const sortedAssignees = Array.from(issuesByAssignee.keys()).sort();
    for (const assignee of sortedAssignees) {
      console.log(`  - ${assignee}`);
    }
    console.log();
    return;
  }

  console.clear();
  console.log(`\nISSUES FOR: ${assigneeFilter} (${issues.length} issues)\n`);

  // Group by team
  const issuesByTeam = new Map<string, Issue[]>();
  for (const issue of issues) {
    const teamKey = `${issue.team_name} (${issue.team_key})`;
    const teamIssues = issuesByTeam.get(teamKey) || [];
    teamIssues.push(issue);
    issuesByTeam.set(teamKey, teamIssues);
  }

  for (const [teamKey, teamIssues] of issuesByTeam.entries()) {
    console.log(`\n📋 ${teamKey} - ${teamIssues.length} issues\n`);

    for (const issue of teamIssues) {
      console.log(`${issue.title}`);
      console.log(`   Status: ${issue.state_name}`);
      console.log(`   URL: ${issue.url}`);
      console.log();
    }
  }

  console.log();
}

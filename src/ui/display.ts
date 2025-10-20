import type { Issue } from "../db/schema.js";

export function displayIssues(issues: Issue[]): void {
  console.log("\nACTIVE ISSUES\n");

  if (issues.length === 0) {
    console.log("No active issues found.");
    console.log("Tip: Run 'bun start sync' to fetch issues from Linear.\n");
    return;
  }

  // Group by team
  const issuesByTeam = new Map<string, Issue[]>();
  for (const issue of issues) {
    const teamIssues = issuesByTeam.get(issue.team_id) || [];
    teamIssues.push(issue);
    issuesByTeam.set(issue.team_id, teamIssues);
  }

  for (const [teamId, teamIssues] of issuesByTeam.entries()) {
    const teamName = teamIssues[0].team_name;
    const teamKey = teamIssues[0].team_key;

    console.log(
      `\n📋 ${teamName} (${teamKey}) - ${teamIssues.length} issues\n`
    );

    for (const issue of teamIssues) {
      const assignee = issue.assignee_name || "Unassigned";
      const priorityLabel = getPriorityLabel(issue.priority);

      console.log(`${issue.title}`);
      console.log(
        `  Status: ${issue.state_name} | Assignee: ${assignee} | Priority: ${priorityLabel}`
      );
      console.log(`  URL: ${issue.url}`);
      console.log();
    }
  }

  // Display summary by assignee
  console.log("\nISSUES BY ASSIGNEE\n");

  const issuesByAssignee = new Map<string, Issue[]>();
  for (const issue of issues) {
    const assigneeName = issue.assignee_name || "Unassigned";
    const assigneeIssues = issuesByAssignee.get(assigneeName) || [];
    assigneeIssues.push(issue);
    issuesByAssignee.set(assigneeName, assigneeIssues);
  }

  const sortedAssignees = Array.from(issuesByAssignee.entries()).sort(
    (a, b) => b[1].length - a[1].length
  );

  for (const [assignee, assigneeIssues] of sortedAssignees) {
    console.log(`${assignee}: ${assigneeIssues.length} issues`);
  }

  console.log();
}

function getPriorityLabel(priority: number): string {
  switch (priority) {
    case 0:
      return "None";
    case 1:
      return "Urgent";
    case 2:
      return "High";
    case 3:
      return "Medium";
    case 4:
      return "Low";
    default:
      return "Unknown";
  }
}

export function displaySyncSummary(
  newCount: number,
  updatedCount: number,
  totalCount: number
): void {
  console.log("SYNC SUMMARY\n");
  console.log(`New issues:     ${newCount}`);
  console.log(`Updated issues: ${updatedCount}`);
  console.log(`Total issues:   ${totalCount}\n`);
}

export function displayError(message: string): void {
  console.error(`\n❌ Error: ${message}\n`);
}

export function displaySuccess(message: string): void {
  console.log(`\n✓ ${message}\n`);
}

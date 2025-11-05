import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import { getDatabase } from "../db/connection.js";
import { createLinearClient } from "../linear/client.js";
import type { View } from "./App.js";
import type { Issue } from "../db/schema.js";
import { BoxPanel, BoxPanelLine } from "./BoxPanel.js";

interface MainMenuProps {
  onSelectView: (view: View) => void;
}

type SyncStatus =
  | "idle"
  | "connecting"
  | "fetching"
  | "fetching_projects"
  | "storing"
  | "complete"
  | "error";
type CommentStatus = "idle" | "commenting" | "complete" | "error";

interface AssigneeViolation {
  name: string;
  count: number;
  status: "critical" | "warning" | "ok";
}

interface ProjectViolation {
  name: string;
  engineerCount: number;
  hasStatusMismatch: boolean;
  isStale: boolean;
}

export function MainMenu({ onSelectView }: MainMenuProps) {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [issueCount, setIssueCount] = useState(0);
  const [projectCount, setProjectCount] = useState(0);
  const [projectIssueCount, setProjectIssueCount] = useState(0);
  const [newCount, setNewCount] = useState(0);
  const [updatedCount, setUpdatedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Comment status
  const [commentStatus, setCommentStatus] = useState<CommentStatus>("idle");
  const [commentedCount, setCommentedCount] = useState(0);
  const [commentErrorMessage, setCommentErrorMessage] = useState<string | null>(
    null
  );

  // Dashboard data
  const [assigneeViolations, setAssigneeViolations] = useState<
    AssigneeViolation[]
  >([]);
  const [projectViolations, setProjectViolations] = useState<
    ProjectViolation[]
  >([]);
  const [totalAssignees, setTotalAssignees] = useState(0);
  const [totalProjects, setTotalProjects] = useState(0);
  const [unassignedCount, setUnassignedCount] = useState(0);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = () => {
    const db = getDatabase();

    // Load assignee violations (started issues only, > 5 issues)
    const startedIssues = db
      .prepare(
        `
      SELECT * FROM issues WHERE state_type = 'started'
    `
      )
      .all() as Issue[];

    const issuesByAssignee = new Map<string, Issue[]>();
    for (const issue of startedIssues) {
      const assignee = issue.assignee_name || "Unassigned";
      if (!issuesByAssignee.has(assignee)) {
        issuesByAssignee.set(assignee, []);
      }
      issuesByAssignee.get(assignee)?.push(issue);
    }

    // Track unassigned issues separately
    const unassignedIssues = issuesByAssignee.get("Unassigned");
    setUnassignedCount(unassignedIssues?.length || 0);

    const violations: AssigneeViolation[] = [];
    for (const [name, issues] of issuesByAssignee) {
      // Skip unassigned - they're tracked separately
      if (name === "Unassigned") continue;

      const count = issues.length;
      if (count > 5) {
        violations.push({
          name,
          count,
          status: count >= 8 ? "critical" : "warning",
        });
      }
    }
    violations.sort((a, b) => b.count - a.count);
    setAssigneeViolations(violations);

    // Don't count unassigned in total assignees
    setTotalAssignees(issuesByAssignee.size - (unassignedIssues ? 1 : 0));

    // Load project violations
    const allIssues = db
      .prepare(`SELECT * FROM issues WHERE project_id IS NOT NULL`)
      .all() as Issue[];

    const projectGroups = new Map<string, Issue[]>();
    for (const issue of allIssues) {
      if (!issue.project_id) continue;
      if (!projectGroups.has(issue.project_id)) {
        projectGroups.set(issue.project_id, []);
      }
      projectGroups.get(issue.project_id)?.push(issue);
    }

    const projViolations: ProjectViolation[] = [];
    for (const [projectId, issues] of projectGroups) {
      const hasStartedIssues = issues.some((i) => i.state_type === "started");
      if (!hasStartedIssues) continue; // Only active projects

      const engineers = new Set(
        issues.filter((i) => i.assignee_name).map((i) => i.assignee_name)
      );

      const projectState = issues[0].project_state?.toLowerCase() || "";
      const isProjectStarted =
        projectState.includes("progress") || projectState.includes("started");
      const hasStatusMismatch = hasStartedIssues && !isProjectStarted;

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const isStale = issues[0].project_updated_at
        ? new Date(issues[0].project_updated_at) < sevenDaysAgo
        : true;

      if (engineers.size > 1 || hasStatusMismatch || isStale) {
        projViolations.push({
          name: issues[0].project_name || "Unknown Project",
          engineerCount: engineers.size,
          hasStatusMismatch,
          isStale,
        });
      }
    }
    projViolations.sort((a, b) => b.engineerCount - a.engineerCount);
    setProjectViolations(projViolations);
    setTotalProjects(projectGroups.size);
  };

  const runSync = async () => {
    try {
      setSyncStatus("connecting");
      setErrorMessage(null);

      // Get ignored team keys
      const ignoredTeamKeys = process.env.IGNORED_TEAM_KEYS
        ? process.env.IGNORED_TEAM_KEYS.split(",").map((key) => key.trim())
        : [];

      // Connect to Linear
      const linearClient = createLinearClient();
      const connected = await linearClient.testConnection();

      if (!connected) {
        setSyncStatus("error");
        setErrorMessage("Failed to connect to Linear. Check your API key.");
        setTimeout(() => setSyncStatus("idle"), 3000);
        return;
      }

      // Fetch issues
      setSyncStatus("fetching");
      const allIssues = await linearClient.fetchStartedIssues((count) => {
        setIssueCount(count);
      });

      // Filter ignored teams
      const startedIssues = allIssues.filter(
        (issue) => !ignoredTeamKeys.includes(issue.teamKey)
      );

      // Phase 2: Fetch all issues for projects with active work
      const activeProjectIds = new Set(
        startedIssues
          .filter((issue) => issue.projectId)
          .map((issue) => issue.projectId as string)
      );

      setProjectCount(activeProjectIds.size);

      let projectIssues: typeof allIssues = [];
      if (activeProjectIds.size > 0) {
        setSyncStatus("fetching_projects");
        projectIssues = await linearClient.fetchIssuesByProjects(
          Array.from(activeProjectIds),
          (count) => {
            setProjectIssueCount(count);
          }
        );
      }

      // Combine all issues and deduplicate
      const allIssuesMap = new Map<string, (typeof allIssues)[0]>();
      for (const issue of [...startedIssues, ...projectIssues]) {
        allIssuesMap.set(issue.id, issue);
      }
      const issues = Array.from(allIssuesMap.values());

      // Store in database
      setSyncStatus("storing");
      const db = getDatabase();

      const getExistingIssueIds = db.prepare(`SELECT id FROM issues`);
      const existingIds = new Set(
        (getExistingIssueIds.all() as { id: string }[]).map((row) => row.id)
      );

      const upsertIssue = db.prepare(`
        INSERT INTO issues (
          id, identifier, title, description, team_id, team_name, team_key,
          state_id, state_name, state_type,
          assignee_id, assignee_name, priority, 
          created_at, updated_at, url,
          project_id, project_name, project_state, project_updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          identifier = excluded.identifier,
          title = excluded.title,
          description = excluded.description,
          team_id = excluded.team_id,
          team_name = excluded.team_name,
          team_key = excluded.team_key,
          state_id = excluded.state_id,
          state_name = excluded.state_name,
          state_type = excluded.state_type,
          assignee_id = excluded.assignee_id,
          assignee_name = excluded.assignee_name,
          priority = excluded.priority,
          updated_at = excluded.updated_at,
          url = excluded.url,
          project_id = excluded.project_id,
          project_name = excluded.project_name,
          project_state = excluded.project_state,
          project_updated_at = excluded.project_updated_at
      `);

      let newIssues = 0;
      let updatedIssues = 0;

      const syncTransaction = db.transaction(() => {
        for (const issue of issues) {
          if (existingIds.has(issue.id)) {
            updatedIssues++;
          } else {
            newIssues++;
          }

          upsertIssue.run(
            issue.id,
            issue.identifier,
            issue.title,
            issue.description,
            issue.teamId,
            issue.teamName,
            issue.teamKey,
            issue.stateId,
            issue.stateName,
            issue.stateType,
            issue.assigneeId,
            issue.assigneeName,
            issue.priority,
            issue.createdAt.toISOString(),
            issue.updatedAt.toISOString(),
            issue.url,
            issue.projectId,
            issue.projectName,
            issue.projectState,
            issue.projectUpdatedAt ? issue.projectUpdatedAt.toISOString() : null
          );
        }
      });

      syncTransaction();

      // Remove ignored teams from database
      if (ignoredTeamKeys.length > 0) {
        const placeholders = ignoredTeamKeys.map(() => "?").join(",");
        const deleteIgnored = db.prepare(`
          DELETE FROM issues WHERE team_key IN (${placeholders})
        `);
        deleteIgnored.run(...ignoredTeamKeys);
      }

      // Get total count
      const getTotalCount = db.prepare(`SELECT COUNT(*) as count FROM issues`);
      const total = (getTotalCount.get() as { count: number }).count;

      // Count started issues for reporting
      const startedCount = issues.filter(
        (i) => i.stateType === "started"
      ).length;

      setNewCount(newIssues);
      setUpdatedCount(updatedIssues);
      setTotalCount(total);
      setIssueCount(startedCount); // Reuse for started count in complete message
      setSyncStatus("complete");

      // Reload dashboard data after sync
      setTimeout(() => {
        setSyncStatus("idle");
        loadDashboardData();
      }, 3000);
    } catch (error) {
      setSyncStatus("error");
      setErrorMessage(
        error instanceof Error ? error.message : "An unknown error occurred"
      );
      setTimeout(() => setSyncStatus("idle"), 3000);
    }
  };

  const commentOnUnassigned = async () => {
    try {
      setCommentStatus("commenting");
      setCommentErrorMessage(null);
      setCommentedCount(0);

      const db = getDatabase();
      const unassignedIssues = db
        .prepare(
          `
        SELECT * FROM issues 
        WHERE state_type = 'started' AND assignee_name IS NULL
      `
        )
        .all() as Issue[];

      if (unassignedIssues.length === 0) {
        setCommentStatus("complete");
        setTimeout(() => setCommentStatus("idle"), 2000);
        return;
      }

      const linearClient = createLinearClient();
      const message =
        "⚠️ **This issue requires an assignee**\n\nThis started issue is currently unassigned. Please assign an owner to ensure it gets proper attention and tracking.";

      let successCount = 0;
      for (const issue of unassignedIssues) {
        const success = await linearClient.commentOnIssue(issue.id, message);
        if (success) {
          successCount++;
          setCommentedCount(successCount);
        }
      }

      setCommentStatus("complete");
      setTimeout(() => setCommentStatus("idle"), 3000);
    } catch (error) {
      setCommentStatus("error");
      setCommentErrorMessage(
        error instanceof Error ? error.message : "Failed to comment on issues"
      );
      setTimeout(() => setCommentStatus("idle"), 3000);
    }
  };

  useInput((input) => {
    // Handle keyboard shortcuts
    if (input === "s") {
      runSync();
    } else if (input === "b") {
      onSelectView("browse");
    } else if (input === "p") {
      onSelectView("projects");
    } else if (input === "u") {
      commentOnUnassigned();
    } else if (input === "q") {
      process.exit(0);
    }
  });

  const hasData = totalAssignees > 0 || totalProjects > 0;

  return (
    <Box flexDirection="column">
      {/* Hotkey Navigation */}
      <Box key="hotkeys" paddingX={2} paddingY={1}>
        <BoxPanel title="ACTIONS" width={65}>
          <BoxPanelLine>
            <Text color="cyan" bold>
              s
            </Text>{" "}
            sync │{" "}
            <Text color="cyan" bold>
              b
            </Text>{" "}
            issues │{" "}
            <Text color="cyan" bold>
              p
            </Text>{" "}
            projects │{" "}
            <Text color="cyan" bold>
              u
            </Text>{" "}
            comment-unassigned │{" "}
            <Text color="cyan" bold>
              q
            </Text>{" "}
            quit
          </BoxPanelLine>
        </BoxPanel>
      </Box>

      {/* Comment Status Bar */}
      {commentStatus !== "idle" && (
        <Box
          key="comment-status-bar"
          marginX={2}
          marginBottom={1}
          paddingX={2}
          paddingY={1}
          borderStyle="round"
          borderColor={
            commentStatus === "error"
              ? "red"
              : commentStatus === "complete"
              ? "green"
              : "magenta"
          }
        >
          {commentStatus === "commenting" && (
            <Box key="comment-commenting" flexDirection="column">
              <Box>
                <Text color="magenta">
                  <Spinner type="dots" />
                </Text>
                <Text> Commenting on unassigned issues...</Text>
              </Box>
              <Box marginTop={0}>
                <Text dimColor> Commented: {commentedCount}</Text>
              </Box>
            </Box>
          )}

          {commentStatus === "complete" && (
            <Box key="comment-complete" flexDirection="column">
              <Text color="green" bold>
                ✓ Comments Added!
              </Text>
              <Box marginTop={0}>
                <Text dimColor>
                  Added assignment warnings to {commentedCount} issue
                  {commentedCount === 1 ? "" : "s"}
                </Text>
              </Box>
            </Box>
          )}

          {commentStatus === "error" && (
            <Box key="comment-error" flexDirection="column">
              <Text color="red" bold>
                ✗ Comment Failed
              </Text>
              <Box marginTop={0}>
                <Text color="red">{commentErrorMessage}</Text>
              </Box>
            </Box>
          )}
        </Box>
      )}

      {/* Sync Status Bar */}
      {syncStatus !== "idle" && (
        <Box
          key="sync-status-bar"
          marginX={2}
          marginBottom={1}
          paddingX={2}
          paddingY={1}
          borderStyle="round"
          borderColor={
            syncStatus === "error"
              ? "red"
              : syncStatus === "complete"
              ? "green"
              : "cyan"
          }
        >
          {syncStatus === "connecting" && (
            <Box key="sync-connecting">
              <Text color="cyan">
                <Spinner type="dots" />
              </Text>
              <Text> Connecting to Linear...</Text>
            </Box>
          )}

          {syncStatus === "fetching" && (
            <Box key="sync-fetching" flexDirection="column">
              <Box>
                <Text color="cyan">
                  <Spinner type="dots" />
                </Text>
                <Text> Fetching started issues from Linear...</Text>
              </Box>
              <Box marginTop={0}>
                <Text dimColor> Issues found: {issueCount}</Text>
              </Box>
            </Box>
          )}

          {syncStatus === "fetching_projects" && (
            <Box key="sync-fetching-projects" flexDirection="column">
              <Box>
                <Text color="cyan">
                  <Spinner type="dots" />
                </Text>
                <Text>
                  {" "}
                  Fetching all project issues for completion tracking...
                </Text>
              </Box>
              <Box marginTop={0}>
                <Text dimColor>
                  {" "}
                  Projects: {projectCount} • Additional issues:{" "}
                  {projectIssueCount}
                </Text>
              </Box>
            </Box>
          )}

          {syncStatus === "storing" && (
            <Box key="sync-storing">
              <Text color="cyan">
                <Spinner type="dots" />
              </Text>
              <Text> Storing in database...</Text>
            </Box>
          )}

          {syncStatus === "complete" && (
            <Box key="sync-complete" flexDirection="column">
              <Text color="green" bold>
                ✓ Sync Complete!
              </Text>
              <Box marginTop={0}>
                <Text dimColor>
                  {issueCount} started issues • {totalCount} total issues in{" "}
                  {projectCount} projects
                </Text>
              </Box>
            </Box>
          )}

          {syncStatus === "error" && (
            <Box key="sync-error" flexDirection="column">
              <Text color="red" bold>
                ✗ Sync Failed
              </Text>
              <Box marginTop={0}>
                <Text color="red">{errorMessage}</Text>
              </Box>
            </Box>
          )}
        </Box>
      )}

      {/* Dashboard */}
      {!hasData && syncStatus === "idle" && (
        <Box flexDirection="column" paddingX={2} marginTop={1}>
          <Text dimColor>No data available. Press </Text>
          <Text color="cyan" bold>
            s
          </Text>
          <Text dimColor> to sync from Linear.</Text>
        </Box>
      )}

      {hasData && (
        <Box flexDirection="column" paddingX={2} marginTop={1}>
          {/* Summary Stats */}
          <BoxPanel title="OVERVIEW" width={52} marginBottom={2}>
            <BoxPanelLine>
              <Text bold>{totalAssignees}</Text>
              <Text dimColor> assignees • </Text>
              <Text bold>{totalProjects}</Text>
              <Text dimColor> active projects</Text>
              {unassignedCount > 0 && (
                <>
                  <Text dimColor> • </Text>
                  <Text bold color="magenta">
                    {unassignedCount}
                  </Text>
                  <Text dimColor> unassigned</Text>
                </>
              )}
            </BoxPanelLine>
          </BoxPanel>

          {/* Unassigned Issues */}
          {unassignedCount > 0 && (
            <Box flexDirection="column" marginBottom={2}>
              <Box marginBottom={1}>
                <Text bold color="magenta">
                  📋 UNASSIGNED ISSUES ({unassignedCount})
                </Text>
              </Box>
              <Box marginLeft={2}>
                <Text dimColor>
                  {unassignedCount} started issue
                  {unassignedCount === 1 ? "" : "s"} need
                  {unassignedCount === 1 ? "s" : ""} assignment
                </Text>
              </Box>
              <Box marginLeft={2} marginTop={0}>
                <Text dimColor>
                  Press <Text color="cyan">u</Text> to comment warnings on all •
                  Press <Text color="cyan">b</Text> to view list
                </Text>
              </Box>
            </Box>
          )}

          {/* Assignee Violations */}
          {assigneeViolations.length > 0 && (
            <Box flexDirection="column" marginBottom={2}>
              <Box marginBottom={1}>
                <Text bold color="red">
                  ⚠️ WIP VIOLATIONS BY ASSIGNEE ({assigneeViolations.length})
                </Text>
              </Box>
              {assigneeViolations.slice(0, 5).map((violation) => (
                <Box key={`assignee-${violation.name}`} marginLeft={2}>
                  <Text
                    color={violation.status === "critical" ? "red" : "yellow"}
                  >
                    {violation.status === "critical" ? "🔴" : "🟠"}
                  </Text>
                  <Box width={30} marginLeft={1}>
                    <Text
                      color={violation.status === "critical" ? "red" : "yellow"}
                    >
                      {violation.name}
                    </Text>
                  </Box>
                  <Text
                    color={violation.status === "critical" ? "red" : "yellow"}
                  >
                    {violation.count} issues
                  </Text>
                  <Text dimColor> (max: 5)</Text>
                </Box>
              ))}
              {assigneeViolations.length > 5 && (
                <Box marginLeft={2} marginTop={1}>
                  <Text dimColor>
                    ... and {assigneeViolations.length - 5} more (press{" "}
                    <Text color="cyan">b</Text> to view all)
                  </Text>
                </Box>
              )}
            </Box>
          )}

          {assigneeViolations.length === 0 && (
            <Box flexDirection="column" marginBottom={2}>
              <Text color="green">✓ No assignee WIP violations</Text>
              <Text dimColor> All assignees have ≤ 5 started issues</Text>
            </Box>
          )}

          {/* Project Violations */}
          {projectViolations.length > 0 && (
            <Box flexDirection="column" marginBottom={2}>
              <Box marginBottom={1}>
                <Text bold color="yellow">
                  ⚠️ PROJECT ISSUES ({projectViolations.length})
                </Text>
              </Box>
              {projectViolations.slice(0, 5).map((violation) => (
                <Box
                  key={`project-${violation.name}`}
                  marginLeft={2}
                  flexDirection="column"
                  marginBottom={1}
                >
                  <Box>
                    <Text color="yellow">📦</Text>
                    <Box width={35} marginLeft={1}>
                      <Text>{violation.name}</Text>
                    </Box>
                    <Text dimColor>
                      {violation.engineerCount} engineer
                      {violation.engineerCount > 1 ? "s" : ""}
                    </Text>
                  </Box>
                  <Box marginLeft={3}>
                    {violation.engineerCount > 1 && (
                      <Text color="yellow">
                        ⚠️ Multiple engineers (ideal: 1){" "}
                      </Text>
                    )}
                    {violation.hasStatusMismatch && (
                      <Text color="yellow">⚠️ Status mismatch </Text>
                    )}
                    {violation.isStale && (
                      <Text color="red">🕐 Stale (no update in 7+ days)</Text>
                    )}
                  </Box>
                </Box>
              ))}
              {projectViolations.length > 5 && (
                <Box marginLeft={2} marginTop={1}>
                  <Text dimColor>
                    ... and {projectViolations.length - 5} more (press{" "}
                    <Text color="cyan">p</Text> to view all)
                  </Text>
                </Box>
              )}
            </Box>
          )}

          {projectViolations.length === 0 && (
            <Box flexDirection="column" marginBottom={2}>
              <Text color="green">✓ No project issues detected</Text>
              <Text dimColor> All projects have proper status and updates</Text>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}

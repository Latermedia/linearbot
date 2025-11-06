import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import { getDatabase } from "../db/connection.js";
import { createLinearClient } from "../linear/client.js";
import type { View } from "./App.js";
import type { Issue } from "../db/schema.js";
import { BoxPanel, BoxPanelLine } from "./BoxPanel.js";
import {
  hasRecentComment,
  logComment,
  getUnassignedIssuesNeedingComments,
  COMMENT_TYPES,
  cleanupOldCommentLogs,
} from "../db/comment-tracking.js";
import { logCommentCreated, logCommentFailed } from "../utils/write-log.js";

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

interface EngineerMultiProjectViolation {
  engineerName: string;
  projectCount: number;
  projects: string[];
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
  const [commentedIssues, setCommentedIssues] = useState<Issue[]>([]);
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
  const [engineerMultiProjectViolations, setEngineerMultiProjectViolations] =
    useState<EngineerMultiProjectViolation[]>([]);
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

    // Track unassigned issues separately (exclude Paused/Blocked - often intentional)
    const unassignedIssues = issuesByAssignee.get("Unassigned");
    const actionableUnassigned = unassignedIssues?.filter(
      (issue) => issue.state_name !== "Paused" && issue.state_name !== "Blocked"
    );
    setUnassignedCount(actionableUnassigned?.length || 0);

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

    // Load engineers working on multiple projects
    const startedProjectIssues = db
      .prepare(
        `
      SELECT * FROM issues 
      WHERE state_type = 'started' 
      AND project_id IS NOT NULL 
      AND assignee_name IS NOT NULL
    `
      )
      .all() as Issue[];

    // Group by engineer to see how many projects each is working on
    const engineerProjects = new Map<string, Set<string>>();
    const engineerProjectNames = new Map<string, Map<string, string>>();

    for (const issue of startedProjectIssues) {
      const engineerName = issue.assignee_name!;
      const projectId = issue.project_id!;
      const projectName = issue.project_name || "Unknown Project";

      if (!engineerProjects.has(engineerName)) {
        engineerProjects.set(engineerName, new Set());
        engineerProjectNames.set(engineerName, new Map());
      }

      engineerProjects.get(engineerName)!.add(projectId);
      engineerProjectNames.get(engineerName)!.set(projectId, projectName);
    }

    // Find engineers working on multiple projects
    const multiProjectViolations: EngineerMultiProjectViolation[] = [];
    for (const [engineerName, projectIds] of engineerProjects) {
      if (projectIds.size > 1) {
        const projectNamesList = Array.from(projectIds).map(
          (id) => engineerProjectNames.get(engineerName)!.get(id)!
        );

        multiProjectViolations.push({
          engineerName,
          projectCount: projectIds.size,
          projects: projectNamesList,
        });
      }
    }

    multiProjectViolations.sort((a, b) => b.projectCount - a.projectCount);
    setEngineerMultiProjectViolations(multiProjectViolations);

    // Load project violations (status mismatch and staleness only)
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

      // Remove the engineerCount > 1 check - we're tracking that separately now
      if (hasStatusMismatch || isStale) {
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

  // Extract sync logic into a reusable function
  const performSync = async (
    includeProjectSync: boolean = true
  ): Promise<boolean> => {
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
        return false;
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

      // Phase 2: Fetch all issues for projects with active work (optional)
      let projectIssues: typeof allIssues = [];

      if (includeProjectSync) {
        const activeProjectIds = new Set(
          startedIssues
            .filter((issue) => issue.projectId)
            .map((issue) => issue.projectId as string)
        );

        setProjectCount(activeProjectIds.size);

        if (activeProjectIds.size > 0) {
          setSyncStatus("fetching_projects");
          projectIssues = await linearClient.fetchIssuesByProjects(
            Array.from(activeProjectIds),
            (count) => {
              setProjectIssueCount(count);
            }
          );
        }
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
          project_id, project_name, project_state, project_updated_at,
          project_lead_id, project_lead_name
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          project_updated_at = excluded.project_updated_at,
          project_lead_id = excluded.project_lead_id,
          project_lead_name = excluded.project_lead_name
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
            issue.projectUpdatedAt ? issue.projectUpdatedAt.toISOString() : null,
            issue.projectLeadId,
            issue.projectLeadName
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
      setIssueCount(startedCount);
      setSyncStatus("complete");

      return true;
    } catch (error) {
      setSyncStatus("error");
      setErrorMessage(
        error instanceof Error ? error.message : "An unknown error occurred"
      );
      setTimeout(() => setSyncStatus("idle"), 3000);
      return false;
    }
  };

  const runSync = async () => {
    // Full sync with project issues for complete dashboard data
    const success = await performSync(true);

    if (success) {
      // Reload dashboard data after sync
      setTimeout(() => {
        setSyncStatus("idle");
        loadDashboardData();
      }, 3000);
    }
  };

  const commentOnUnassigned = async () => {
    try {
      setCommentStatus("commenting");
      setCommentErrorMessage(null);
      setCommentedCount(0);
      setCommentedIssues([]);

      // Step 1: Sync first to get latest issue states (skip project sync - we only need started issues)
      const syncSuccess = await performSync(false);

      if (!syncSuccess) {
        setCommentStatus("error");
        setCommentErrorMessage("Failed to sync issues before commenting");
        setTimeout(() => setCommentStatus("idle"), 3000);
        return;
      }

      // Reset sync status after sync completes
      setSyncStatus("idle");

      // Step 2: Now proceed with commenting on fresh data
      setCommentStatus("commenting");

      const db = getDatabase();

      // Clean up old logs periodically (optional, keeps DB lean)
      cleanupOldCommentLogs(db);

      // Get all unassigned issues from the freshly synced database
      // Exclude Paused and Blocked states - these being unassigned is often intentional
      const unassignedIssues = db
        .prepare(
          `
        SELECT * FROM issues 
        WHERE state_type = 'started' 
          AND assignee_name IS NULL
          AND state_name NOT IN ('Paused', 'Blocked')
      `
        )
        .all() as Issue[];

      if (unassignedIssues.length === 0) {
        setCommentStatus("complete");
        setTimeout(() => setCommentStatus("idle"), 2000);
        return;
      }

      // Filter out issues we've commented on in the past 24 hours (local DB check)
      let issuesNeedingComments = unassignedIssues.filter(
        (issue) =>
          !hasRecentComment(db, issue.id, COMMENT_TYPES.UNASSIGNED_WARNING, 24)
      );

      const linearClient = createLinearClient();
      const message =
        "⚠️ **This issue requires an assignee**\n\nThis started issue is currently unassigned. Please assign an owner to ensure it gets proper attention and tracking.";

      // Unique identifier in the message to search for
      const messageIdentifier = "This issue requires an assignee";

      // Double-check against Linear API to catch any comments we didn't track
      const finalIssuesNeedingComments: Issue[] = [];

      for (const issue of issuesNeedingComments) {
        const hasLinearComment = await linearClient.hasRecentCommentWithText(
          issue.id,
          messageIdentifier,
          24
        );

        if (!hasLinearComment) {
          finalIssuesNeedingComments.push(issue);
        }
      }

      if (finalIssuesNeedingComments.length === 0) {
        setCommentStatus("complete");
        setCommentErrorMessage(
          `All ${unassignedIssues.length} unassigned issues already have recent warnings (< 24h)`
        );
        return;
      }

      // Comment on all issues that need warnings
      const successfullyCommented: Issue[] = [];
      let failedCount = 0;

      for (const issue of finalIssuesNeedingComments) {
        try {
          const success = await linearClient.commentOnIssue(issue.id, message);

          if (success) {
            // Log the successful comment to the write log
            logCommentCreated(
              issue.id,
              issue.identifier,
              issue.title,
              issue.url,
              COMMENT_TYPES.UNASSIGNED_WARNING,
              message
            );

            // Log the comment to DB to prevent duplicates
            logComment(db, issue.id, COMMENT_TYPES.UNASSIGNED_WARNING);

            successfullyCommented.push(issue);
            setCommentedCount(successfullyCommented.length);
            setCommentedIssues([...successfullyCommented]);
          } else {
            // Log the failed comment
            logCommentFailed(
              issue.id,
              issue.identifier,
              issue.title,
              issue.url,
              COMMENT_TYPES.UNASSIGNED_WARNING,
              "Comment API returned false"
            );
            failedCount++;
          }

          // Small delay to avoid rate limiting
          await new Promise((resolve) => setTimeout(resolve, 500));
        } catch (commentError) {
          // Log the failed comment with error details
          logCommentFailed(
            issue.id,
            issue.identifier,
            issue.title,
            issue.url,
            COMMENT_TYPES.UNASSIGNED_WARNING,
            commentError instanceof Error
              ? commentError.message
              : String(commentError)
          );
          failedCount++;
        }
      }

      if (failedCount > 0) {
        setCommentErrorMessage(
          `Commented on ${successfullyCommented.length} issues, ${failedCount} failed`
        );
      }

      setCommentStatus("complete");
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
    } else if (input === "i") {
      onSelectView("browse");
    } else if (input === "p") {
      onSelectView("projects");
    } else if (input === "e") {
      onSelectView("engineers");
    } else if (input === "u") {
      commentOnUnassigned();
    } else if (input === "c") {
      // Clear comment notification
      if (commentStatus === "complete") {
        setCommentStatus("idle");
        setCommentedCount(0);
        setCommentedIssues([]);
        setCommentErrorMessage(null);
      }
    } else if (input === "q") {
      process.exit(0);
    }
  });

  const hasData = totalAssignees > 0 || totalProjects > 0;

  return (
    <Box flexDirection="column">
      {/* Hotkey Navigation */}
      <Box key="hotkeys" paddingX={2} paddingY={1}>
        <BoxPanel title="ACTIONS" width={79}>
          <BoxPanelLine>
            <Text color="cyan" bold>
              s
            </Text>{" "}
            sync │{" "}
            <Text color="cyan" bold>
              i
            </Text>{" "}
            issues │{" "}
            <Text color="cyan" bold>
              p
            </Text>{" "}
            projects │{" "}
            <Text color="cyan" bold>
              e
            </Text>{" "}
            engineers │{" "}
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
                ✓ Comment{commentedCount > 0 ? "s Added!" : " Check Complete"}
              </Text>
              <Box marginTop={0}>
                <Text dimColor>
                  {commentedCount > 0
                    ? `Added assignment warning to ${commentedCount} issue${
                        commentedCount === 1 ? "" : "s"
                      }`
                    : commentErrorMessage || "No new comments needed"}
                </Text>
              </Box>
              {commentErrorMessage && commentedCount > 0 && (
                <Box marginTop={0}>
                  <Text color="yellow">{commentErrorMessage}</Text>
                </Box>
              )}
              {commentedIssues.length > 0 && (
                <Box flexDirection="column" marginTop={1}>
                  {commentedIssues.slice(0, 10).map((issue) => (
                    <Box key={issue.id} marginTop={0}>
                      <Text color="cyan">
                        🔗 {issue.identifier}: {issue.title.substring(0, 60)}
                        {issue.title.length > 60 ? "..." : ""}
                      </Text>
                    </Box>
                  ))}
                  {commentedIssues.length > 10 && (
                    <Box marginTop={0}>
                      <Text dimColor>
                        ... and {commentedIssues.length - 10} more
                      </Text>
                    </Box>
                  )}
                </Box>
              )}
              <Box marginTop={1}>
                <Text dimColor>
                  Press <Text color="cyan">c</Text> to clear this notification
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
                  ❓ UNASSIGNED ISSUES ({unassignedCount})
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
                  Press <Text color="cyan">u</Text> to comment warnings • Press{" "}
                  <Text color="cyan">i</Text> to view all
                </Text>
              </Box>
            </Box>
          )}

          {/* Assignee Violations */}
          {assigneeViolations.length > 0 && (
            <Box flexDirection="column" marginBottom={2}>
              <Box marginBottom={1}>
                <Text bold color="red">
                  🚨 WIP VIOLATIONS BY ASSIGNEE ({assigneeViolations.length})
                </Text>
              </Box>
              {assigneeViolations.slice(0, 5).map((violation) => (
                <Box key={`assignee-${violation.name}`} marginLeft={2}>
                  <Text
                    color={violation.status === "critical" ? "red" : "yellow"}
                  >
                    •
                  </Text>
                  <Box width={30}>
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
                </Box>
              ))}
              {assigneeViolations.length > 5 && (
                <Box marginLeft={2} marginTop={1}>
                  <Text dimColor>
                    ... and {assigneeViolations.length - 5} more • Press{" "}
                    <Text color="cyan">i</Text> to view all
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

          {/* Engineers on Multiple Projects */}
          {engineerMultiProjectViolations.length > 0 && (
            <Box flexDirection="column" marginBottom={2}>
              <Box marginBottom={1}>
                <Text bold color="yellow">
                  🔀 ENGINEERS ON MULTIPLE PROJECTS (
                  {engineerMultiProjectViolations.length})
                </Text>
              </Box>
              {engineerMultiProjectViolations.slice(0, 5).map((violation) => (
                <Box
                  key={`engineer-multi-${violation.engineerName}`}
                  marginLeft={2}
                >
                  <Text color="yellow">• </Text>
                  <Box width={30}>
                    <Text>{violation.engineerName}</Text>
                  </Box>
                  <Text dimColor>{violation.projectCount} projects</Text>
                </Box>
              ))}
              {engineerMultiProjectViolations.length > 5 && (
                <Box marginLeft={2} marginTop={1}>
                  <Text dimColor>
                    ... and {engineerMultiProjectViolations.length - 5} more •
                    Press <Text color="cyan">e</Text> to view all
                  </Text>
                </Box>
              )}
            </Box>
          )}

          {engineerMultiProjectViolations.length === 0 && (
            <Box flexDirection="column" marginBottom={2}>
              <Text color="green">✓ No multi-project violations</Text>
              <Text dimColor> All engineers focused on single projects</Text>
            </Box>
          )}

          {/* Project Violations */}
          {projectViolations.length > 0 && (
            <Box flexDirection="column" marginBottom={2}>
              <Box marginBottom={1}>
                <Text bold color="yellow">
                  😭 PROJECT ISSUES ({projectViolations.length})
                </Text>
              </Box>
              {projectViolations.slice(0, 5).map((violation) => {
                const issues = [];
                if (violation.hasStatusMismatch) {
                  issues.push("status mismatch");
                }
                if (violation.isStale) {
                  issues.push("stale 7+ days");
                }

                return (
                  <Box key={`project-${violation.name}`} marginLeft={2}>
                    <Text color="yellow">• </Text>
                    <Box width={35}>
                      <Text>{violation.name}</Text>
                    </Box>
                    <Text color={violation.isStale ? "red" : "yellow"}>
                      {issues.join(", ")}
                    </Text>
                  </Box>
                );
              })}
              {projectViolations.length > 5 && (
                <Box marginLeft={2} marginTop={1}>
                  <Text dimColor>
                    ... and {projectViolations.length - 5} more • Press{" "}
                    <Text color="cyan">p</Text> to view all
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

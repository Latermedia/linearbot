import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import type { View } from "./App.js";
import type { Issue } from "../src/db/schema.js";
import { BoxPanel, BoxPanelLine } from "./BoxPanel.js";
import { performSync } from "../src/services/sync-service.js";
import { loadDashboardData } from "../src/services/dashboard-service.js";
import { commentOnUnassignedIssues } from "../src/services/comment-service.js";
import { TIMEOUTS } from "../src/constants/thresholds.js";
import { hasDomainMappings } from "../src/utils/domain-mapping.js";
import type {
  AssigneeViolation,
  ProjectViolation,
  EngineerMultiProjectViolation,
} from "../src/types/violations.js";

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

  // Violation counts
  const [missingEstimateCount, setMissingEstimateCount] = useState(0);
  const [noRecentCommentCount, setNoRecentCommentCount] = useState(0);
  const [missingPriorityCount, setMissingPriorityCount] = useState(0);

  // Team statistics
  const [totalTeams, setTotalTeams] = useState(0);
  const [teamsWithViolations, setTeamsWithViolations] = useState(0);

  // Domain statistics
  const [totalDomains, setTotalDomains] = useState(0);
  const [domainsWithViolations, setDomainsWithViolations] = useState(0);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = () => {
    const data = loadDashboardData();
    setAssigneeViolations(data.assigneeViolations);
    setProjectViolations(data.projectViolations);
    setEngineerMultiProjectViolations(data.engineerMultiProjectViolations);
    setTotalAssignees(data.totalAssignees);
    setTotalProjects(data.totalProjects);
    setUnassignedCount(data.unassignedCount);
    setMissingEstimateCount(data.missingEstimateCount);
    setNoRecentCommentCount(data.noRecentCommentCount);
    setMissingPriorityCount(data.missingPriorityCount);
    setTotalTeams(data.totalTeams);
    setTeamsWithViolations(data.teamsWithViolations);
    setTotalDomains(data.totalDomains);
    setDomainsWithViolations(data.domainsWithViolations);
  };

  const runSyncWithCallbacks = async (
    includeProjectSync: boolean = true
  ): Promise<boolean> => {
    try {
      setSyncStatus("connecting");
      setErrorMessage(null);

      // Update status as sync progresses
      setSyncStatus("fetching");

      const result = await performSync(includeProjectSync, {
        onIssueCountUpdate: setIssueCount,
        onProjectCountUpdate: (count) => {
          setProjectCount(count);
          if (count > 0) {
          setSyncStatus("fetching_projects");
          }
        },
        onProjectIssueCountUpdate: setProjectIssueCount,
      });

      if (!result.success) {
        setSyncStatus("error");
        setErrorMessage(result.error || "Sync failed");
        setTimeout(() => setSyncStatus("idle"), TIMEOUTS.STATUS_MESSAGE_MS);
        return false;
      }

      // Update UI with results
      setSyncStatus("storing");
      setNewCount(result.newCount);
      setUpdatedCount(result.updatedCount);
      setTotalCount(result.totalCount);
      setIssueCount(result.issueCount);
      setProjectCount(result.projectCount);
      setSyncStatus("complete");

      return true;
    } catch (error) {
      setSyncStatus("error");
      setErrorMessage(
        error instanceof Error ? error.message : "An unknown error occurred"
      );
      setTimeout(() => setSyncStatus("idle"), TIMEOUTS.STATUS_MESSAGE_MS);
      return false;
    }
  };

  const runSync = async () => {
    // Full sync with project issues for complete dashboard data
    const success = await runSyncWithCallbacks(true);

    if (success) {
      // Reload dashboard data after sync
      setTimeout(() => {
        setSyncStatus("idle");
        loadDashboard();
      }, TIMEOUTS.STATUS_MESSAGE_MS);
    }
  };

  const commentOnUnassigned = async () => {
    try {
      setCommentStatus("commenting");
      setCommentErrorMessage(null);
      setCommentedCount(0);
      setCommentedIssues([]);

      // Sync will happen inside the comment service
      setSyncStatus("connecting");

      const result = await commentOnUnassignedIssues({
        onCommentedCountUpdate: setCommentedCount,
        onCommentedIssuesUpdate: setCommentedIssues,
      });

      // Reset sync status after sync completes
      setSyncStatus("idle");

      if (!result.success) {
        setCommentStatus("error");
        setCommentErrorMessage(result.errorMessage || "Failed to comment on issues");
        setTimeout(() => setCommentStatus("idle"), TIMEOUTS.STATUS_MESSAGE_MS);
        return;
      }

      setCommentedCount(result.commentedCount);
      setCommentedIssues(result.commentedIssues);
      if (result.errorMessage) {
        setCommentErrorMessage(result.errorMessage);
      }

      setCommentStatus("complete");
    } catch (error) {
      setSyncStatus("idle");
      setCommentStatus("error");
      setCommentErrorMessage(
        error instanceof Error ? error.message : "Failed to comment on issues"
      );
      setTimeout(() => setCommentStatus("idle"), TIMEOUTS.STATUS_MESSAGE_MS);
    }
  };

  const domainMappingsEnabled = hasDomainMappings();

  useInput((input) => {
    // Handle keyboard shortcuts
    if (input === "s") {
      runSync();
    } else if (input === "d" && domainMappingsEnabled) {
      onSelectView("domains");
    } else if (input === "t" && domainMappingsEnabled) {
      onSelectView("teams");
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
        <BoxPanel title="ACTIONS" width={90}>
          <BoxPanelLine>
            <Text color="cyan" bold>
              s
            </Text>{" "}
            sync │{" "}
            {domainMappingsEnabled && (
              <>
                <Text color="cyan" bold>
                  d
                </Text>{" "}
                domains │{" "}
                <Text color="cyan" bold>
                  t
                </Text>{" "}
                teams │{" "}
              </>
            )}
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
            comment │{" "}
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
                  📁 Projects: {projectCount} • Additional issues:{" "}
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
                  {issueCount} started issues • {totalCount} total issues in 📁{" "}
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
        <Box flexDirection="column" paddingX={2}>
          {/* Summary Stats */}
          <BoxPanel
            title="OVERVIEW"
            width={
              32 +
              totalAssignees.toString().length +
              totalProjects.toString().length
            }
            marginBottom={2}
          >
            <BoxPanelLine>
              <Text bold>{totalAssignees}</Text>
              <Text dimColor> assignees • </Text>
              <Text bold>{totalProjects}</Text>
              <Text dimColor> active projects</Text>
            </BoxPanelLine>
          </BoxPanel>

          {/* Domains Summary */}
          {domainMappingsEnabled && totalDomains > 0 && (
            <Box flexDirection="column" marginBottom={1}>
              <Text bold color="cyan">
                🌐 DOMAINS ({domainsWithViolations}/{totalDomains} domains with
                violations)
              </Text>
              <Box marginLeft={2}>
                <Text dimColor>
                  Press <Text color="cyan">d</Text> to view by domain
                </Text>
              </Box>
            </Box>
          )}

          {/* Teams Summary */}
          {domainMappingsEnabled && totalTeams > 0 && (
            <Box flexDirection="column" marginBottom={1}>
              <Text bold color="cyan">
                🏢 TEAMS ({teamsWithViolations}/{totalTeams} teams with
                violations)
              </Text>
              <Box marginLeft={2}>
                <Text dimColor>
                  Press <Text color="cyan">t</Text> to view by team
                </Text>
              </Box>
            </Box>
          )}

          {/* Unassigned Issues */}
          {unassignedCount > 0 && (
            <Box flexDirection="column" marginBottom={1}>
              <Text bold color="magenta">
                ❓ UNASSIGNED ISSUES ({unassignedCount})
              </Text>
              <Box marginLeft={2}>
                <Text dimColor>
                  Press <Text color="cyan">u</Text> to comment warnings • Press{" "}
                  <Text color="cyan">i</Text> to view by assignee
                </Text>
              </Box>
            </Box>
          )}

          {/* Assignee Violations */}
          {assigneeViolations.length > 0 && (
            <Box flexDirection="column" marginBottom={1}>
              <Text bold color="red">
                🚨 ISSUE VIOLATIONS (
                {assigneeViolations.length +
                  missingEstimateCount +
                  noRecentCommentCount +
                  missingPriorityCount}
                )
              </Text>
              <Box marginLeft={2}>
                <Text dimColor>
                  Press <Text color="cyan">i</Text> to view by assignee
                </Text>
              </Box>
            </Box>
          )}

          {assigneeViolations.length === 0 && (
            <Box flexDirection="column" marginBottom={1}>
              <Text color="green">✓ No WIP violations</Text>
              <Text dimColor> All assignees have ≤ 5 started issues</Text>
            </Box>
          )}

          {/* Engineers on Multiple Projects */}
          {engineerMultiProjectViolations.length > 0 && (
            <Box flexDirection="column" marginBottom={1}>
              <Text bold color="yellow">
                🔀 MULTI-PROJECT ENGINEERS (
                {engineerMultiProjectViolations.length})
              </Text>
              <Box marginLeft={2}>
                <Text dimColor>
                  Press <Text color="cyan">e</Text> to view all
                </Text>
              </Box>
            </Box>
          )}

          {engineerMultiProjectViolations.length === 0 && (
            <Box flexDirection="column" marginBottom={1}>
              <Text color="green">✓ No multi-project violations</Text>
            </Box>
          )}

          {/* Project Violations */}
          {projectViolations.length > 0 && (
            <Box flexDirection="column" marginBottom={1}>
              <Text bold color="yellow">
                📁 PROJECT VIOLATIONS ({projectViolations.length})
              </Text>
              <Box marginLeft={2}>
                <Text dimColor>
                  Press <Text color="cyan">p</Text> to view all
                </Text>
              </Box>
            </Box>
          )}

          {projectViolations.length === 0 && (
            <Box flexDirection="column" marginBottom={1}>
              <Text color="green">✓ No project issues</Text>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}

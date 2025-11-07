import React, { useState, useEffect } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import { getDatabase } from "../db/connection.js";
import { getWIPStatus } from "../utils/status-helpers.js";
import {
  hasNoRecentComment,
  getViolationIndicators,
} from "../utils/issue-validators.js";
import { openIssue } from "../utils/browser-helpers.js";
import type { Issue } from "../db/schema.js";

interface BrowseViewProps {
  onBack: () => void;
  onHeaderChange: (header: string) => void;
}

type BrowseMode = "assignees" | "issues" | "detail";
type SortMode = "count" | "name";

export function BrowseView({ onBack, onHeaderChange }: BrowseViewProps) {
  const { stdout } = useStdout();
  const [mode, setMode] = useState<BrowseMode>("assignees");
  const [sortMode, setSortMode] = useState<SortMode>("count");
  const [issuesByAssignee, setIssuesByAssignee] = useState<
    Map<string, Issue[]>
  >(new Map());
  const [selectedAssignee, setSelectedAssignee] = useState<string | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);

  useEffect(() => {
    loadIssues();
  }, []);

  // Update header when navigation changes
  useEffect(() => {
    if (mode === "assignees") {
      onHeaderChange("Issue Violations by Assignee");
    } else if (mode === "issues" && selectedAssignee) {
      const issueCount = issuesByAssignee.get(selectedAssignee)?.length || 0;
      onHeaderChange(`${selectedAssignee} (${issueCount} issues)`);
    } else if (mode === "detail" && selectedIssue) {
      onHeaderChange(`${selectedIssue.identifier}: ${selectedIssue.title}`);
    }
  }, [mode, selectedAssignee, selectedIssue, issuesByAssignee, onHeaderChange]);

  const loadIssues = () => {
    const db = getDatabase();
    const getIssues = db.prepare(`
      SELECT * FROM issues
      WHERE state_type = 'started'
      ORDER BY assignee_name, team_name, title
    `);
    const allIssues = getIssues.all() as Issue[];

    const grouped = new Map<string, Issue[]>();
    for (const issue of allIssues) {
      const assignee = issue.assignee_name || "Unassigned";
      if (!grouped.has(assignee)) {
        grouped.set(assignee, []);
      }
      grouped.get(assignee)?.push(issue);
    }

    setIssuesByAssignee(grouped);
  };

  // Helper function to get sorted assignees based on current sort mode
  const getSortedAssignees = () => {
    return Array.from(issuesByAssignee.entries()).sort((a, b) => {
      if (sortMode === "count") {
        return b[1].length - a[1].length; // Descending by count
      } else {
        return a[0].localeCompare(b[0]); // Ascending alphabetically
      }
    });
  };

  useInput((input, key) => {
    if (input === "b") {
      if (mode === "assignees") {
        onBack();
      } else if (mode === "issues") {
        setMode("assignees");
        setSelectedIndex(0);
        setScrollOffset(0);
      } else if (mode === "detail") {
        setMode("issues");
      }
    } else if (input === "s" && mode === "assignees") {
      // Toggle sort mode
      setSortMode((prev) => (prev === "count" ? "name" : "count"));
      setSelectedIndex(0);
      setScrollOffset(0);
    } else if (key.upArrow || input === "k") {
      if (mode === "assignees") {
        const assigneeCount = Array.from(issuesByAssignee.keys()).length;
        if (selectedIndex > 0) {
          const newIndex = selectedIndex - 1;
          setSelectedIndex(newIndex);

          // Adjust scroll to keep selection visible
          const terminalHeight = stdout?.rows || 24;
          const visibleLines = terminalHeight - 8; // Account for header/footer
          if (newIndex < scrollOffset) {
            setScrollOffset(newIndex);
          }
        }
      } else if (mode === "issues" && selectedAssignee) {
        const issues = issuesByAssignee.get(selectedAssignee) || [];
        if (selectedIndex > 0) {
          const newIndex = selectedIndex - 1;
          setSelectedIndex(newIndex);

          const terminalHeight = stdout?.rows || 24;
          const visibleLines = terminalHeight - 6;
          if (newIndex < scrollOffset) {
            setScrollOffset(newIndex);
          }
        }
      }
    } else if (key.downArrow || input === "j") {
      if (mode === "assignees") {
        const assigneeCount = Array.from(issuesByAssignee.keys()).length;
        if (selectedIndex < assigneeCount - 1) {
          const newIndex = selectedIndex + 1;
          setSelectedIndex(newIndex);

          // Adjust scroll to keep selection visible
          const terminalHeight = stdout?.rows || 24;
          const visibleLines = Math.max(5, terminalHeight - 7);
          if (newIndex >= scrollOffset + visibleLines) {
            setScrollOffset(newIndex - visibleLines + 1);
          }
        }
      } else if (mode === "issues" && selectedAssignee) {
        const issues = issuesByAssignee.get(selectedAssignee) || [];
        if (selectedIndex < issues.length - 1) {
          const newIndex = selectedIndex + 1;
          setSelectedIndex(newIndex);

          const terminalHeight = stdout?.rows || 24;
          const visibleLines = Math.max(5, terminalHeight - 10);
          if (newIndex >= scrollOffset + visibleLines) {
            setScrollOffset(newIndex - visibleLines + 1);
          }
        }
      }
    } else if (input === "o" && mode === "issues" && selectedAssignee) {
      // Open selected issue in browser
      const issues = issuesByAssignee.get(selectedAssignee) || [];
      const issue = issues[selectedIndex];
      if (issue) {
        openIssue(issue);
      }
    } else if (key.return) {
      if (mode === "assignees") {
        const sortedAssignees = getSortedAssignees();
        const [assignee] = sortedAssignees[selectedIndex];
        setSelectedAssignee(assignee);
        setMode("issues");
        setSelectedIndex(0);
        setScrollOffset(0);
      } else if (mode === "issues" && selectedAssignee) {
        const issues = issuesByAssignee.get(selectedAssignee) || [];
        setSelectedIssue(issues[selectedIndex]);
        setMode("detail");
      }
    }
  });

  if (issuesByAssignee.size === 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text dimColor>No started issues found.</Text>
        <Text dimColor>Run sync first to fetch issues from Linear.</Text>
        <Text dimColor>(Only issues with 'started' status are shown here)</Text>
        <Box marginTop={1}>
          <Text dimColor>Press 'b' to go back</Text>
        </Box>
      </Box>
    );
  }

  const totalIssues = Array.from(issuesByAssignee.values()).reduce(
    (sum, issues) => sum + issues.length,
    0
  );

  // Sort based on current sort mode
  const sortedAssignees = getSortedAssignees();

  // Count violations
  const violations = sortedAssignees.filter(
    ([_, issues]) => issues.length > 5
  ).length;

  // Calculate visible window
  const terminalHeight = stdout?.rows || 24;
  // Account for: App header (3) + view headers with margins (3) + footer (1) = 7 lines
  const visibleLines = Math.max(5, terminalHeight - 11);

  return (
    <Box flexDirection="column" paddingX={1}>
      {mode === "assignees" && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text dimColor>
              {totalIssues} issues • {issuesByAssignee.size} assignees •{" "}
              {violations} WIP violations • Sort:{" "}
              <Text color="cyan">{sortMode === "count" ? "Count" : "A-Z"}</Text>{" "}
              (press s)
            </Text>
          </Box>
          <Box marginBottom={1}>
            <Text dimColor>
              Navigate: ↑↓/j/k • Enter: Select
            </Text>
          </Box>
          <Box marginBottom={2}>
            <Text dimColor>
              📏 missing estimate  •  💬 no comment 24h  •  🔴 missing priority
            </Text>
          </Box>

          {sortedAssignees
            .slice(scrollOffset, scrollOffset + visibleLines)
            .map(([assignee, issues], displayIndex) => {
              const actualIndex = scrollOffset + displayIndex;
              const isSelected = actualIndex === selectedIndex;
              const count = issues.length;
              const status = getWIPStatus(count);

              // Count violations
              const missingEstimate = issues.filter((i) => !i.estimate).length;
              const noRecentComment = issues.filter((i) =>
                hasNoRecentComment(i)
              ).length;
              const missingPriority = issues.filter(
                (i) => i.priority === 0
              ).length;
              const violationSummary: string[] = [];
              if (missingEstimate > 0)
                violationSummary.push(`📏 ${missingEstimate}`);
              if (noRecentComment > 0)
                violationSummary.push(`💬 ${noRecentComment}`);
              if (missingPriority > 0)
                violationSummary.push(`🔴 ${missingPriority}`);

              return (
                <Box key={`assignee-${assignee}`}>
                  <Text color={isSelected ? "cyan" : "gray"}>
                    {isSelected ? "▶ " : "  "}
                  </Text>
                  <Box width={35}>
                    <Text
                      bold={isSelected}
                      color={isSelected ? "cyan" : "white"}
                    >
                      {assignee}
                    </Text>
                  </Box>
                  <Text color={status.color}>{status.emoji}</Text>
                  <Text> </Text>
                  <Text color={isSelected ? "cyan" : "white"}>{count}</Text>
                  {violationSummary.length > 0 && (
                    <>
                      <Text>  </Text>
                      <Text color={isSelected ? "cyan" : "yellow"}>
                        {violationSummary.join(" ")}
                      </Text>
                    </>
                  )}
                </Box>
              );
            })}

          {sortedAssignees.length > visibleLines && (
            <Box marginTop={1}>
              <Text dimColor>
                Showing {scrollOffset + 1}-
                {Math.min(scrollOffset + visibleLines, sortedAssignees.length)}{" "}
                of {sortedAssignees.length}
              </Text>
            </Box>
          )}
        </Box>
      )}

      {mode === "issues" && selectedAssignee && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text dimColor>
              Navigate: ↑↓/j/k • Enter: Details • o: Open • b: Back
            </Text>
          </Box>
          <Box marginBottom={1}>
            <Text dimColor>
              📏 missing estimate  •  💬 no comment 24h  •  🔴 missing priority
            </Text>
          </Box>

          {(issuesByAssignee.get(selectedAssignee) || [])
            .slice(scrollOffset, scrollOffset + visibleLines)
            .map((issue, displayIndex) => {
              const actualIndex = scrollOffset + displayIndex;
              const isSelected = actualIndex === selectedIndex;
              const title =
                issue.title.length > 50
                  ? issue.title.substring(0, 47) + "..."
                  : issue.title;
              const indicators = getViolationIndicators(issue);

              return (
                <Box key={`issue-${issue.id}`} marginBottom={0}>
                  <Text color={isSelected ? "cyan" : "gray"}>
                    {isSelected ? "▶ " : "  "}
                  </Text>
                  <Text bold={isSelected} color={isSelected ? "cyan" : "white"}>
                    [{issue.identifier}] ({issue.state_name}) {title}
                  </Text>
                  {indicators && (
                    <Text color={isSelected ? "cyan" : "yellow"}>
                      {" "}
                      {indicators}
                    </Text>
                  )}
                </Box>
              );
            })}

          {(issuesByAssignee.get(selectedAssignee)?.length || 0) >
            visibleLines && (
            <Box marginTop={1}>
              <Text dimColor>
                Showing {scrollOffset + 1}-
                {Math.min(
                  scrollOffset + visibleLines,
                  issuesByAssignee.get(selectedAssignee)?.length || 0
                )}{" "}
                of {issuesByAssignee.get(selectedAssignee)?.length}
              </Text>
            </Box>
          )}
        </Box>
      )}

      {mode === "detail" && selectedIssue && (
        <Box flexDirection="column" paddingX={1}>
          <Box marginBottom={1}>
            <Text bold color="cyan">
              {selectedIssue.title}
            </Text>
          </Box>
          <Box flexDirection="column" paddingLeft={2} marginBottom={1}>
            <Text>
              <Text color="gray">ID:</Text> {selectedIssue.identifier}
            </Text>
            <Text>
              <Text color="gray">Team:</Text> {selectedIssue.team_name} (
              {selectedIssue.team_key})
            </Text>
            <Text>
              <Text color="gray">Status:</Text> {selectedIssue.state_name}
            </Text>
            <Text>
              <Text color="gray">Assignee:</Text>{" "}
              {selectedIssue.assignee_name || "Unassigned"}
            </Text>
            <Text>
              <Text color="gray">URL:</Text> {selectedIssue.url}
            </Text>
          </Box>

          {selectedIssue.description && (
            <Box flexDirection="column" marginBottom={1}>
              <Text color="gray">Description:</Text>
              <Box paddingLeft={2} paddingTop={1}>
                <Text>
                  {selectedIssue.description.length > 300
                    ? selectedIssue.description.substring(0, 297) + "..."
                    : selectedIssue.description}
                </Text>
              </Box>
            </Box>
          )}

          <Box marginTop={1}>
            <Text dimColor>Press 'b' to go back</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}

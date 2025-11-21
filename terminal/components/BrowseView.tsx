import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { getStartedIssues } from "../src/db/queries.js";
import { getWIPStatus } from "../src/utils/status-helpers.js";
import {
  hasNoRecentComment,
  getViolationIndicators,
} from "../src/utils/issue-validators.js";
import { openIssue } from "../src/utils/browser-helpers.js";
import { useListNavigation } from "../hooks/useListNavigation.js";
import { useVisibleLines } from "../hooks/useVisibleLines.js";
import type { Issue } from "../src/db/schema.js";

interface BrowseViewProps {
  onBack: () => void;
  onHeaderChange: (header: string) => void;
}

type BrowseMode = "assignees" | "issues" | "detail";
type SortMode = "count" | "name";

export function BrowseView({ onBack, onHeaderChange }: BrowseViewProps) {
  const visibleLines = useVisibleLines(11);
  const [mode, setMode] = useState<BrowseMode>("assignees");
  const [sortMode, setSortMode] = useState<SortMode>("count");
  const [issuesByAssignee, setIssuesByAssignee] = useState<
    Map<string, Issue[]>
  >(new Map());
  const [selectedAssignee, setSelectedAssignee] = useState<string | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);

  // Navigation state for different modes
  const assigneeNav = useListNavigation(
    Array.from(issuesByAssignee.keys()).length,
    visibleLines
  );
  const issueNav = useListNavigation(
    selectedAssignee ? issuesByAssignee.get(selectedAssignee)?.length || 0 : 0,
    visibleLines
  );

  // Get current navigation based on mode
  const { selectedIndex, scrollOffset } =
    mode === "assignees" ? assigneeNav : issueNav;

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
    const allIssues = getStartedIssues();

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
        assigneeNav.reset();
      } else if (mode === "detail") {
        setMode("issues");
      }
    } else if (input === "s" && mode === "assignees") {
      // Toggle sort mode
      setSortMode((prev) => (prev === "count" ? "name" : "count"));
      assigneeNav.reset();
    } else if (key.upArrow || input === "k") {
      if (mode === "assignees") {
        assigneeNav.handleUp();
      } else if (mode === "issues") {
        issueNav.handleUp();
      }
    } else if (key.downArrow || input === "j") {
      if (mode === "assignees") {
        assigneeNav.handleDown();
      } else if (mode === "issues") {
        issueNav.handleDown();
      }
    } else if (input === "o" && mode === "issues" && selectedAssignee) {
      // Open selected issue in browser
      const issues = issuesByAssignee.get(selectedAssignee) || [];
      const issue = issues[issueNav.selectedIndex];
      if (issue) {
        openIssue(issue);
      }
    } else if (key.return) {
      if (mode === "assignees") {
        const sortedAssignees = getSortedAssignees();
        const [assignee] = sortedAssignees[assigneeNav.selectedIndex];
        setSelectedAssignee(assignee);
        setMode("issues");
        issueNav.reset();
      } else if (mode === "issues" && selectedAssignee) {
        const issues = issuesByAssignee.get(selectedAssignee) || [];
        setSelectedIssue(issues[issueNav.selectedIndex]);
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
            <Text dimColor>Navigate: ↑↓/j/k • Enter: Select</Text>
          </Box>
          <Box marginBottom={2}>
            <Text dimColor>
              📏 missing estimate • 💬 no comment 24h • 🔴 missing priority
            </Text>
          </Box>

          {sortedAssignees
            .slice(
              assigneeNav.scrollOffset,
              assigneeNav.scrollOffset + visibleLines
            )
            .map(([assignee, issues], displayIndex) => {
              const actualIndex = assigneeNav.scrollOffset + displayIndex;
              const isSelected = actualIndex === assigneeNav.selectedIndex;
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
                      <Text> </Text>
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
                Showing {assigneeNav.scrollOffset + 1}-
                {Math.min(
                  assigneeNav.scrollOffset + visibleLines,
                  sortedAssignees.length
                )}{" "}
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
              📏 missing estimate • 💬 no comment 24h • 🔴 missing priority
            </Text>
          </Box>

          {(issuesByAssignee.get(selectedAssignee) || [])
            .slice(issueNav.scrollOffset, issueNav.scrollOffset + visibleLines)
            .map((issue, displayIndex) => {
              const actualIndex = issueNav.scrollOffset + displayIndex;
              const isSelected = actualIndex === issueNav.selectedIndex;
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
                Showing {issueNav.scrollOffset + 1}-
                {Math.min(
                  issueNav.scrollOffset + visibleLines,
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

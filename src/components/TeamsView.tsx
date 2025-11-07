import React, { useState, useEffect } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import { getDatabase } from "../db/connection.js";
import type { Issue } from "../db/schema.js";

interface TeamsViewProps {
  onBack: () => void;
  onHeaderChange: (header: string) => void;
}

type ViewMode = "teams" | "issues";

interface TeamViolationSummary {
  teamKey: string;
  teamName: string;
  totalIssues: number;
  missingEstimate: number;
  noRecentComment: number;
  missingPriority: number;
  wipViolations: number; // Assignees with > 5 issues
  totalViolations: number;
  issues: Issue[];
}

function hasNoRecentComment(issue: Issue): boolean {
  if (!issue.last_comment_at) return true;
  const lastComment = new Date(issue.last_comment_at);
  const now = new Date();
  const hoursDiff = (now.getTime() - lastComment.getTime()) / (1000 * 60 * 60);
  return hoursDiff > 24;
}

export function TeamsView({ onBack, onHeaderChange }: TeamsViewProps) {
  const { stdout } = useStdout();
  const [mode, setMode] = useState<ViewMode>("teams");
  const [teams, setTeams] = useState<TeamViolationSummary[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<TeamViolationSummary | null>(
    null
  );
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);

  useEffect(() => {
    loadTeams();
  }, []);

  // Update header when navigation changes
  useEffect(() => {
    if (mode === "teams") {
      onHeaderChange("Issue Violations by Team");
    } else if (mode === "issues" && selectedTeam) {
      onHeaderChange(
        `${selectedTeam.teamName} (${selectedTeam.totalIssues} issues)`
      );
    }
  }, [mode, selectedTeam, onHeaderChange]);

  const loadTeams = () => {
    const db = getDatabase();
    const startedIssues = db
      .prepare(`SELECT * FROM issues WHERE state_type = 'started'`)
      .all() as Issue[];

    // First, build a global map of all assignees to their TOTAL issue count across all teams
    const globalAssigneeIssueCount = new Map<string, number>();
    for (const issue of startedIssues) {
      const assignee = issue.assignee_name || "Unassigned";
      globalAssigneeIssueCount.set(
        assignee,
        (globalAssigneeIssueCount.get(assignee) || 0) + 1
      );
    }

    // Group by team
    const teamMap = new Map<string, Issue[]>();
    for (const issue of startedIssues) {
      const teamKey = issue.team_key;
      if (!teamMap.has(teamKey)) {
        teamMap.set(teamKey, []);
      }
      teamMap.get(teamKey)?.push(issue);
    }

    // Calculate violations per team
    const teamSummaries: TeamViolationSummary[] = [];
    for (const [teamKey, issues] of teamMap) {
      const missingEstimate = issues.filter((i) => !i.estimate).length;
      const noRecentComment = issues.filter((i) =>
        hasNoRecentComment(i)
      ).length;
      const missingPriority = issues.filter((i) => i.priority === 0).length;

      // Calculate WIP violations: count unique team members whose TOTAL issues (across all teams) > 5
      const teamMembers = new Set<string>();
      for (const issue of issues) {
        const assignee = issue.assignee_name || "Unassigned";
        teamMembers.add(assignee);
      }

      const wipViolations = Array.from(teamMembers).filter(
        (assignee) => (globalAssigneeIssueCount.get(assignee) || 0) > 5
      ).length;

      const totalViolations =
        missingEstimate + noRecentComment + missingPriority + wipViolations;

      teamSummaries.push({
        teamKey,
        teamName: issues[0].team_name,
        totalIssues: issues.length,
        missingEstimate,
        noRecentComment,
        missingPriority,
        wipViolations,
        totalViolations,
        issues,
      });
    }

    // Sort by total violations descending
    teamSummaries.sort((a, b) => b.totalViolations - a.totalViolations);
    setTeams(teamSummaries);
  };

  useInput((input, key) => {
    if (input === "b" || key.escape) {
      if (mode === "teams") {
        onBack();
      } else if (mode === "issues") {
        setMode("teams");
        setSelectedIndex(0);
        setScrollOffset(0);
      }
    } else if (input === "o" && mode === "issues" && selectedTeam) {
      // Open selected issue in browser
      const issue = selectedTeam.issues[selectedIndex];
      if (issue) {
        require("child_process").exec(
          process.platform === "darwin"
            ? `open "${issue.url}"`
            : process.platform === "win32"
            ? `start "${issue.url}"`
            : `xdg-open "${issue.url}"`
        );
      }
    } else if (key.upArrow || input === "k") {
      if (selectedIndex > 0) {
        const newIndex = selectedIndex - 1;
        setSelectedIndex(newIndex);

        const terminalHeight = stdout?.rows || 24;
        const visibleLines = Math.max(5, terminalHeight - 7);
        if (newIndex < scrollOffset) {
          setScrollOffset(newIndex);
        }
      }
    } else if (key.downArrow || input === "j") {
      const maxIndex =
        mode === "teams"
          ? teams.length - 1
          : (selectedTeam?.issues.length || 1) - 1;

      if (selectedIndex < maxIndex) {
        const newIndex = selectedIndex + 1;
        setSelectedIndex(newIndex);

        const terminalHeight = stdout?.rows || 24;
        const visibleLines = Math.max(5, terminalHeight - 7);
        if (newIndex >= scrollOffset + visibleLines) {
          setScrollOffset(newIndex - visibleLines + 1);
        }
      }
    } else if (key.return && mode === "teams") {
      setSelectedTeam(teams[selectedIndex]);
      setMode("issues");
      setSelectedIndex(0);
      setScrollOffset(0);
    }
  });

  const terminalHeight = stdout?.rows || 24;
  const visibleLines = Math.max(5, terminalHeight - 7);

  if (teams.length === 0) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text dimColor>No started issues found.</Text>
        <Box marginTop={1}>
          <Text dimColor>Press 'b' to go back</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      {mode === "teams" && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text dimColor>
              {teams.reduce((sum, t) => sum + t.totalIssues, 0)} issues across{" "}
              {teams.length} teams • Navigate: ↑↓/j/k • Enter: View issues
            </Text>
          </Box>
          <Box marginBottom={1}>
            <Text dimColor>
              👤 WIP • 📏 missing estimate • 💬 no comment 24h • 🔴 missing
              priority
            </Text>
          </Box>

          {teams
            .slice(scrollOffset, scrollOffset + visibleLines)
            .map((team, displayIndex) => {
              const actualIndex = scrollOffset + displayIndex;
              const isSelected = actualIndex === selectedIndex;

              return (
                <Box key={`team-${team.teamKey}`}>
                  <Text color={isSelected ? "cyan" : "gray"}>
                    {isSelected ? "▶ " : "  "}
                  </Text>
                  <Box width={30}>
                    <Text
                      bold={isSelected}
                      color={isSelected ? "cyan" : "white"}
                    >
                      {team.teamName}
                    </Text>
                  </Box>
                  <Text color={isSelected ? "cyan" : "white"}>
                    📋 {team.totalIssues}
                  </Text>
                  {(team.wipViolations > 0 ||
                    team.missingEstimate > 0 ||
                    team.noRecentComment > 0 ||
                    team.missingPriority > 0) && (
                    <>
                      <Text color={isSelected ? "cyan" : "white"}> • </Text>
                      <Text
                        color={
                          isSelected
                            ? "cyan"
                            : team.wipViolations > 0 ||
                              team.missingEstimate > 0 ||
                              team.noRecentComment > 0 ||
                              team.missingPriority > 0
                            ? "yellow"
                            : "white"
                        }
                      >
                        {team.wipViolations > 0 && `👤 ${team.wipViolations} `}
                        {team.missingEstimate > 0 &&
                          `📏 ${team.missingEstimate} `}
                        {team.noRecentComment > 0 &&
                          `💬 ${team.noRecentComment} `}
                        {team.missingPriority > 0 &&
                          `🔴 ${team.missingPriority}`}
                      </Text>
                    </>
                  )}
                  {team.wipViolations === 0 &&
                    team.missingEstimate === 0 &&
                    team.noRecentComment === 0 &&
                    team.missingPriority === 0 && (
                      <>
                        <Text color={isSelected ? "cyan" : "white"}> • </Text>
                        <Text color={isSelected ? "cyan" : "green"}>✓</Text>
                      </>
                    )}
                </Box>
              );
            })}

          {teams.length > visibleLines && (
            <Box marginTop={1}>
              <Text dimColor>
                Showing {scrollOffset + 1}-
                {Math.min(scrollOffset + visibleLines, teams.length)} of{" "}
                {teams.length}
              </Text>
            </Box>
          )}
        </Box>
      )}

      {mode === "issues" && selectedTeam && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text dimColor>Navigate: ↑↓/j/k • o: Open • b: Back</Text>
          </Box>
          <Box marginBottom={1}>
            <Text dimColor>
              📏 missing estimate • 💬 no comment 24h • 🔴 missing priority
            </Text>
          </Box>

          {selectedTeam.issues
            .slice(scrollOffset, scrollOffset + visibleLines)
            .map((issue, displayIndex) => {
              const actualIndex = scrollOffset + displayIndex;
              const isSelected = actualIndex === selectedIndex;
              const title =
                issue.title.length > 40
                  ? issue.title.substring(0, 37) + "..."
                  : issue.title;

              const violations: string[] = [];
              if (!issue.estimate) violations.push("📏");
              if (hasNoRecentComment(issue)) violations.push("💬");
              if (issue.priority === 0) violations.push("🔴");

              return (
                <Box key={`issue-${issue.id}`}>
                  <Text color={isSelected ? "cyan" : "gray"}>
                    {isSelected ? "▶ " : "  "}
                  </Text>
                  <Box width={15}>
                    <Text
                      bold={isSelected}
                      color={isSelected ? "cyan" : "white"}
                    >
                      {issue.identifier}
                    </Text>
                  </Box>
                  <Box width={20}>
                    <Text color={isSelected ? "cyan" : "gray"}>
                      {issue.assignee_name || "Unassigned"}
                    </Text>
                  </Box>
                  <Text bold={isSelected} color={isSelected ? "cyan" : "white"}>
                    {title}
                  </Text>
                  {violations.length > 0 && (
                    <Text color={isSelected ? "cyan" : "yellow"}>
                      {" "}
                      {violations.join(" ")}
                    </Text>
                  )}
                </Box>
              );
            })}

          {selectedTeam.issues.length > visibleLines && (
            <Box marginTop={1}>
              <Text dimColor>
                Showing {scrollOffset + 1}-
                {Math.min(
                  scrollOffset + visibleLines,
                  selectedTeam.issues.length
                )}{" "}
                of {selectedTeam.issues.length}
              </Text>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}

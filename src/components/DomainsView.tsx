import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { getDatabase } from "../db/connection.js";
import {
  hasNoRecentComment,
  getViolationIndicators,
  hasMissingEstimate,
  hasMissingPriority,
} from "../utils/issue-validators.js";
import { openIssue } from "../utils/browser-helpers.js";
import { useListNavigation } from "../hooks/useListNavigation.js";
import { useVisibleLines } from "../hooks/useVisibleLines.js";
import type { Issue } from "../db/schema.js";
import {
  getDomainForTeam,
  ALL_DOMAINS,
  type DomainName,
} from "../utils/domain-mapping.js";

interface DomainsViewProps {
  onBack: () => void;
  onHeaderChange: (header: string) => void;
}

type ViewMode = "domains" | "teams" | "issues";

interface DomainViolationSummary {
  domainName: DomainName;
  totalIssues: number;
  projectCount: number;
  engineerCount: number;
  missingEstimate: number;
  noRecentComment: number;
  missingPriority: number;
  wipViolations: number;
  totalViolations: number;
  teams: TeamViolationSummary[];
}

interface TeamViolationSummary {
  teamKey: string;
  teamName: string;
  totalIssues: number;
  projectCount: number;
  engineerCount: number;
  missingEstimate: number;
  noRecentComment: number;
  missingPriority: number;
  wipViolations: number;
  totalViolations: number;
  issues: Issue[];
}

export function DomainsView({ onBack, onHeaderChange }: DomainsViewProps) {
  const visibleLines = useVisibleLines();
  const [mode, setMode] = useState<ViewMode>("domains");
  const [domains, setDomains] = useState<DomainViolationSummary[]>([]);
  const [selectedDomain, setSelectedDomain] =
    useState<DomainViolationSummary | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<TeamViolationSummary | null>(
    null
  );
  
  // Navigation for all 3 modes
  const domainsNav = useListNavigation(domains.length, visibleLines);
  const teamsNav = useListNavigation(
    selectedDomain?.teams.length || 0,
    visibleLines
  );
  const issuesNav = useListNavigation(
    selectedTeam?.issues.length || 0,
    visibleLines
  );
  
  const { selectedIndex, scrollOffset } =
    mode === "domains" ? domainsNav :
    mode === "teams" ? teamsNav :
    issuesNav;

  useEffect(() => {
    loadDomains();
  }, []);

  // Update header when navigation changes
  useEffect(() => {
    if (mode === "domains") {
      onHeaderChange("Domains");
    } else if (mode === "teams" && selectedDomain) {
      onHeaderChange(`${selectedDomain.domainName} Teams`);
    } else if (mode === "issues" && selectedTeam) {
      onHeaderChange(
        `${selectedTeam.teamName} (${selectedTeam.totalIssues} issues)`
      );
    }
  }, [mode, selectedDomain, selectedTeam, onHeaderChange]);

  const loadDomains = () => {
    const db = getDatabase();
    const startedIssues = db
      .prepare(`SELECT * FROM issues WHERE state_type = 'started'`)
      .all() as Issue[];

    // Build global assignee issue count
    const globalAssigneeIssueCount = new Map<string, number>();
    for (const issue of startedIssues) {
      const assignee = issue.assignee_name || "Unassigned";
      globalAssigneeIssueCount.set(
        assignee,
        (globalAssigneeIssueCount.get(assignee) || 0) + 1
      );
    }

    // Group by team first
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
      const missingEstimate = issues.filter(hasMissingEstimate).length;
      const noRecentComment = issues.filter(hasNoRecentComment).length;
      const missingPriority = issues.filter(hasMissingPriority).length;

      // Calculate WIP violations
      const teamMembers = new Set<string>();
      for (const issue of issues) {
        const assignee = issue.assignee_name || "Unassigned";
        teamMembers.add(assignee);
      }

      const wipViolations = Array.from(teamMembers).filter(
        (assignee) => (globalAssigneeIssueCount.get(assignee) || 0) > 5
      ).length;

      // Count unique projects this team is working on (excluding issues with no project)
      const uniqueProjects = new Set(
        issues.filter((i) => i.project_id).map((i) => i.project_id)
      );
      const projectCount = uniqueProjects.size;

      const totalViolations =
        missingEstimate + noRecentComment + missingPriority + wipViolations;

      teamSummaries.push({
        teamKey,
        teamName: issues[0].team_name,
        totalIssues: issues.length,
        projectCount,
        engineerCount: teamMembers.size,
        missingEstimate,
        noRecentComment,
        missingPriority,
        wipViolations,
        totalViolations,
        issues,
      });
    }

    // Group teams by domain
    const domainMap = new Map<DomainName, TeamViolationSummary[]>();
    for (const team of teamSummaries) {
      const domain = getDomainForTeam(team.teamKey);
      if (domain) {
        if (!domainMap.has(domain)) {
          domainMap.set(domain, []);
        }
        domainMap.get(domain)?.push(team);
      }
    }

    // Calculate domain summaries
    const domainSummaries: DomainViolationSummary[] = [];
    for (const domainName of ALL_DOMAINS) {
      const teams = domainMap.get(domainName) || [];
      if (teams.length === 0) continue;

      const totalIssues = teams.reduce((sum, t) => sum + t.totalIssues, 0);
      const missingEstimate = teams.reduce(
        (sum, t) => sum + t.missingEstimate,
        0
      );
      const noRecentComment = teams.reduce(
        (sum, t) => sum + t.noRecentComment,
        0
      );
      const missingPriority = teams.reduce(
        (sum, t) => sum + t.missingPriority,
        0
      );
      const wipViolations = teams.reduce((sum, t) => sum + t.wipViolations, 0);
      const totalViolations =
        missingEstimate + noRecentComment + missingPriority + wipViolations;

      // Count unique projects teams in this domain are working on (excluding issues with no project)
      const uniqueProjects = new Set<string>();
      teams.forEach((team) => {
        team.issues.forEach((issue) => {
          if (issue.project_id) {
            uniqueProjects.add(issue.project_id);
          }
        });
      });
      const projectCount = uniqueProjects.size;

      // Count unique engineers across all teams in this domain
      const uniqueEngineers = new Set<string>();
      teams.forEach((team) => {
        team.issues.forEach((issue) => {
          const assignee = issue.assignee_name || "Unassigned";
          uniqueEngineers.add(assignee);
        });
      });
      const engineerCount = uniqueEngineers.size;

      // Sort teams within domain by violations
      teams.sort((a, b) => b.totalViolations - a.totalViolations);

      domainSummaries.push({
        domainName,
        totalIssues,
        projectCount,
        engineerCount,
        missingEstimate,
        noRecentComment,
        missingPriority,
        wipViolations,
        totalViolations,
        teams,
      });
    }

    // Sort domains by total violations descending
    domainSummaries.sort((a, b) => b.totalViolations - a.totalViolations);
    setDomains(domainSummaries);
  };

  useInput((input, key) => {
    if (input === "b" || key.escape) {
      if (mode === "domains") {
        onBack();
      } else if (mode === "teams") {
        setMode("domains");
        domainsNav.reset();
      } else if (mode === "issues") {
        setMode("teams");
        teamsNav.reset();
      }
    } else if (input === "o" && mode === "issues" && selectedTeam) {
      // Open selected issue in browser
      const issue = selectedTeam.issues[issuesNav.selectedIndex];
      if (issue) {
        openIssue(issue);
      }
    } else if (key.upArrow || input === "k") {
      if (mode === "domains") {
        domainsNav.handleUp();
      } else if (mode === "teams") {
        teamsNav.handleUp();
      } else {
        issuesNav.handleUp();
      }
    } else if (key.downArrow || input === "j") {
      if (mode === "domains") {
        domainsNav.handleDown();
      } else if (mode === "teams") {
        teamsNav.handleDown();
      } else {
        issuesNav.handleDown();
      }
    } else if (key.return && mode === "domains") {
      setSelectedDomain(domains[domainsNav.selectedIndex]);
      setMode("teams");
      teamsNav.reset();
    } else if (key.return && mode === "teams" && selectedDomain) {
      setSelectedTeam(selectedDomain.teams[teamsNav.selectedIndex]);
      setMode("issues");
      issuesNav.reset();
    }
  });

  if (domains.length === 0) {
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
      {mode === "domains" && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text dimColor>
              👥 {domains.reduce((sum, d) => sum + d.engineerCount, 0)} engineers
              • 📁{" "}
              {domains.reduce((sum, d) => sum + d.projectCount, 0)} projects •
              📋{" "}
              {domains.reduce((sum, d) => sum + d.totalIssues, 0)} issues across{" "}
              {domains.length} domains
            </Text>
          </Box>
          <Box marginBottom={1}>
            <Text dimColor>Navigate: ↑↓/j/k • Enter: View teams</Text>
          </Box>
          <Box marginBottom={1}>
            <Text dimColor>
              👤 WIP  •  📏 missing estimate  •  💬 no comment 24h  •  🔴 missing priority
            </Text>
          </Box>

          {domains
            .slice(domainsNav.scrollOffset, domainsNav.scrollOffset + visibleLines)
            .map((domain, displayIndex) => {
              const actualIndex = domainsNav.scrollOffset + displayIndex;
              const isSelected = actualIndex === domainsNav.selectedIndex;

              return (
                <Box key={`domain-${domain.domainName}`}>
                  <Text color={isSelected ? "cyan" : "gray"}>
                    {isSelected ? "▶ " : "  "}
                  </Text>
                  <Box width={35}>
                    <Text
                      bold={isSelected}
                      color={isSelected ? "cyan" : "white"}
                    >
                      {domain.domainName}
                    </Text>
                  </Box>
                  <Text color={isSelected ? "cyan" : "white"}>
                    (👥 {domain.engineerCount} 📁 {domain.projectCount} 📋{" "}
                    {domain.totalIssues})
                  </Text>
                  {(domain.wipViolations > 0 ||
                    domain.missingEstimate > 0 ||
                    domain.noRecentComment > 0 ||
                    domain.missingPriority > 0) && (
                    <>
                      <Text color={isSelected ? "cyan" : "white"}>  •  </Text>
                      <Text
                        color={
                          isSelected
                            ? "cyan"
                            : domain.wipViolations > 0 ||
                              domain.missingEstimate > 0 ||
                              domain.noRecentComment > 0 ||
                              domain.missingPriority > 0
                            ? "yellow"
                            : "white"
                        }
                      >
                        🚨(
                        {domain.wipViolations > 0 && `👤 ${domain.wipViolations} `}
                        {domain.missingEstimate > 0 &&
                          `📏 ${domain.missingEstimate} `}
                        {domain.noRecentComment > 0 &&
                          `💬 ${domain.noRecentComment} `}
                        {domain.missingPriority > 0 &&
                          `🔴 ${domain.missingPriority}`})
                      </Text>
                    </>
                  )}
                  {domain.wipViolations === 0 &&
                    domain.missingEstimate === 0 &&
                    domain.noRecentComment === 0 &&
                    domain.missingPriority === 0 && (
                      <>
                        <Text color={isSelected ? "cyan" : "white"}>  •  </Text>
                        <Text color={isSelected ? "cyan" : "green"}>✓</Text>
                      </>
                    )}
                </Box>
              );
            })}

          {domains.length > visibleLines && (
            <Box marginTop={1}>
              <Text dimColor>
                Showing {domainsNav.scrollOffset + 1}-
                {Math.min(domainsNav.scrollOffset + visibleLines, domains.length)} of{" "}
                {domains.length}
              </Text>
            </Box>
          )}
        </Box>
      )}

      {mode === "teams" && selectedDomain && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text dimColor>
              👥
              {selectedDomain.teams.reduce(
                (sum, t) => sum + t.engineerCount,
                0
              )}{" "}
              engineers • 📁
              {selectedDomain.teams.reduce(
                (sum, t) => sum + t.projectCount,
                0
              )}{" "}
              projects • 📋
              {selectedDomain.teams.reduce(
                (sum, t) => sum + t.totalIssues,
                0
              )}{" "}
              issues in {selectedDomain.domainName}
            </Text>
          </Box>
          <Box marginBottom={1}>
            <Text dimColor>
              Navigate: ↑↓/j/k • Enter: View issues • b: Back
            </Text>
          </Box>

          {selectedDomain.teams
            .slice(teamsNav.scrollOffset, teamsNav.scrollOffset + visibleLines)
            .map((team, displayIndex) => {
              const actualIndex = teamsNav.scrollOffset + displayIndex;
              const isSelected = actualIndex === teamsNav.selectedIndex;

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
                    (👥 {team.engineerCount} 📁 {team.projectCount} 📋{" "}
                    {team.totalIssues})
                  </Text>
                  {(team.wipViolations > 0 ||
                    team.missingEstimate > 0 ||
                    team.noRecentComment > 0 ||
                    team.missingPriority > 0) && (
                    <>
                      <Text color={isSelected ? "cyan" : "white"}>  •  </Text>
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
                        🚨(
                        {team.wipViolations > 0 && `👤 ${team.wipViolations} `}
                        {team.missingEstimate > 0 && `📏 ${team.missingEstimate} `}
                        {team.noRecentComment > 0 && `💬 ${team.noRecentComment} `}
                        {team.missingPriority > 0 && `🔴 ${team.missingPriority}`})
                      </Text>
                    </>
                  )}
                  {team.wipViolations === 0 &&
                    team.missingEstimate === 0 &&
                    team.noRecentComment === 0 &&
                    team.missingPriority === 0 && (
                      <>
                        <Text color={isSelected ? "cyan" : "white"}>  •  </Text>
                        <Text color={isSelected ? "cyan" : "green"}>✓</Text>
                      </>
                    )}
                </Box>
              );
            })}

          {selectedDomain.teams.length > visibleLines && (
            <Box marginTop={1}>
              <Text dimColor>
                Showing {teamsNav.scrollOffset + 1}-
                {Math.min(
                  teamsNav.scrollOffset + visibleLines,
                  selectedDomain.teams.length
                )}{" "}
                of {selectedDomain.teams.length}
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
              📏 missing estimate  •  💬 no comment 24h  •  🔴 missing priority
            </Text>
          </Box>

          {selectedTeam.issues
            .slice(issuesNav.scrollOffset, issuesNav.scrollOffset + visibleLines)
            .map((issue, displayIndex) => {
              const actualIndex = issuesNav.scrollOffset + displayIndex;
              const isSelected = actualIndex === issuesNav.selectedIndex;
              const title =
                issue.title.length > 40
                  ? issue.title.substring(0, 37) + "..."
                  : issue.title;

              const violations = getViolationIndicators(issue);

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
                  {violations && (
                    <Text color={isSelected ? "cyan" : "yellow"}>
                      {" "}
                      {violations}
                    </Text>
                  )}
                </Box>
              );
            })}

          {selectedTeam.issues.length > visibleLines && (
            <Box marginTop={1}>
              <Text dimColor>
                Showing {issuesNav.scrollOffset + 1}-
                {Math.min(
                  issuesNav.scrollOffset + visibleLines,
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

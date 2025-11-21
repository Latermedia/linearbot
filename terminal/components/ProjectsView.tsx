import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { getIssuesWithProjects } from "../src/db/queries.js";
import {
  isProjectActive,
  hasStatusMismatch,
  isStaleUpdate,
  isMissingLead,
} from "../src/utils/status-helpers.js";
import { openIssue, openProject } from "../src/utils/browser-helpers.js";
import { useListNavigation } from "../hooks/useListNavigation.js";
import { useVisibleLines } from "../hooks/useVisibleLines.js";
import type { Issue } from "../src/db/schema.js";

interface ProjectsViewProps {
  onBack: () => void;
  onHeaderChange: (header: string) => void;
}

type ViewMode = "teams" | "projects" | "issues";
type SortMode = "progress" | "activity";

interface TeamSummary {
  teamId: string;
  teamName: string;
  teamKey: string;
  totalProjects: number;
  activeProjects: number;
  inProgressProjects: number;
  backlogProjects: number;
  statusMismatchCount: number;
  staleUpdateCount: number;
}

interface ProjectSummary {
  projectId: string;
  projectName: string;
  projectState: string | null;
  projectUpdatedAt: string | null;
  totalIssues: number;
  issuesByState: Map<string, number>;
  engineerCount: number;
  engineers: Set<string>;
  hasStatusMismatch: boolean;
  isStaleUpdate: boolean;
  lastActivityDate: string;
  teams: Set<string>;
  projectLeadName: string | null;
  missingLead: boolean;
}

export function ProjectsView({ onBack, onHeaderChange }: ProjectsViewProps) {
  const visibleLines = useVisibleLines();
  const [mode, setMode] = useState<ViewMode>("teams");
  const [sortMode, setSortMode] = useState<SortMode>("progress");
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [projectsByTeam, setProjectsByTeam] = useState<
    Map<string, ProjectSummary[]>
  >(new Map());
  const [issuesByProject, setIssuesByProject] = useState<Map<string, Issue[]>>(
    new Map()
  );
  const [selectedTeam, setSelectedTeam] = useState<TeamSummary | null>(null);
  const [selectedProject, setSelectedProject] = useState<ProjectSummary | null>(
    null
  );
  const [totalUniqueProjects, setTotalUniqueProjects] = useState(0);

  // Navigation for all 3 modes
  const teamsNav = useListNavigation(teams.length, visibleLines);
  const projectsNav = useListNavigation(
    selectedTeam ? projectsByTeam.get(selectedTeam.teamKey)?.length || 0 : 0,
    visibleLines
  );
  const issuesNav = useListNavigation(
    selectedProject
      ? issuesByProject.get(selectedProject.projectId)?.length || 0
      : 0,
    visibleLines
  );

  const { selectedIndex, scrollOffset } =
    mode === "teams" ? teamsNav : mode === "projects" ? projectsNav : issuesNav;

  useEffect(() => {
    loadProjects();
  }, []);

  // Update header when navigation changes
  useEffect(() => {
    if (mode === "teams") {
      onHeaderChange("Active Projects by Team");
    } else if (mode === "projects" && selectedTeam) {
      const projectCount =
        projectsByTeam.get(selectedTeam.teamKey)?.length || 0;
      onHeaderChange(`${selectedTeam.teamName} (📁 ${projectCount} projects)`);
    } else if (mode === "issues" && selectedProject) {
      onHeaderChange(
        `${selectedProject.projectName} (${selectedProject.totalIssues} issues)`
      );
    }
  }, [mode, selectedTeam, selectedProject, projectsByTeam, onHeaderChange]);

  const loadProjects = () => {
    const allIssues = getIssuesWithProjects();

    // Group issues by project
    const projectGroups = new Map<string, Issue[]>();
    for (const issue of allIssues) {
      if (!issue.project_id) continue;
      if (!projectGroups.has(issue.project_id)) {
        projectGroups.set(issue.project_id, []);
      }
      projectGroups.get(issue.project_id)?.push(issue);
    }

    // Build project summaries, filtering to only active projects
    const projects = new Map<string, ProjectSummary>();
    for (const [projectId, issues] of projectGroups) {
      // Only include active projects
      if (!isProjectActive(issues)) continue;

      const firstIssue = issues[0];
      const issuesByState = new Map<string, number>();
      const engineers = new Set<string>();
      const teams = new Set<string>();

      let lastActivityDate = firstIssue.updated_at;
      for (const issue of issues) {
        // Track issue states
        const stateName = issue.state_name;
        issuesByState.set(stateName, (issuesByState.get(stateName) || 0) + 1);

        // Track engineers
        if (issue.assignee_name) {
          engineers.add(issue.assignee_name);
        }

        // Track teams (for multi-team projects)
        teams.add(issue.team_key);

        // Track latest activity
        if (new Date(issue.updated_at) > new Date(lastActivityDate)) {
          lastActivityDate = issue.updated_at;
        }
      }

      const projectSummary: ProjectSummary = {
        projectId,
        projectName: firstIssue.project_name || "Unknown Project",
        projectState: firstIssue.project_state,
        projectUpdatedAt: firstIssue.project_updated_at,
        totalIssues: issues.length,
        issuesByState,
        engineerCount: engineers.size,
        engineers,
        hasStatusMismatch: false, // Will set below
        isStaleUpdate: false, // Will set below
        lastActivityDate,
        teams,
        projectLeadName: firstIssue.project_lead_name,
        missingLead: false, // Will set below
      };

      projectSummary.hasStatusMismatch = hasStatusMismatch(
        projectSummary.projectState,
        issues
      );
      projectSummary.isStaleUpdate = isStaleUpdate(
        projectSummary.lastActivityDate
      );
      projectSummary.missingLead = isMissingLead(
        projectSummary.projectState,
        projectSummary.projectLeadName,
        issues
      );

      projects.set(projectId, projectSummary);
      projectGroups.set(projectId, issues);
    }

    // Store total unique projects count
    setTotalUniqueProjects(projects.size);

    // Group projects by team (by participation - any team with issues in the project)
    const teamMap = new Map<string, ProjectSummary[]>();
    for (const project of projects.values()) {
      const issues = projectGroups.get(project.projectId) || [];
      // Get all unique teams that have issues in this project
      const teamsInProject = new Set(issues.map((i) => i.team_key));

      // Add this project to each team that has issues in it
      for (const teamKey of teamsInProject) {
        if (!teamMap.has(teamKey)) {
          teamMap.set(teamKey, []);
        }
        teamMap.get(teamKey)?.push(project);
      }
    }

    // Build team summaries
    const teamSummaries: TeamSummary[] = [];
    for (const [teamKey, teamProjects] of teamMap) {
      // Find any issue from this team to get team name and ID
      let teamName = teamKey;
      let teamId = teamKey;
      for (const project of teamProjects) {
        const issues = projectGroups.get(project.projectId) || [];
        const teamIssue = issues.find((i) => i.team_key === teamKey);
        if (teamIssue) {
          teamName = teamIssue.team_name;
          teamId = teamIssue.team_id;
          break;
        }
      }

      const inProgressProjects = teamProjects.filter(
        (p) => (p.projectState?.toLowerCase() || "") === "started"
      ).length;
      const backlogProjects = teamProjects.filter((p) => {
        const state = p.projectState?.toLowerCase() || "";
        return state.includes("backlog") || state.includes("planned");
      }).length;
      const statusMismatchCount = teamProjects.filter(
        (p) => p.hasStatusMismatch
      ).length;
      const staleUpdateCount = teamProjects.filter(
        (p) => p.isStaleUpdate
      ).length;

      teamSummaries.push({
        teamId,
        teamName,
        teamKey,
        totalProjects: teamProjects.length,
        activeProjects: teamProjects.length,
        inProgressProjects,
        backlogProjects,
        statusMismatchCount,
        staleUpdateCount,
      });
    }

    setTeams(teamSummaries);
    setProjectsByTeam(teamMap);
    setIssuesByProject(projectGroups);
  };

  useInput((input, key) => {
    if (input === "b") {
      if (mode === "teams") {
        onBack();
      } else if (mode === "projects") {
        setMode("teams");
        teamsNav.reset();
      } else if (mode === "issues") {
        setMode("projects");
        projectsNav.reset();
      }
    } else if (input === "o" && mode === "projects" && selectedTeam) {
      // Open selected project in browser
      const projects = sortProjects(
        projectsByTeam.get(selectedTeam.teamKey) || [],
        sortMode
      );
      const project = projects[projectsNav.selectedIndex];
      if (project) {
        // Get workspace from first issue URL
        const issues = issuesByProject.get(project.projectId) || [];
        if (issues.length > 0) {
          openProject(project.projectId, issues[0].url);
        }
      }
    } else if (input === "o" && mode === "issues" && selectedProject) {
      // Open selected issue in browser
      const issues = issuesByProject.get(selectedProject.projectId) || [];
      const issue = issues[issuesNav.selectedIndex];
      if (issue) {
        openIssue(issue);
      }
    } else if (input === "s" && mode === "projects") {
      // Toggle sort mode for projects
      setSortMode((prev) => (prev === "progress" ? "activity" : "progress"));
      projectsNav.reset();
    } else if (key.upArrow || input === "k") {
      if (mode === "teams") {
        teamsNav.handleUp();
      } else if (mode === "projects") {
        projectsNav.handleUp();
      } else {
        issuesNav.handleUp();
      }
    } else if (key.downArrow || input === "j") {
      if (mode === "teams") {
        teamsNav.handleDown();
      } else if (mode === "projects") {
        projectsNav.handleDown();
      } else {
        issuesNav.handleDown();
      }
    } else if (key.return) {
      if (mode === "teams") {
        setSelectedTeam(teams[teamsNav.selectedIndex]);
        setMode("projects");
        projectsNav.reset();
      } else if (mode === "projects" && selectedTeam) {
        const projects = projectsByTeam.get(selectedTeam.teamKey) || [];
        const sortedProjects = sortProjects(projects, sortMode);
        setSelectedProject(sortedProjects[projectsNav.selectedIndex]);
        setMode("issues");
        issuesNav.reset();
      }
    }
  });

  const sortProjects = (
    projects: ProjectSummary[],
    sort: SortMode
  ): ProjectSummary[] => {
    return [...projects].sort((a, b) => {
      if (sort === "progress") {
        // Sort by number of in-progress issues (descending)
        const aInProgress = a.issuesByState.get("In Progress") || 0;
        const bInProgress = b.issuesByState.get("In Progress") || 0;
        return bInProgress - aInProgress;
      } else {
        // Sort by last activity date (descending)
        return (
          new Date(b.lastActivityDate).getTime() -
          new Date(a.lastActivityDate).getTime()
        );
      }
    });
  };

  if (teams.length === 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text dimColor>No active projects found.</Text>
        <Text dimColor>
          Projects must have started issues or recent activity to be shown.
        </Text>
        <Box marginTop={1}>
          <Text dimColor>Press 'b' to go back</Text>
        </Box>
      </Box>
    );
  }

  // Projects mode uses different visible lines calculation (each project takes ~7 lines)
  const effectiveVisibleLines =
    mode === "projects"
      ? Math.max(1, Math.floor(visibleLines / 7))
      : visibleLines;

  return (
    <Box flexDirection="column" padding={1}>
      {mode === "teams" && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text dimColor>
              📁 {totalUniqueProjects} active projects across {teams.length}{" "}
              teams
            </Text>
          </Box>
          <Box marginBottom={1}>
            <Text dimColor>
              Use ↑↓ or j/k to navigate • Enter to select • b to go back
            </Text>
          </Box>
          <Box marginBottom={1}>
            <Text dimColor>
              <Text>⚠️{"  "}status mismatch</Text> •{" "}
              <Text>💤 no update in 7+ days</Text>
            </Text>
          </Box>

          {teams
            .slice(
              teamsNav.scrollOffset,
              teamsNav.scrollOffset + effectiveVisibleLines
            )
            .map((team, displayIndex) => {
              const actualIndex = teamsNav.scrollOffset + displayIndex;
              const isSelected = actualIndex === teamsNav.selectedIndex;

              const hasViolations =
                team.statusMismatchCount > 0 || team.staleUpdateCount > 0;

              // Build indicator string
              let indicatorText = "";
              if (!hasViolations) {
                indicatorText = "✓ Healthy";
              } else {
                const parts = [];
                if (team.statusMismatchCount > 0) {
                  parts.push(`⚠️  ${team.statusMismatchCount}`);
                }
                if (team.staleUpdateCount > 0) {
                  parts.push(`💤 ${team.staleUpdateCount}`);
                }
                indicatorText = parts.join(" • ");
              }

              return (
                <Box key={`team-${team.teamKey}`}>
                  <Text color={isSelected ? "cyan" : "gray"}>
                    {isSelected ? "▶ " : "  "}
                  </Text>
                  <Box width={35}>
                    <Text
                      bold={isSelected}
                      color={isSelected ? "cyan" : "white"}
                    >
                      {team.teamName} ({team.activeProjects})
                    </Text>
                  </Box>
                  <Text color={!hasViolations ? "green" : "white"}>
                    {indicatorText}
                  </Text>
                </Box>
              );
            })}

          {teams.length > effectiveVisibleLines && (
            <Box marginTop={1}>
              <Text dimColor>
                Showing {teamsNav.scrollOffset + 1}-
                {Math.min(
                  teamsNav.scrollOffset + effectiveVisibleLines,
                  teams.length
                )}{" "}
                of {teams.length}
              </Text>
            </Box>
          )}
        </Box>
      )}

      {mode === "projects" && selectedTeam && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text>
              <Text dimColor>Sort: </Text>
              <Text color="cyan" bold>
                {sortMode === "progress" ? "Progress" : "Activity"}
              </Text>
              <Text dimColor> (press 's' to toggle)</Text>
            </Text>
          </Box>
          <Box marginBottom={1}>
            <Text dimColor>
              Navigate: ↑↓/j/k • Enter: View issues • o: Open project • s: Sort
              • b: Back
            </Text>
          </Box>

          {sortProjects(
            projectsByTeam.get(selectedTeam.teamKey) || [],
            sortMode
          )
            .slice(
              projectsNav.scrollOffset,
              projectsNav.scrollOffset + effectiveVisibleLines
            )
            .map((project, displayIndex) => {
              const actualIndex = projectsNav.scrollOffset + displayIndex;
              const isSelected = actualIndex === projectsNav.selectedIndex;

              // Calculate progress
              const completedIssues =
                (project.issuesByState.get("Done") || 0) +
                (project.issuesByState.get("Completed") || 0);
              const progressPercent = Math.round(
                (completedIssues / project.totalIssues) * 100
              );

              return (
                <Box
                  key={`project-${project.projectId}`}
                  flexDirection="column"
                  marginBottom={1}
                >
                  <Box>
                    <Text color={isSelected ? "cyan" : "gray"}>
                      {isSelected ? "▶ " : "  "}
                    </Text>
                    <Box width={80}>
                      <Text
                        bold={isSelected}
                        color={isSelected ? "cyan" : "white"}
                      >
                        {project.projectName}
                      </Text>
                    </Box>
                    <Box width={20}>
                      <Text color={isSelected ? "cyan" : "gray"}>
                        {project.totalIssues} issues
                      </Text>
                    </Box>
                    <Box width={15}>
                      <Text color={isSelected ? "cyan" : "gray"}>
                        {progressPercent}% done
                      </Text>
                    </Box>
                  </Box>
                  <Box paddingLeft={3} flexDirection="column">
                    <Box>
                      <Text dimColor>
                        {project.engineerCount} engineers •{" "}
                        {project.projectState || "No status"}
                      </Text>
                    </Box>
                    {project.missingLead && (
                      <Box>
                        <Text color="red">👤 No lead assigned</Text>
                      </Box>
                    )}
                    {project.hasStatusMismatch && (
                      <Box>
                        <Text color="yellow">
                          ⚠️{"  "}Marked "{project.projectState}" but has active
                          work
                        </Text>
                      </Box>
                    )}
                    {project.isStaleUpdate && (
                      <Box>
                        <Text color="red">💤 No update in 7+ days</Text>
                      </Box>
                    )}
                    {project.teams.size > 1 && (
                      <Box>
                        <Text color="cyan">
                          ↔ Multi-team ({Array.from(project.teams).join(", ")})
                        </Text>
                      </Box>
                    )}
                    <Box>
                      <Text dimColor>
                        Issues:{" "}
                        {Array.from(project.issuesByState.entries())
                          .map(([state, count]) => `${state}: ${count}`)
                          .join(" • ")}
                      </Text>
                    </Box>
                  </Box>
                  {project.engineerCount > 5 && (
                    <Box paddingLeft={3}>
                      <Text color="blue">💡 High engineer count</Text>
                    </Box>
                  )}
                </Box>
              );
            })}

          {(projectsByTeam.get(selectedTeam.teamKey)?.length || 0) >
            visibleLines && (
            <Box marginTop={1}>
              <Text dimColor>
                Showing {scrollOffset + 1}-
                {Math.min(
                  scrollOffset + visibleLines,
                  projectsByTeam.get(selectedTeam.teamKey)?.length || 0
                )}{" "}
                of {projectsByTeam.get(selectedTeam.teamKey)?.length}
              </Text>
            </Box>
          )}
        </Box>
      )}

      {mode === "issues" && selectedProject && (
        <Box flexDirection="column">
          {selectedProject.missingLead && (
            <Box marginBottom={1}>
              <Text color="red">
                👤 Missing Lead: Active project has no lead assigned
              </Text>
            </Box>
          )}
          {selectedProject.hasStatusMismatch && (
            <Box marginBottom={1}>
              <Text color="yellow">
                ⚠️{"  "}Status Mismatch: Project status is "
                {selectedProject.projectState || "unknown"}" but has active work
              </Text>
            </Box>
          )}
          {selectedProject.isStaleUpdate && (
            <Box marginBottom={1}>
              <Text color="red">
                💤 Stale Update: Project hasn't been updated in 7+ days
              </Text>
            </Box>
          )}
          {selectedProject.teams.size > 1 && (
            <Box marginBottom={1}>
              <Text color="cyan">
                ↔ Multi-team project:{" "}
                {Array.from(selectedProject.teams).join(", ")}
              </Text>
            </Box>
          )}
          <Box marginBottom={1}>
            <Text dimColor>
              Engineers ({selectedProject.engineerCount}):{" "}
              {Array.from(selectedProject.engineers).join(", ")}
              {selectedProject.projectLeadName && (
                <Text> • Lead: {selectedProject.projectLeadName}</Text>
              )}
            </Text>
          </Box>
          <Box marginBottom={1}>
            <Text dimColor>Navigate: ↑↓/j/k • o: Open • b: Back</Text>
          </Box>

          {(issuesByProject.get(selectedProject.projectId) || [])
            .slice(
              issuesNav.scrollOffset,
              issuesNav.scrollOffset + effectiveVisibleLines
            )
            .map((issue, displayIndex) => {
              const actualIndex = issuesNav.scrollOffset + displayIndex;
              const isSelected = actualIndex === issuesNav.selectedIndex;
              const title =
                issue.title.length > 50
                  ? issue.title.substring(0, 47) + "..."
                  : issue.title;

              return (
                <Box key={`issue-${issue.id}`} marginBottom={0}>
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
                  <Box width={15}>
                    <Text color={isSelected ? "cyan" : "gray"}>
                      {issue.state_name}
                    </Text>
                  </Box>
                  <Box width={25}>
                    <Text color={isSelected ? "cyan" : "gray"}>
                      {issue.assignee_name || "Unassigned"}
                    </Text>
                  </Box>
                  <Box>
                    <Text
                      bold={isSelected}
                      color={isSelected ? "cyan" : "white"}
                    >
                      {title}
                    </Text>
                  </Box>
                </Box>
              );
            })}

          {(issuesByProject.get(selectedProject.projectId)?.length || 0) >
            visibleLines && (
            <Box marginTop={1}>
              <Text dimColor>
                Showing {scrollOffset + 1}-
                {Math.min(
                  scrollOffset + visibleLines,
                  issuesByProject.get(selectedProject.projectId)?.length || 0
                )}{" "}
                of {issuesByProject.get(selectedProject.projectId)?.length}
              </Text>
            </Box>
          )}

          <Box marginTop={1}>
            <Text dimColor>
              💡 Tip: Copy issue identifier and open in Linear
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}

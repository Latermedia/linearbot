import React, { useState, useEffect } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import { getDatabase } from "../db/connection.js";
import type { Issue } from "../db/schema.js";

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

function isProjectActive(issues: Issue[]): boolean {
  // Project is active if it has started issues OR recent activity (within 14 days)
  const hasStartedIssues = issues.some((i) => i.state_type === "started");
  const twoWeeksAgo = new Date();
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
  const hasRecentActivity = issues.some(
    (i) => new Date(i.updated_at) > twoWeeksAgo
  );
  return hasStartedIssues || hasRecentActivity;
}

function hasStatusMismatch(project: ProjectSummary, issues: Issue[]): boolean {
  // Status mismatch if project state is not "started" but has active work
  const hasStartedIssues = issues.some((i) => i.state_type === "started");
  const projectState = project.projectState?.toLowerCase() || "";
  const isProjectStarted =
    projectState.includes("progress") ||
    projectState.includes("started") ||
    projectState === "started";
  return hasStartedIssues && !isProjectStarted;
}

function isStaleUpdate(project: ProjectSummary): boolean {
  // Check if project hasn't had any activity in 7+ days
  // Use lastActivityDate (from issues) instead of projectUpdatedAt (from Linear's project metadata)
  if (!project.lastActivityDate) return true;
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  return new Date(project.lastActivityDate) < sevenDaysAgo;
}

function isMissingLead(project: ProjectSummary, issues: Issue[]): boolean {
  // Project should have a lead if it has active work or is in an active state
  const hasActiveWork = issues.some((i) => i.state_type === "started");
  const projectState = project.projectState?.toLowerCase() || "";
  const isActiveState =
    projectState.includes("progress") ||
    projectState.includes("started") ||
    projectState === "started";

  return (hasActiveWork || isActiveState) && !project.projectLeadName;
}

export function ProjectsView({ onBack, onHeaderChange }: ProjectsViewProps) {
  const { stdout } = useStdout();
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
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [totalUniqueProjects, setTotalUniqueProjects] = useState(0);

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
    const db = getDatabase();
    const getIssues = db.prepare(`
      SELECT * FROM issues
      WHERE project_id IS NOT NULL
      ORDER BY team_name, project_name, identifier
    `);
    const allIssues = getIssues.all() as Issue[];

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
        projectSummary,
        issues
      );
      projectSummary.isStaleUpdate = isStaleUpdate(projectSummary);
      projectSummary.missingLead = isMissingLead(projectSummary, issues);

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
        setSelectedIndex(0);
        setScrollOffset(0);
      } else if (mode === "issues") {
        setMode("projects");
        setSelectedIndex(0);
        setScrollOffset(0);
      }
    } else if (input === "o" && mode === "projects" && selectedTeam) {
      // Open selected project in browser
      const projects = sortProjects(
        projectsByTeam.get(selectedTeam.teamKey) || [],
        sortMode
      );
      const project = projects[selectedIndex];
      if (project) {
        // Get workspace from first issue URL
        const issues = issuesByProject.get(project.projectId) || [];
        if (issues.length > 0) {
          const issueUrl = issues[0].url;
          const workspaceMatch = issueUrl.match(
            /https:\/\/linear\.app\/([^\/]+)/
          );
          if (workspaceMatch) {
            const workspace = workspaceMatch[1];
            const projectUrl = `https://linear.app/${workspace}/project/${project.projectId}`;
            require("child_process").exec(
              process.platform === "darwin"
                ? `open "${projectUrl}"`
                : process.platform === "win32"
                ? `start "${projectUrl}"`
                : `xdg-open "${projectUrl}"`
            );
          }
        }
      }
    } else if (input === "o" && mode === "issues" && selectedProject) {
      // Open selected issue in browser
      const issues = issuesByProject.get(selectedProject.projectId) || [];
      const issue = issues[selectedIndex];
      if (issue) {
        require("child_process").exec(
          process.platform === "darwin"
            ? `open "${issue.url}"`
            : process.platform === "win32"
            ? `start "${issue.url}"`
            : `xdg-open "${issue.url}"`
        );
      }
    } else if (input === "s" && mode === "projects") {
      // Toggle sort mode for projects
      setSortMode((prev) => (prev === "progress" ? "activity" : "progress"));
      setSelectedIndex(0);
      setScrollOffset(0);
    } else if (key.upArrow || input === "k") {
      if (selectedIndex > 0) {
        const newIndex = selectedIndex - 1;
        setSelectedIndex(newIndex);

        const terminalHeight = stdout?.rows || 24;
        const visibleLines =
          mode === "projects"
            ? Math.floor((terminalHeight - 8) / 7)
            : terminalHeight - 8;
        if (newIndex < scrollOffset) {
          setScrollOffset(newIndex);
        }
      }
    } else if (key.downArrow || input === "j") {
      let maxIndex = 0;
      if (mode === "teams") {
        maxIndex = teams.length - 1;
      } else if (mode === "projects" && selectedTeam) {
        const projects = projectsByTeam.get(selectedTeam.teamKey) || [];
        maxIndex = projects.length - 1;
      } else if (mode === "issues" && selectedProject) {
        const issues = issuesByProject.get(selectedProject.projectId) || [];
        maxIndex = issues.length - 1;
      }

      if (selectedIndex < maxIndex) {
        const newIndex = selectedIndex + 1;
        setSelectedIndex(newIndex);

        const terminalHeight = stdout?.rows || 24;
        const visibleLines =
          mode === "projects"
            ? Math.floor((terminalHeight - 8) / 7)
            : terminalHeight - 8;
        if (newIndex >= scrollOffset + visibleLines) {
          setScrollOffset(newIndex - visibleLines + 1);
        }
      }
    } else if (key.return) {
      if (mode === "teams") {
        setSelectedTeam(teams[selectedIndex]);
        setMode("projects");
        setSelectedIndex(0);
        setScrollOffset(0);
      } else if (mode === "projects" && selectedTeam) {
        const projects = projectsByTeam.get(selectedTeam.teamKey) || [];
        const sortedProjects = sortProjects(projects, sortMode);
        setSelectedProject(sortedProjects[selectedIndex]);
        setMode("issues");
        setSelectedIndex(0);
        setScrollOffset(0);
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

  const terminalHeight = stdout?.rows || 24;
  // Projects take ~6-8 lines each, so divide by 7 to get visible project count
  const visibleLines =
    mode === "projects"
      ? Math.floor((terminalHeight - 8) / 7)
      : terminalHeight - 8;

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
            .slice(scrollOffset, scrollOffset + visibleLines)
            .map((team, displayIndex) => {
              const actualIndex = scrollOffset + displayIndex;
              const isSelected = actualIndex === selectedIndex;

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
            .slice(scrollOffset, scrollOffset + visibleLines)
            .map((project, displayIndex) => {
              const actualIndex = scrollOffset + displayIndex;
              const isSelected = actualIndex === selectedIndex;

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
                      <Text color="yellow">
                        ⚠️{"  "}High engineer count (WIP constraint: 1 project
                        per engineer)
                      </Text>
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
            .slice(scrollOffset, scrollOffset + visibleLines)
            .map((issue, displayIndex) => {
              const actualIndex = scrollOffset + displayIndex;
              const isSelected = actualIndex === selectedIndex;
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

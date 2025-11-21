import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { getStartedProjectIssuesWithAssignees } from "../src/db/queries.js";
import { getMultiProjectStatus } from "../src/utils/status-helpers.js";
import { openIssue } from "../src/utils/browser-helpers.js";
import { useListNavigation } from "../hooks/useListNavigation.js";
import { useVisibleLines } from "../hooks/useVisibleLines.js";
import type { Issue } from "../src/db/schema.js";

interface EngineersViewProps {
  onBack: () => void;
  onHeaderChange: (header: string) => void;
}

type ViewMode = "engineers" | "projects";

interface EngineerSummary {
  engineerName: string;
  projectCount: number;
  projects: ProjectInfo[];
}

interface ProjectInfo {
  projectId: string;
  projectName: string;
  issueCount: number;
  startedIssueCount: number;
  issues: Issue[];
}

export function EngineersView({ onBack, onHeaderChange }: EngineersViewProps) {
  const visibleLines = useVisibleLines();
  const [mode, setMode] = useState<ViewMode>("engineers");
  const [engineers, setEngineers] = useState<EngineerSummary[]>([]);
  const [selectedEngineer, setSelectedEngineer] = useState<EngineerSummary | null>(null);
  
  // Navigation for both modes
  const engineersNav = useListNavigation(engineers.length, visibleLines);
  const projectsNav = useListNavigation(
    selectedEngineer?.projects.length || 0,
    visibleLines
  );
  
  const { selectedIndex, scrollOffset } = mode === "engineers" ? engineersNav : projectsNav;

  useEffect(() => {
    loadEngineers();
  }, []);

  // Update header when navigation changes
  useEffect(() => {
    if (mode === "engineers") {
      onHeaderChange("Engineers on Multiple Projects");
    } else if (mode === "projects" && selectedEngineer) {
      onHeaderChange(`${selectedEngineer.engineerName} (${selectedEngineer.projectCount} projects)`);
    }
  }, [mode, selectedEngineer, onHeaderChange]);

  const loadEngineers = () => {
    const startedProjectIssues = getStartedProjectIssuesWithAssignees();

    // Group by engineer and then by project
    const engineerMap = new Map<string, Map<string, Issue[]>>();

    for (const issue of startedProjectIssues) {
      const engineerName = issue.assignee_name!;
      const projectId = issue.project_id!;

      if (!engineerMap.has(engineerName)) {
        engineerMap.set(engineerName, new Map());
      }

      const projectMap = engineerMap.get(engineerName)!;
      if (!projectMap.has(projectId)) {
        projectMap.set(projectId, []);
      }

      projectMap.get(projectId)!.push(issue);
    }

    // Convert to EngineerSummary array, filtering for multiple projects only
    const engineerList: EngineerSummary[] = [];

    for (const [engineerName, projectMap] of engineerMap) {
      if (projectMap.size > 1) {
        const projects: ProjectInfo[] = [];

        for (const [projectId, issues] of projectMap) {
          projects.push({
            projectId,
            projectName: issues[0].project_name || "Unknown Project",
            issueCount: issues.length,
            startedIssueCount: issues.filter((i) => i.state_type === "started")
              .length,
            issues,
          });
        }

        // Sort projects by issue count descending
        projects.sort((a, b) => b.issueCount - a.issueCount);

        engineerList.push({
          engineerName,
          projectCount: projectMap.size,
          projects,
        });
      }
    }

    // Sort engineers by project count descending
    engineerList.sort((a, b) => b.projectCount - a.projectCount);

    setEngineers(engineerList);
  };

  const handleBack = () => {
    if (mode === "projects") {
      setMode("engineers");
      setSelectedEngineer(null);
      engineersNav.reset();
    } else {
      onBack();
    }
  };

  const handleSelectEngineer = (engineer: EngineerSummary) => {
    setSelectedEngineer(engineer);
    setMode("projects");
    projectsNav.reset();
  };

  useInput((input, key) => {
    if (input === "b" || key.escape) {
      handleBack();
      return;
    }

    if (mode === "engineers") {
      if (key.upArrow || input === "k") {
        engineersNav.handleUp();
      } else if (key.downArrow || input === "j") {
        engineersNav.handleDown();
      } else if (key.return) {
        if (engineers[engineersNav.selectedIndex]) {
          handleSelectEngineer(engineers[engineersNav.selectedIndex]);
        }
      }
    } else if (mode === "projects" && selectedEngineer) {
      if (key.upArrow || input === "k") {
        projectsNav.handleUp();
      } else if (key.downArrow || input === "j") {
        projectsNav.handleDown();
      } else if (input === "o") {
        // Open first issue from selected project in browser
        const project = selectedEngineer.projects[projectsNav.selectedIndex];
        if (project && project.issues.length > 0) {
          openIssue(project.issues[0]);
        }
      }
    }
  });

  const renderEngineersView = () => {
    const visibleEngineers = engineers.slice(
      engineersNav.scrollOffset,
      engineersNav.scrollOffset + visibleLines
    );

    const violations = engineers.filter((e) => e.projectCount >= 2).length;

    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold>MULTI-PROJECT ENGINEERS</Text>
        </Box>
        <Box marginBottom={1}>
          <Text dimColor>
            Total: {engineers.length} engineers working on multiple projects
          </Text>
        </Box>
        <Box marginBottom={1}>
          <Text dimColor>
            WIP Constraint: 1 project ideal • Violations: {violations}
          </Text>
        </Box>
        <Box marginBottom={1}>
          <Text dimColor>
            Use ↑↓ or j/k to navigate • Enter to select • b to go back
          </Text>
        </Box>

        {visibleEngineers.map((engineer, idx) => {
          const actualIndex = engineersNav.scrollOffset + idx;
          const isSelected = actualIndex === engineersNav.selectedIndex;
          const status = getMultiProjectStatus(engineer.projectCount);

          return (
            <Box key={engineer.engineerName}>
              <Text color={isSelected ? "cyan" : "gray"}>
                {isSelected ? "▶ " : "  "}
              </Text>
              <Box width={35}>
                <Text
                  bold={isSelected}
                  color={isSelected ? "cyan" : status.color}
                >
                  {engineer.engineerName}
                </Text>
              </Box>
              <Box width={20}>
                <Text color={isSelected ? "cyan" : "white"}>
                  ({engineer.projectCount} projects)
                </Text>
              </Box>
              <Text color={status.color}>
                {status.emoji} {status.label}
              </Text>
            </Box>
          );
        })}

        {engineers.length > visibleLines && (
          <Box marginTop={1}>
            <Text dimColor>
              Showing {engineersNav.scrollOffset + 1}-
              {Math.min(engineersNav.scrollOffset + visibleLines, engineers.length)} of{" "}
              {engineers.length}
            </Text>
          </Box>
        )}
      </Box>
    );
  };

  const renderProjectsView = () => {
    if (!selectedEngineer) return null;

    const visibleProjects = selectedEngineer.projects.slice(
      projectsNav.scrollOffset,
      projectsNav.scrollOffset + visibleLines
    );

    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold>
            PROJECTS FOR {selectedEngineer.engineerName.toUpperCase()}
          </Text>
        </Box>
        <Box marginBottom={1}>
          <Text dimColor>
            Working on 📁 {selectedEngineer.projectCount} projects simultaneously
          </Text>
        </Box>
        <Box marginBottom={1}>
          <Text dimColor>Navigate: ↑↓/j/k • o: Open • b: Back</Text>
        </Box>

        {visibleProjects.map((project, idx) => {
          const actualIndex = projectsNav.scrollOffset + idx;
          const isSelected = actualIndex === projectsNav.selectedIndex;

          return (
            <Box
              key={project.projectId}
              flexDirection="column"
              marginBottom={1}
            >
              <Box>
                <Text color={isSelected ? "cyan" : "gray"}>
                  {isSelected ? "▶ " : "  "}
                </Text>
                <Box width={50}>
                  <Text bold={isSelected} color={isSelected ? "cyan" : "white"}>
                    {project.projectName}
                  </Text>
                </Box>
                <Text color={isSelected ? "cyan" : "gray"}>
                  {project.startedIssueCount} started
                </Text>
              </Box>

              {/* Show issues for this project */}
              <Box flexDirection="column" paddingLeft={3}>
                {project.issues.slice(0, 3).map((issue) => (
                  <Box key={issue.id}>
                    <Text dimColor>• </Text>
                    <Text color="cyan">{issue.identifier}</Text>
                    <Text dimColor> {issue.title.substring(0, 60)}</Text>
                    {issue.title.length > 60 && <Text dimColor>...</Text>}
                  </Box>
                ))}
                {project.issues.length > 3 && (
                  <Text dimColor>
                    ... and {project.issues.length - 3} more issues
                  </Text>
                )}
              </Box>

              {/* Show link to first issue (which contains project context) */}
              {project.issues[0] && (
                <Box paddingLeft={3}>
                  <Text color="cyan">→ {project.issues[0].url}</Text>
                </Box>
              )}
            </Box>
          );
        })}

        {selectedEngineer.projects.length > visibleLines && (
          <Box marginTop={1}>
            <Text dimColor>
              Showing {projectsNav.scrollOffset + 1}-
              {Math.min(
                projectsNav.scrollOffset + visibleLines,
                selectedEngineer.projects.length
              )}{" "}
              of {selectedEngineer.projects.length}
            </Text>
          </Box>
        )}
      </Box>
    );
  };

  return (
    <Box flexDirection="column">
      {mode === "engineers" && renderEngineersView()}
      {mode === "projects" && renderProjectsView()}
    </Box>
  );
}

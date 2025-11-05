import React, { useState, useEffect } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import { getDatabase } from "../db/connection.js";
import type { Issue } from "../db/schema.js";

interface EngineersViewProps {
  onBack: () => void;
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

export function EngineersView({ onBack }: EngineersViewProps) {
  const { stdout } = useStdout();
  const [mode, setMode] = useState<ViewMode>("engineers");
  const [engineers, setEngineers] = useState<EngineerSummary[]>([]);
  const [selectedEngineer, setSelectedEngineer] = useState<EngineerSummary | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);

  useEffect(() => {
    loadEngineers();
  }, []);

  const loadEngineers = () => {
    const db = getDatabase();
    const startedProjectIssues = db
      .prepare(
        `
        SELECT * FROM issues 
        WHERE state_type = 'started' 
        AND project_id IS NOT NULL 
        AND assignee_name IS NOT NULL
        ORDER BY assignee_name, project_name
      `
      )
      .all() as Issue[];

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
      setSelectedIndex(0);
      setScrollOffset(0);
    } else {
      onBack();
    }
  };

  const handleSelectEngineer = (engineer: EngineerSummary) => {
    setSelectedEngineer(engineer);
    setMode("projects");
    setSelectedIndex(0);
    setScrollOffset(0);
  };

  useInput((input, key) => {
    if (input === "q" || input === "b" || key.escape) {
      handleBack();
      return;
    }

    if (mode === "engineers") {
      if (key.upArrow || input === "k") {
        setSelectedIndex((prev) => Math.max(0, prev - 1));
      } else if (key.downArrow || input === "j") {
        setSelectedIndex((prev) => Math.min(engineers.length - 1, prev + 1));
      } else if (key.return) {
        if (engineers[selectedIndex]) {
          handleSelectEngineer(engineers[selectedIndex]);
        }
      }
    } else if (mode === "projects" && selectedEngineer) {
      if (key.upArrow || input === "k") {
        setSelectedIndex((prev) => Math.max(0, prev - 1));
      } else if (key.downArrow || input === "j") {
        setSelectedIndex((prev) =>
          Math.min(selectedEngineer.projects.length - 1, prev + 1)
        );
      }
    }
  });

  // Handle scrolling
  const viewportHeight = (stdout?.rows || 30) - 10;
  useEffect(() => {
    if (selectedIndex < scrollOffset) {
      setScrollOffset(selectedIndex);
    } else if (selectedIndex >= scrollOffset + viewportHeight) {
      setScrollOffset(selectedIndex - viewportHeight + 1);
    }
  }, [selectedIndex, viewportHeight]);

  const renderEngineersView = () => {
    const visibleEngineers = engineers.slice(
      scrollOffset,
      scrollOffset + viewportHeight
    );

    return (
      <Box flexDirection="column">
        <Box paddingX={2} paddingY={1}>
          <Text bold color="yellow">
            ⚠️ ENGINEERS ON MULTIPLE PROJECTS ({engineers.length})
          </Text>
        </Box>

        <Box paddingX={2} marginBottom={1}>
          <Text dimColor>
            Use ↑↓ or j/k to navigate, Enter to view details, b/q to go back
          </Text>
        </Box>

        <Box flexDirection="column" paddingX={2}>
          {visibleEngineers.map((engineer, idx) => {
            const actualIndex = scrollOffset + idx;
            const isSelected = actualIndex === selectedIndex;

            return (
              <Box key={engineer.engineerName} marginBottom={0}>
                <Text
                  color={isSelected ? "cyan" : undefined}
                  bold={isSelected}
                  inverse={isSelected}
                >
                  {isSelected ? "→ " : "  "}
                  👤 {engineer.engineerName}
                  {" - "}
                  {engineer.projectCount} projects
                </Text>
              </Box>
            );
          })}
        </Box>

        {engineers.length > viewportHeight && (
          <Box paddingX={2} marginTop={1}>
            <Text dimColor>
              Showing {scrollOffset + 1}-
              {Math.min(scrollOffset + viewportHeight, engineers.length)} of{" "}
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
      scrollOffset,
      scrollOffset + viewportHeight
    );

    return (
      <Box flexDirection="column">
        <Box paddingX={2} paddingY={1}>
          <Text bold color="cyan">
            👤 {selectedEngineer.engineerName}
          </Text>
          <Text dimColor> - {selectedEngineer.projectCount} projects</Text>
        </Box>

        <Box paddingX={2} marginBottom={1}>
          <Text dimColor>Use ↑↓ or j/k to navigate, b/q to go back</Text>
        </Box>

        <Box flexDirection="column" paddingX={2}>
          {visibleProjects.map((project, idx) => {
            const actualIndex = scrollOffset + idx;
            const isSelected = actualIndex === selectedIndex;

            return (
              <Box
                key={project.projectId}
                flexDirection="column"
                marginBottom={1}
              >
                <Box>
                  <Text
                    color={isSelected ? "cyan" : "yellow"}
                    bold={isSelected}
                    inverse={isSelected}
                  >
                    {isSelected ? "→ " : "  "}
                    📦 {project.projectName}
                  </Text>
                  <Text dimColor>
                    {" "}
                    - {project.startedIssueCount} started issues
                  </Text>
                </Box>

                {/* Show issues for this project */}
                <Box flexDirection="column" marginLeft={4}>
                  {project.issues.slice(0, 3).map((issue) => (
                    <Box key={issue.id}>
                      <Text dimColor>{issue.identifier}</Text>
                      <Text> </Text>
                      <Text>{issue.title.substring(0, 60)}</Text>
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
                  <Box marginLeft={4} marginTop={0}>
                    <Text color="cyan">🔗 {project.issues[0].url}</Text>
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>

        {selectedEngineer.projects.length > viewportHeight && (
          <Box paddingX={2} marginTop={1}>
            <Text dimColor>
              Showing {scrollOffset + 1}-
              {Math.min(
                scrollOffset + viewportHeight,
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

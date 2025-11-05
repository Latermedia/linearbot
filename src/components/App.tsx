import React, { useState } from "react";
import { Box, Text } from "ink";
import { MainMenu } from "./MainMenu.js";
import { BrowseView } from "./BrowseView.js";
import { ProjectsView } from "./ProjectsView.js";

export type View = "menu" | "browse" | "projects";

export function App() {
  const [currentView, setCurrentView] = useState<View>("menu");

  const handleViewChange = (view: View) => {
    setCurrentView(view);
  };

  return (
    <Box flexDirection="column">
      <Box key="app-header" flexDirection="column">
        <Box paddingX={2} paddingTop={1}>
          <Text dimColor>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</Text>
        </Box>
        <Box paddingX={2} paddingY={0}>
          <Text bold color="cyan">
            ⚡ LINEAR BOT
          </Text>
          <Text dimColor> │ </Text>
          <Text dimColor>WIP Constraint Analysis</Text>
        </Box>
        <Box paddingX={2} paddingBottom={1}>
          <Text dimColor>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</Text>
        </Box>
      </Box>

      {currentView === "menu" && (
        <MainMenu key="view-menu" onSelectView={handleViewChange} />
      )}

      {currentView === "browse" && (
        <BrowseView key="view-browse" onBack={() => setCurrentView("menu")} />
      )}

      {currentView === "projects" && (
        <ProjectsView key="view-projects" onBack={() => setCurrentView("menu")} />
      )}
    </Box>
  );
}

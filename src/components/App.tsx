import React, { useState } from "react";
import { Box, Text } from "ink";
import { MainMenu } from "./MainMenu.js";
import { BrowseView } from "./BrowseView.js";
import { ProjectsView } from "./ProjectsView.js";
import { EngineersView } from "./EngineersView.js";
import { TeamsView } from "./TeamsView.js";

export type View = "menu" | "browse" | "projects" | "engineers" | "teams";

export function App() {
  const [currentView, setCurrentView] = useState<View>("menu");
  const [headerContext, setHeaderContext] = useState<string>("");

  const handleViewChange = (view: View) => {
    setCurrentView(view);
    // Clear header context when changing to main menu
    if (view === "menu") {
      setHeaderContext("");
    }
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
          {headerContext && (
            <>
              <Text dimColor> │ </Text>
              <Text>{headerContext}</Text>
            </>
          )}
        </Box>
        <Box paddingX={2}>
          <Text dimColor>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</Text>
        </Box>
      </Box>

      {currentView === "menu" && (
        <MainMenu key="view-menu" onSelectView={handleViewChange} />
      )}

      {currentView === "browse" && (
        <BrowseView
          key="view-browse"
          onBack={() => handleViewChange("menu")}
          onHeaderChange={setHeaderContext}
        />
      )}

      {currentView === "projects" && (
        <ProjectsView
          key="view-projects"
          onBack={() => handleViewChange("menu")}
          onHeaderChange={setHeaderContext}
        />
      )}

      {currentView === "engineers" && (
        <EngineersView
          key="view-engineers"
          onBack={() => handleViewChange("menu")}
          onHeaderChange={setHeaderContext}
        />
      )}

      {currentView === "teams" && (
        <TeamsView
          key="view-teams"
          onBack={() => handleViewChange("menu")}
          onHeaderChange={setHeaderContext}
        />
      )}
    </Box>
  );
}

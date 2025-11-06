import React, { useState } from "react";
import { Box, Text, useStdout } from "ink";
import { MainMenu } from "./MainMenu.js";
import { BrowseView } from "./BrowseView.js";
import { ProjectsView } from "./ProjectsView.js";
import { EngineersView } from "./EngineersView.js";
import { TeamsView } from "./TeamsView.js";
import { DomainsView } from "./DomainsView.js";

export type View = "menu" | "browse" | "projects" | "engineers" | "teams" | "domains";

export function App() {
  const { stdout } = useStdout();
  const [currentView, setCurrentView] = useState<View>("menu");
  const [headerContext, setHeaderContext] = useState<string>("");

  const handleViewChange = (view: View) => {
    setCurrentView(view);
    // Clear header context when changing to main menu
    if (view === "menu") {
      setHeaderContext("");
    }
  };

  const terminalWidth = stdout?.columns || 80;

  return (
    <Box flexDirection="column">
      <Box key="app-header" flexDirection="column" paddingTop={1}>
        {/* Header title */}
        <Box paddingX={1}>
          <Text bold color="cyan">
            LINEAR BOT ⚡
          </Text>
          {headerContext && (
            <>
              <Text dimColor> │ </Text>
              <Text>{headerContext}</Text>
            </>
          )}
        </Box>
        {/* Full width separator */}
        <Text dimColor>{"─".repeat(terminalWidth)}</Text>
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

      {currentView === "domains" && (
        <DomainsView
          key="view-domains"
          onBack={() => handleViewChange("menu")}
          onHeaderChange={setHeaderContext}
        />
      )}
    </Box>
  );
}

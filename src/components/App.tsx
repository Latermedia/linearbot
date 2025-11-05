import React, { useState } from "react";
import { Box, Text } from "ink";
import { MainMenu } from "./MainMenu.js";
import { SyncView } from "./SyncView.js";
import { BrowseView } from "./BrowseView.js";

export type View = "menu" | "sync" | "browse";

export function App() {
  const [currentView, setCurrentView] = useState<View>("menu");
  const [syncComplete, setSyncComplete] = useState(false);

  const handleViewChange = (view: View) => {
    setCurrentView(view);
  };

  const handleSyncComplete = () => {
    setSyncComplete(true);
    setTimeout(() => {
      setCurrentView("menu");
      setSyncComplete(false);
    }, 2000);
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="round" borderColor="cyan" padding={1} marginBottom={1}>
        <Text bold color="cyan">
          📦 LINEAR BOT - WIP Constraint Analysis Tool
        </Text>
      </Box>

      {currentView === "menu" && <MainMenu onSelectView={handleViewChange} />}

      {currentView === "sync" && (
        <SyncView
          onComplete={handleSyncComplete}
          onBack={() => setCurrentView("menu")}
        />
      )}

      {currentView === "browse" && (
        <BrowseView onBack={() => setCurrentView("menu")} />
      )}
    </Box>
  );
}

import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { View } from "./App.js";

interface MainMenuProps {
  onSelectView: (view: View) => void;
}

type MenuItem = {
  id: View | "exit";
  label: string;
  description: string;
  key: string;
};

const menuItems: MenuItem[] = [
  {
    id: "sync",
    label: "🔄 Sync from Linear",
    description: "Fetch and sync all active issues from Linear",
    key: "s",
  },
  {
    id: "browse",
    label: "📋 Browse Issues",
    description: "View and explore active issues by assignee",
    key: "b",
  },
  {
    id: "exit",
    label: "👋 Exit",
    description: "Exit the application",
    key: "q",
  },
];

export function MainMenu({ onSelectView }: MainMenuProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useInput((input, key) => {
    if (key.upArrow || input === "k") {
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev));
    } else if (key.downArrow || input === "j") {
      setSelectedIndex((prev) =>
        prev < menuItems.length - 1 ? prev + 1 : prev
      );
    } else if (key.return) {
      const selected = menuItems[selectedIndex];
      if (selected.id === "exit") {
        process.exit(0);
      } else {
        onSelectView(selected.id as View);
      }
    } else {
      // Handle keyboard shortcuts
      const item = menuItems.find((m) => m.key === input);
      if (item) {
        if (item.id === "exit") {
          process.exit(0);
        } else {
          onSelectView(item.id as View);
        }
      }
    }
  });

  return (
    <Box flexDirection="column" paddingLeft={2}>
      <Box marginBottom={1}>
        <Text dimColor>
          Use ↑↓ or j/k to navigate • Press Enter or shortcut key to select
        </Text>
      </Box>

      {menuItems.map((item, index) => {
        const isSelected = index === selectedIndex;
        return (
          <Box key={`menu-${item.id}`} marginBottom={1}>
            <Box width={3}>
              <Text color={isSelected ? "cyan" : "gray"}>
                {isSelected ? "▶ " : "  "}
              </Text>
            </Box>
            <Box flexDirection="column">
              <Text bold={isSelected} color={isSelected ? "cyan" : "white"}>
                {item.label}
              </Text>
              <Text dimColor>{item.description}</Text>
              <Text dimColor color="gray">
                Shortcut: {item.key}
              </Text>
            </Box>
          </Box>
        );
      })}

      <Box marginTop={1} paddingTop={1} borderStyle="single" borderColor="gray">
        <Text dimColor>💡 WIP Constraint: 3 ideal, 5 max per person</Text>
      </Box>
    </Box>
  );
}

import React from "react";
import { Box, Text } from "ink";

interface BoxPanelProps {
  title: string;
  width?: number;
  marginBottom?: number;
  children: React.ReactNode;
}

/**
 * BoxPanel - A reusable component for creating elegant bordered panels
 *
 * Creates a futuristic bordered box with a title and content:
 * ╭─ TITLE ──────────────╮
 * │ content here         │
 * ╰──────────────────────╯
 *
 * @param title - The title to display in the top border
 * @param width - The width of the panel in characters (default: 50)
 * @param marginBottom - Bottom margin for the panel (default: 0)
 * @param children - The content to display inside the panel
 */
export function BoxPanel({
  title,
  width = 50,
  marginBottom = 0,
  children,
}: BoxPanelProps) {
  // Calculate the number of dash characters needed
  // Format: "╭─ TITLE ───...───╮"
  // We need to account for: "╭─ ", title, " ", dashes, "╮"
  const titleLength = title.length;
  const fixedCharsLength = 5; // "╭─ " (3) + " " (1) + "╮" (1)
  const dashCount = Math.max(1, width - titleLength - fixedCharsLength) + 1;
  const topDashes = "─".repeat(dashCount);
  const bottomDashes = "─".repeat(width - 1); // Account for ╰ and ╯

  return (
    <Box flexDirection="column" marginBottom={marginBottom}>
      {/* Top border with title */}
      <Text dimColor>
        ╭─{" "}
        <Text bold dimColor>
          {title}
        </Text>{" "}
        {topDashes}╮
      </Text>

      {/* Content */}
      {children}

      {/* Bottom border */}
      <Text dimColor>╰{bottomDashes}╯</Text>
    </Box>
  );
}

/**
 * BoxPanelLine - A utility component for content lines within a BoxPanel
 * Automatically adds the left and right border characters
 *
 * @param children - The content to display in the line
 */
export function BoxPanelLine({ children }: { children: React.ReactNode }) {
  return (
    <Text>
      <Text dimColor>│ </Text>
      {children}
      <Text dimColor> │</Text>
    </Text>
  );
}

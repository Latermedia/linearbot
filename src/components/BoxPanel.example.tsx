/**
 * BoxPanel Usage Examples
 *
 * This file demonstrates how to use the BoxPanel utility component
 * to create elegant, futuristic bordered sections in your terminal UI.
 */

import React from "react";
import { Box, Text } from "ink";
import { BoxPanel, BoxPanelLine } from "./BoxPanel.js";

/**
 * Example 1: Simple panel with title and single line
 */
export function SimpleExample() {
  return (
    <Box paddingX={2} paddingY={1}>
      <BoxPanel title="STATUS" width={40}>
        <BoxPanelLine>
          <Text color="green">✓ System operational</Text>
        </BoxPanelLine>
      </BoxPanel>
    </Box>
  );
}

/**
 * Example 2: Panel with multiple lines
 */
export function MultiLineExample() {
  return (
    <Box paddingX={2} paddingY={1}>
      <BoxPanel title="METRICS" width={50}>
        <BoxPanelLine>
          <Text bold>5</Text>
          <Text dimColor> assignees • </Text>
          <Text bold>12</Text>
          <Text dimColor> projects</Text>
        </BoxPanelLine>
        <BoxPanelLine>
          <Text dimColor>Last sync: </Text>
          <Text>2 minutes ago</Text>
        </BoxPanelLine>
      </BoxPanel>
    </Box>
  );
}

/**
 * Example 3: Panel with conditional content
 */
export function ConditionalExample({ errorCount }: { errorCount: number }) {
  return (
    <Box paddingX={2} paddingY={1}>
      <BoxPanel title="VIOLATIONS" width={45} marginBottom={2}>
        {errorCount > 0 ? (
          <BoxPanelLine>
            <Text color="red">⚠️ {errorCount} violations found</Text>
          </BoxPanelLine>
        ) : (
          <BoxPanelLine>
            <Text color="green">✓ No violations</Text>
          </BoxPanelLine>
        )}
      </BoxPanel>
    </Box>
  );
}

/**
 * Example 4: Panel with mixed content (without BoxPanelLine)
 *
 * For more complex layouts, you can use regular Box/Text components
 * inside BoxPanel without BoxPanelLine.
 */
export function ComplexExample() {
  return (
    <Box paddingX={2} paddingY={1}>
      <BoxPanel title="ACTIONS" width={65}>
        <BoxPanelLine>
          <Text color="cyan" bold>
            s
          </Text>{" "}
          sync │{" "}
          <Text color="cyan" bold>
            b
          </Text>{" "}
          browse │{" "}
          <Text color="cyan" bold>
            q
          </Text>{" "}
          quit
        </BoxPanelLine>
      </BoxPanel>
    </Box>
  );
}

/**
 * Example 5: Stacked panels with different widths
 */
export function StackedExample() {
  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <BoxPanel title="OVERVIEW" width={52} marginBottom={2}>
        <BoxPanelLine>
          <Text bold>15</Text>
          <Text dimColor> total items</Text>
        </BoxPanelLine>
      </BoxPanel>

      <BoxPanel title="DETAILS" width={52} marginBottom={2}>
        <BoxPanelLine>
          <Text dimColor>Created: </Text>
          <Text>Nov 5, 2025</Text>
        </BoxPanelLine>
        <BoxPanelLine>
          <Text dimColor>Updated: </Text>
          <Text>2 hours ago</Text>
        </BoxPanelLine>
      </BoxPanel>
    </Box>
  );
}

/**
 * Example 6: Dynamic content with data
 */
export function DataExample({
  projects,
}: {
  projects: Array<{ name: string; count: number }>;
}) {
  return (
    <Box paddingX={2} paddingY={1}>
      <BoxPanel title="PROJECTS" width={60} marginBottom={2}>
        {projects.map((project) => (
          <BoxPanelLine key={project.name}>
            <Text bold>{project.name}</Text>
            <Text dimColor> - </Text>
            <Text>{project.count} issues</Text>
          </BoxPanelLine>
        ))}
      </BoxPanel>
    </Box>
  );
}

/**
 * Tips for using BoxPanel:
 *
 * 1. Width Calculation:
 *    - Choose width based on your content length
 *    - Typical widths: 40-70 characters work well
 *    - Too narrow = content gets cut off
 *    - Too wide = looks sparse on smaller terminals
 *
 * 2. BoxPanelLine vs Raw Content:
 *    - Use BoxPanelLine for standard rows with left and right borders
 *    - Use raw Box/Text for more complex layouts
 *
 * 3. Spacing:
 *    - Use marginBottom on BoxPanel for spacing between panels
 *    - Wrap BoxPanel in a Box with paddingX/paddingY for outer spacing
 *
 * 4. Consistency:
 *    - Use the same width for related panels
 *    - Keep titles short and uppercase for consistency
 *    - Use dimColor for borders (automatic with BoxPanel)
 *
 * 5. Content Overflow:
 *    - Be mindful of content length vs panel width
 *    - Text will wrap in terminal if it exceeds width
 *    - Test on different terminal sizes
 */

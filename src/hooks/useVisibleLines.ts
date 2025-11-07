import { useStdout } from "ink";
import { UI_CONSTANTS } from "../constants/thresholds.js";

/**
 * Hook to calculate visible lines in terminal based on terminal height
 * Accounts for header/footer space
 * 
 * @param headerLines - Number of lines reserved for header/footer (default: 7)
 * @returns Number of visible lines for content
 */
export function useVisibleLines(
  headerLines: number = UI_CONSTANTS.HEADER_FOOTER_LINES
): number {
  const { stdout } = useStdout();
  const terminalHeight = stdout?.rows || UI_CONSTANTS.DEFAULT_TERMINAL_HEIGHT;
  
  return Math.max(
    UI_CONSTANTS.MIN_VISIBLE_LINES,
    terminalHeight - headerLines
  );
}


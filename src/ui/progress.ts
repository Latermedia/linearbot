// Simple progress display utilities using ANSI escape codes

export class ProgressDisplay {
  private lastLineCount = 0;

  /**
   * Clear previous progress lines and write new content
   */
  update(message: string): void {
    // Move cursor up and clear lines from previous update
    if (this.lastLineCount > 0) {
      process.stdout.write(`\x1b[${this.lastLineCount}A`); // Move up
      process.stdout.write("\x1b[0J"); // Clear from cursor to end of screen
    }

    // Write new message
    process.stdout.write(message);

    // Count lines in the message
    this.lastLineCount = message.split("\n").filter((line) => line).length;
  }

  /**
   * Finalize progress display (ensures cursor is at end)
   */
  done(): void {
    this.lastLineCount = 0;
    process.stdout.write("\n");
  }

  /**
   * Clear all progress lines
   */
  clear(): void {
    if (this.lastLineCount > 0) {
      process.stdout.write(`\x1b[${this.lastLineCount}A`);
      process.stdout.write("\x1b[0J");
      this.lastLineCount = 0;
    }
  }
}

/**
 * Format a progress counter
 */
export function formatProgress(
  current: number,
  total: number,
  label: string
): string {
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
  const bar = createProgressBar(percentage, 20);
  return `${bar} ${current}/${total} ${label}`;
}

/**
 * Create a simple progress bar
 */
function createProgressBar(percentage: number, width: number): string {
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;
  return `[${"█".repeat(filled)}${" ".repeat(empty)}] ${percentage}%`;
}

/**
 * Format elapsed time
 */
export function formatElapsed(startTime: number): string {
  const elapsed = Date.now() - startTime;
  const seconds = (elapsed / 1000).toFixed(1);
  return `${seconds}s`;
}

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import { join } from "path";

export type WriteOperation =
  | "comment_created"
  | "issue_updated"
  | "issue_created"
  | "comment_failed";

export interface WriteLogEntry {
  timestamp: string;
  operation: WriteOperation;
  issueId: string;
  issueIdentifier?: string;
  issueTitle?: string;
  issueUrl?: string;
  details?: Record<string, any>;
  success: boolean;
  error?: string;
}

const LOG_DIR = join(process.cwd(), "logs");
const LOG_FILE = join(LOG_DIR, "write-operations.log");

/**
 * Ensure the logs directory exists
 */
function ensureLogDir(): void {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }
}

/**
 * Log a write operation to the log file
 */
export function logWriteOperation(entry: WriteLogEntry): void {
  try {
    ensureLogDir();

    // Format as JSON with newline for easy parsing
    const logLine =
      JSON.stringify({
        ...entry,
        timestamp: entry.timestamp || new Date().toISOString(),
      }) + "\n";

    appendFileSync(LOG_FILE, logLine, "utf-8");
  } catch (error) {
    // Don't let logging errors crash the app
    console.error("Failed to write to log file:", error);
  }
}

/**
 * Helper to log a successful comment creation
 */
export function logCommentCreated(
  issueId: string,
  issueIdentifier: string,
  issueTitle: string,
  issueUrl: string,
  commentType: string,
  commentBody: string
): void {
  logWriteOperation({
    timestamp: new Date().toISOString(),
    operation: "comment_created",
    issueId,
    issueIdentifier,
    issueTitle,
    issueUrl,
    details: {
      commentType,
      commentBodyPreview: commentBody.substring(0, 100),
      commentLength: commentBody.length,
    },
    success: true,
  });
}

/**
 * Helper to log a failed comment creation
 */
export function logCommentFailed(
  issueId: string,
  issueIdentifier: string,
  issueTitle: string,
  issueUrl: string,
  commentType: string,
  error: string
): void {
  logWriteOperation({
    timestamp: new Date().toISOString(),
    operation: "comment_failed",
    issueId,
    issueIdentifier,
    issueTitle,
    issueUrl,
    details: {
      commentType,
    },
    success: false,
    error,
  });
}

/**
 * Read the log file and return entries (useful for debugging)
 */
export function readWriteLog(limit?: number): WriteLogEntry[] {
  try {
    if (!existsSync(LOG_FILE)) {
      return [];
    }

    const content = readFileSync(LOG_FILE, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);

    // Parse each JSON line
    const entries = lines
      .map((line) => {
        try {
          return JSON.parse(line) as WriteLogEntry;
        } catch {
          return null;
        }
      })
      .filter(Boolean) as WriteLogEntry[];

    // Return most recent entries if limit specified
    if (limit) {
      return entries.slice(-limit);
    }

    return entries;
  } catch (error) {
    console.error("Failed to read log file:", error);
    return [];
  }
}

/**
 * Get statistics from the log
 */
export function getLogStats(): {
  total: number;
  byOperation: Record<string, number>;
  successRate: number;
  last24Hours: number;
} {
  const entries = readWriteLog();
  const twentyFourHoursAgo = new Date();
  twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

  const stats = {
    total: entries.length,
    byOperation: {} as Record<string, number>,
    successRate: 0,
    last24Hours: 0,
  };

  let successCount = 0;

  for (const entry of entries) {
    // Count by operation
    stats.byOperation[entry.operation] =
      (stats.byOperation[entry.operation] || 0) + 1;

    // Count successes
    if (entry.success) {
      successCount++;
    }

    // Count recent operations
    if (new Date(entry.timestamp) >= twentyFourHoursAgo) {
      stats.last24Hours++;
    }
  }

  stats.successRate =
    entries.length > 0 ? (successCount / entries.length) * 100 : 0;

  return stats;
}


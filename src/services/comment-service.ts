import { getDatabase } from "../db/connection.js";
import { createLinearClient } from "../linear/client.js";
import {
  hasRecentComment,
  logComment,
  cleanupOldCommentLogs,
  COMMENT_TYPES,
} from "../db/comment-tracking.js";
import { logCommentCreated, logCommentFailed } from "../utils/write-log.js";
import { performSync } from "./sync-service.js";
import { COMMENT_THRESHOLDS, RATE_LIMITS } from "../constants/thresholds.js";
import type { Issue } from "../db/schema.js";

export interface CommentResult {
  success: boolean;
  commentedCount: number;
  commentedIssues: Issue[];
  failedCount: number;
  errorMessage?: string;
}

export interface CommentCallbacks {
  onCommentedCountUpdate?: (count: number) => void;
  onCommentedIssuesUpdate?: (issues: Issue[]) => void;
}

/**
 * Comment on unassigned started issues with a warning message
 * @param callbacks - Optional callbacks for progress updates
 */
export async function commentOnUnassignedIssues(
  callbacks?: CommentCallbacks
): Promise<CommentResult> {
  try {
    // Step 1: Sync first to get latest issue states (skip project sync - we only need started issues)
    const syncResult = await performSync(false);

    if (!syncResult.success) {
      return {
        success: false,
        commentedCount: 0,
        commentedIssues: [],
        failedCount: 0,
        errorMessage: "Failed to sync issues before commenting",
      };
    }

    // Step 2: Now proceed with commenting on fresh data
    const db = getDatabase();

    // Clean up old logs periodically (optional, keeps DB lean)
    cleanupOldCommentLogs(db);

    // Get all unassigned issues from the freshly synced database
    // Exclude Paused and Blocked states - these being unassigned is often intentional
    const unassignedIssues = db
      .prepare(
        `
        SELECT * FROM issues 
        WHERE state_type = 'started' 
          AND assignee_name IS NULL
          AND state_name NOT IN ('Paused', 'Blocked')
      `
      )
      .all() as Issue[];

    if (unassignedIssues.length === 0) {
      return {
        success: true,
        commentedCount: 0,
        commentedIssues: [],
        failedCount: 0,
      };
    }

    // Filter out issues we've commented on in the past 24 hours (local DB check)
    let issuesNeedingComments = unassignedIssues.filter(
      (issue) =>
        !hasRecentComment(db, issue.id, COMMENT_TYPES.UNASSIGNED_WARNING, COMMENT_THRESHOLDS.RECENT_HOURS)
    );

    const linearClient = createLinearClient();
    const message =
      "⚠️  **This issue requires an assignee**\n\nThis started issue is currently unassigned. Please assign an owner to ensure it gets proper attention and tracking.";

    // Unique identifier in the message to search for
    const messageIdentifier = "This issue requires an assignee";

    // Double-check against Linear API to catch any comments we didn't track
    const finalIssuesNeedingComments: Issue[] = [];

    for (const issue of issuesNeedingComments) {
      const hasLinearComment = await linearClient.hasRecentCommentWithText(
        issue.id,
        messageIdentifier,
        COMMENT_THRESHOLDS.RECENT_HOURS
      );

      if (!hasLinearComment) {
        finalIssuesNeedingComments.push(issue);
      }
    }

    if (finalIssuesNeedingComments.length === 0) {
      return {
        success: true,
        commentedCount: 0,
        commentedIssues: [],
        failedCount: 0,
        errorMessage: `All ${unassignedIssues.length} unassigned issues already have recent warnings (< 24h)`,
      };
    }

    // Comment on all issues that need warnings
    const successfullyCommented: Issue[] = [];
    let failedCount = 0;

    for (const issue of finalIssuesNeedingComments) {
      try {
        const success = await linearClient.commentOnIssue(issue.id, message);

        if (success) {
          // Log the successful comment to the write log
          logCommentCreated(
            issue.id,
            issue.identifier,
            issue.title,
            issue.url,
            COMMENT_TYPES.UNASSIGNED_WARNING,
            message
          );

          // Log the comment to DB to prevent duplicates
          logComment(db, issue.id, COMMENT_TYPES.UNASSIGNED_WARNING);

          successfullyCommented.push(issue);
          callbacks?.onCommentedCountUpdate?.(successfullyCommented.length);
          callbacks?.onCommentedIssuesUpdate?.([...successfullyCommented]);
        } else {
          // Log the failed comment
          logCommentFailed(
            issue.id,
            issue.identifier,
            issue.title,
            issue.url,
            COMMENT_TYPES.UNASSIGNED_WARNING,
            "Comment API returned false"
          );
          failedCount++;
        }

        // Small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, RATE_LIMITS.COMMENT_DELAY_MS));
      } catch (commentError) {
        // Log the failed comment with error details
        logCommentFailed(
          issue.id,
          issue.identifier,
          issue.title,
          issue.url,
          COMMENT_TYPES.UNASSIGNED_WARNING,
          commentError instanceof Error
            ? commentError.message
            : String(commentError)
        );
        failedCount++;
      }
    }

    const errorMessage =
      failedCount > 0
        ? `Commented on ${successfullyCommented.length} issues, ${failedCount} failed`
        : undefined;

    return {
      success: true,
      commentedCount: successfullyCommented.length,
      commentedIssues: successfullyCommented,
      failedCount,
      errorMessage,
    };
  } catch (error) {
    return {
      success: false,
      commentedCount: 0,
      commentedIssues: [],
      failedCount: 0,
      errorMessage:
        error instanceof Error ? error.message : "Failed to comment on issues",
    };
  }
}


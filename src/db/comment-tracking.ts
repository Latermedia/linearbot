import type { Database } from "bun:sqlite";

export const COMMENT_TYPES = {
  UNASSIGNED_WARNING: "unassigned_warning",
} as const;

export type CommentType = (typeof COMMENT_TYPES)[keyof typeof COMMENT_TYPES];

/**
 * Check if we've commented on an issue recently
 */
export function hasRecentComment(
  db: Database,
  issueId: string,
  commentType: CommentType,
  hoursAgo: number = 24
): boolean {
  const cutoffDate = new Date();
  cutoffDate.setHours(cutoffDate.getHours() - hoursAgo);

  const query = db.prepare(`
    SELECT COUNT(*) as count 
    FROM comment_log 
    WHERE issue_id = ? 
      AND comment_type = ? 
      AND commented_at > ?
  `);

  const result = query.get(issueId, commentType, cutoffDate.toISOString()) as {
    count: number;
  };

  return result.count > 0;
}

/**
 * Log that we've commented on an issue
 */
export function logComment(
  db: Database,
  issueId: string,
  commentType: CommentType
): void {
  const insert = db.prepare(`
    INSERT INTO comment_log (issue_id, comment_type, commented_at)
    VALUES (?, ?, ?)
  `);

  insert.run(issueId, commentType, new Date().toISOString());
}

/**
 * Clean up old comment logs (older than 30 days)
 */
export function cleanupOldCommentLogs(
  db: Database,
  daysToKeep: number = 30
): number {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

  const deleteOld = db.prepare(`
    DELETE FROM comment_log 
    WHERE commented_at < ?
  `);

  const result = deleteOld.run(cutoffDate.toISOString());
  return result.changes;
}

/**
 * Get all issues that need comments (filtered by recent comment check)
 */
export function getUnassignedIssuesNeedingComments(
  db: Database,
  commentType: CommentType,
  hoursAgo: number = 24
): string[] {
  const cutoffDate = new Date();
  cutoffDate.setHours(cutoffDate.getHours() - hoursAgo);

  const query = db.prepare(`
    SELECT i.id
    FROM issues i
    WHERE i.state_type = 'started' 
      AND i.assignee_name IS NULL
      AND NOT EXISTS (
        SELECT 1 
        FROM comment_log cl 
        WHERE cl.issue_id = i.id 
          AND cl.comment_type = ?
          AND cl.commented_at > ?
      )
  `);

  const results = query.all(commentType, cutoffDate.toISOString()) as {
    id: string;
  }[];
  return results.map((r) => r.id);
}

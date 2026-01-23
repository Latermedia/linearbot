import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getAllIssues } from "../../../db/queries.js";
import type { Issue } from "../../../db/schema.js";

/**
 * GET /api/issues
 *
 * Returns issues with optional filtering.
 *
 * Query params:
 * - type: Filter by issue type (e.g., "bug")
 * - status: Filter by status ("open" = not completed/canceled, "closed" = completed/canceled)
 * - limit: Maximum number of issues to return (default: 500)
 */
export const GET: RequestHandler = async ({ url }) => {
  const typeFilter = url.searchParams.get("type")?.toLowerCase();
  const statusFilter = url.searchParams.get("status")?.toLowerCase();
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? parseInt(limitParam, 10) : 500;

  let issues = getAllIssues();

  // Filter by type (check labels for "bug" pattern)
  if (typeFilter === "bug") {
    issues = issues.filter((issue) => {
      const labels = issue.labels?.toLowerCase() || "";
      return labels.includes("bug");
    });
  }

  // Filter by status using completed_at and canceled_at fields
  if (statusFilter === "open") {
    // Open = not completed and not canceled (these fields are null)
    issues = issues.filter((issue) => {
      return !issue.completed_at && !issue.canceled_at;
    });
  } else if (statusFilter === "closed") {
    // Closed = completed or canceled
    issues = issues.filter((issue) => {
      return issue.completed_at || issue.canceled_at;
    });
  }

  // Apply limit
  if (limit > 0 && issues.length > limit) {
    issues = issues.slice(0, limit);
  }

  return json({ issues } satisfies { issues: Issue[] });
};

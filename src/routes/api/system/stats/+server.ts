import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  getTotalIssueCount,
  getAllProjects,
  getAllEngineers,
} from "../../../../db/queries.js";
import { getDatabase } from "../../../../db/connection.js";

export const GET: RequestHandler = async () => {
  try {
    const totalIssues = getTotalIssueCount();
    const projects = getAllProjects();
    const engineers = getAllEngineers();

    // Count distinct teams from issues
    const db = getDatabase();
    const teamQuery = db.prepare(`
      SELECT COUNT(DISTINCT team_key) as count FROM issues
    `);
    const teamResult = teamQuery.get() as { count: number };
    const totalTeams = teamResult.count || 0;

    // Count started issues
    const startedIssuesQuery = db.prepare(`
      SELECT COUNT(*) as count FROM issues WHERE state_type = 'started'
    `);
    const startedResult = startedIssuesQuery.get() as { count: number };
    const startedIssues = startedResult.count || 0;

    return json({
      totalIssues,
      totalProjects: projects.length,
      totalEngineers: engineers.length,
      totalTeams,
      startedIssues,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    console.error("[API] Error fetching system stats:", errorMsg);
    return json({ error: "Failed to fetch system stats" }, { status: 500 });
  }
};

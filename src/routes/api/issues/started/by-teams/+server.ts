import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getStartedIssuesByTeams } from "../../../../../db/queries.js";
import type { Issue } from "../../../../../db/schema.js";

export const GET: RequestHandler = async ({ url }) => {
  try {
    const teamsParam = url.searchParams.get("teams");
    if (!teamsParam) {
      return json({ error: "teams parameter is required" }, { status: 400 });
    }

    const teamKeys = teamsParam
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (teamKeys.length === 0) {
      return json({ issues: [] } satisfies { issues: Issue[] });
    }

    const issues = getStartedIssuesByTeams(teamKeys);
    return json({ issues } satisfies { issues: Issue[] });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    console.error("[API] Error fetching issues by teams:", errorMsg);
    return json({ error: "Failed to fetch issues by teams" }, { status: 500 });
  }
};

import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getNonProjectWipIssuesByTeam } from "../../../../../db/queries.js";
import type { Issue } from "../../../../../db/schema.js";

export const GET: RequestHandler = async ({ params }) => {
  const { teamKey } = params;

  if (!teamKey) {
    return json({ error: "Team key is required" }, { status: 400 });
  }

  const issues = getNonProjectWipIssuesByTeam(teamKey);
  return json({ issues } satisfies { issues: Issue[] });
};

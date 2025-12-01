import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getStartedIssuesByTeams } from "../../../../../db/queries.js";
import { validateTeamKeys } from "$lib/utils.js";
import type { Issue } from "../../../../../db/schema.js";

export const GET: RequestHandler = async ({ url }) => {
  const teamsParam = url.searchParams.get("teams");
  const validation = validateTeamKeys(teamsParam);
  if (!validation.valid) {
    return json({ error: validation.error }, { status: 400 });
  }

  const issues = getStartedIssuesByTeams(validation.teamKeys!);
  return json({ issues } satisfies { issues: Issue[] });
};

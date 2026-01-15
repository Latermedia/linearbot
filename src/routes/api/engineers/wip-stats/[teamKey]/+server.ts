import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getEngineersForTeamProjects } from "../../../../../db/queries.js";
import type { Engineer } from "../../../../../db/schema.js";

export const GET: RequestHandler = async ({ params }) => {
  const { teamKey } = params;

  if (!teamKey) {
    return json({ error: "Team key is required" }, { status: 400 });
  }

  const engineers = getEngineersForTeamProjects(teamKey);
  return json({ engineers } satisfies { engineers: Engineer[] });
};

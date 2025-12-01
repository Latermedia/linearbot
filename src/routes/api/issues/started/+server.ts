import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getStartedIssues } from "../../../../db/queries.js";
import type { Issue } from "../../../../db/schema.js";

export const GET: RequestHandler = async () => {
  const issues = getStartedIssues();
  return json({ issues } satisfies { issues: Issue[] });
};

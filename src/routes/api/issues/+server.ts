import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getAllIssues } from "../../../db/queries.js";
import type { Issue } from "../../../db/schema.js";

export const GET: RequestHandler = async () => {
  const issues = getAllIssues();
  return json({ issues } satisfies { issues: Issue[] });
};

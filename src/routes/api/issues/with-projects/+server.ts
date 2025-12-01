import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getIssuesWithProjects } from "../../../../db/queries.js";
import type { Issue } from "../../../../db/schema.js";

export const GET: RequestHandler = async () => {
  console.log("[API /issues/with-projects] Calling getIssuesWithProjects()...");
  const issues = getIssuesWithProjects();
  console.log("[API /issues/with-projects] Got", issues.length, "issues");
  return json({ issues } satisfies { issues: Issue[] });
};

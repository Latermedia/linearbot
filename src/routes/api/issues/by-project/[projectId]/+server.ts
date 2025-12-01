import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getIssuesByProject } from "../../../../../db/queries.js";
import type { Issue } from "../../../../../db/schema.js";

export const GET: RequestHandler = async ({ params }) => {
  const { projectId } = params;
  if (!projectId) {
    return json({ error: "Project ID is required" }, { status: 400 });
  }

  const issues = getIssuesByProject(projectId);
  return json({ issues } satisfies { issues: Issue[] });
};

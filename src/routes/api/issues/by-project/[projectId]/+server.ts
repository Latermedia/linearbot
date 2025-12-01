import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getIssuesByProject } from "../../../../../db/queries.js";
import { validateProjectId } from "$lib/utils.js";
import type { Issue } from "../../../../../db/schema.js";

export const GET: RequestHandler = async ({ params }) => {
  const { projectId } = params;
  const validation = validateProjectId(projectId);
  if (!validation.valid) {
    return json({ error: validation.error }, { status: 400 });
  }

  const issues = getIssuesByProject(projectId!);
  return json({ issues } satisfies { issues: Issue[] });
};

import { json } from "@sveltejs/kit";
import { getProjectById } from "../../../../db/queries.js";
import { validateProjectId } from "$lib/utils.js";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params }) => {
  const { projectId } = params;
  const validation = validateProjectId(projectId);
  if (!validation.valid) {
    return json({ error: validation.error }, { status: 400 });
  }

  const project = getProjectById(projectId!);
  if (!project) {
    return json({ error: "Project not found" }, { status: 404 });
  }

  return json({ project });
};

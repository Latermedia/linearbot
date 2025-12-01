import { json } from "@sveltejs/kit";
import { getProjectById } from "../../../../db/queries.js";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params }) => {
  const { projectId } = params;
  if (!projectId) {
    return json({ error: "Project ID is required" }, { status: 400 });
  }

  const project = getProjectById(projectId);
  if (!project) {
    return json({ error: "Project not found" }, { status: 404 });
  }

  return json({ project });
};

import { json } from "@sveltejs/kit";
import { getProjectById } from "../../../../db/queries.js";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params }) => {
  try {
    const { projectId } = params;
    if (!projectId) {
      return json({ error: "Project ID is required" }, { status: 400 });
    }

    const project = getProjectById(projectId);
    if (!project) {
      return json({ error: "Project not found" }, { status: 404 });
    }

    return json({ project });
  } catch (error) {
    console.error("[GET /api/projects/[projectId]] Error:", error);
    return json(
      {
        error:
          error instanceof Error ? error.message : "Failed to fetch project",
      },
      { status: 500 }
    );
  }
};

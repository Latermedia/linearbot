import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { createLinearClient } from "../../../../../linear/client.js";

export const GET: RequestHandler = async ({ params }) => {
  try {
    const { projectId } = params;
    if (!projectId) {
      return json({ error: "Project ID is required" }, { status: 400 });
    }

    const linearClient = createLinearClient();
    const description = await linearClient.fetchProjectDescription(projectId);
    return json({ description });
  } catch (_error) {
    // Return null instead of error to gracefully handle missing descriptions
    // Global error handler will log the error server-side
    return json({ description: null });
  }
};

import { json } from "@sveltejs/kit";
import { getAllEngineers } from "../../../db/queries.js";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async () => {
  try {
    const engineers = getAllEngineers();
    return json({ engineers });
  } catch (error) {
    console.error("[GET /api/engineers] Error:", error);
    return json(
      {
        error:
          error instanceof Error ? error.message : "Failed to fetch engineers",
      },
      { status: 500 }
    );
  }
};

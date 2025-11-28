import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getDatabase } from "../../../../db/connection.js";

export const GET: RequestHandler = async () => {
  try {
    const db = getDatabase();
    const query = db.prepare("SELECT MAX(updated_at) as latest FROM issues");
    const result = query.get() as { latest: string | null } | undefined;

    return json({
      latest: result?.latest || null,
    } satisfies { latest: string | null });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    console.error("[API] Error fetching latest update:", errorMsg);
    return json({ error: "Failed to fetch latest update" }, { status: 500 });
  }
};

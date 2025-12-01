import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getTotalIssueCount } from "../../../../db/queries.js";

export const GET: RequestHandler = async () => {
  const count = getTotalIssueCount();
  return json({ count } satisfies { count: number });
};

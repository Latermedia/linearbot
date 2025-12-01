import { json } from "@sveltejs/kit";
import { getAllEngineers } from "../../../db/queries.js";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async () => {
  const engineers = getAllEngineers();
  return json({ engineers });
};

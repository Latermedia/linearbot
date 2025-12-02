import { json } from "@sveltejs/kit";
import { getAllInitiatives } from "../../../db/queries.js";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async () => {
  const initiatives = getAllInitiatives();
  return json({ initiatives });
};


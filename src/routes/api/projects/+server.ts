import { json } from "@sveltejs/kit";
import { getAllProjects } from "../../../db/queries.js";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async () => {
  const projects = getAllProjects();
  return json({ projects });
};

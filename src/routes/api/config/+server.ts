import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async () => {
  // Load from environment variable only
  const { getDomainMappings } =
    await import("../../../utils/domain-mapping.js");
  const mappings = getDomainMappings();

  return json({
    teamDomainMappings: mappings,
  });
};

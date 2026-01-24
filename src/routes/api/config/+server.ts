import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getTeamNamesByKey } from "../../../db/queries.js";

export const GET: RequestHandler = async () => {
  // Load domain mappings from environment variable
  const { getDomainMappings } =
    await import("../../../utils/domain-mapping.js");
  const domainMappings = getDomainMappings();

  // Load team name mappings from database
  const teamNameMappings = getTeamNamesByKey();

  return json({
    teamDomainMappings: domainMappings,
    teamNameMappings: teamNameMappings,
  });
};

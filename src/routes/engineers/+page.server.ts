// Disable prerendering for this page since it needs the database
export const prerender = false;

import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
  // Load engineer-to-team mapping from environment variable
  // Format: "Alice:ENG,Bob:ENG,Carol:DESIGN" (engineer:teamKey pairs)
  const engineerTeamMapping: Record<string, string> = {};

  if (process.env.ENGINEER_TEAM_MAPPING) {
    const pairs = process.env.ENGINEER_TEAM_MAPPING.split(",");
    for (const pair of pairs) {
      const [engineer, teamKey] = pair.split(":").map((s) => s.trim());
      if (engineer && teamKey) {
        engineerTeamMapping[engineer] = teamKey;
      }
    }
  }

  return {
    engineerTeamMapping,
  };
};

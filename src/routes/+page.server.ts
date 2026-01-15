// Disable prerendering for this page since it needs the database
export const prerender = false;
// SSR is controlled by +layout.ts (set to false for SPA mode)

import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
  // Load engineer-to-team mapping from environment variable
  // Format: "Alice:ENG,Bob:ENG,Carol:DESIGN" (engineer:teamKey pairs)
  // This whitelists which engineers count towards each team's IC metrics
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

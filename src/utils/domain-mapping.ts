// Domain mapping for teams
// DomainName is a string type - configure domains in your TEAM_DOMAIN_MAPPINGS env var
export type DomainName = string;

export interface DomainMapping {
  [teamKey: string]: DomainName;
}

// Load team-to-domain mappings from environment variable
// Returns empty object if not configured
function loadTeamMappings(): DomainMapping {
  const envMappings = process.env.TEAM_DOMAIN_MAPPINGS;
  if (envMappings) {
    try {
      return JSON.parse(envMappings) as DomainMapping;
    } catch (error) {
      console.error("Failed to parse TEAM_DOMAIN_MAPPINGS:", error);
      return {};
    }
  }
  return {};
}

export const TEAM_TO_DOMAIN: DomainMapping = loadTeamMappings();

// Check if domain mappings are configured
export function hasDomainMappings(): boolean {
  return Object.keys(TEAM_TO_DOMAIN).length > 0;
}

export function getDomainForTeam(teamKey: string): DomainName | null {
  return TEAM_TO_DOMAIN[teamKey] || null;
}

export function getTeamsForDomain(domain: DomainName): string[] {
  return Object.entries(TEAM_TO_DOMAIN)
    .filter(([_, d]) => d === domain)
    .map(([teamKey]) => teamKey);
}

// Get all unique domains from the mapping
export function getAllDomains(): DomainName[] {
  return Array.from(new Set(Object.values(TEAM_TO_DOMAIN)));
}

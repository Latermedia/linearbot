// Domain mapping for teams
// DomainName is a string type - configure domains in your TEAM_DOMAIN_MAPPINGS env var
export type DomainName = string;

export interface DomainMapping {
  [teamKey: string]: DomainName;
}

// Load team-to-domain mappings from environment variable
// Returns empty object if not configured
function loadTeamMappings(): DomainMapping {
  // Check if we're in a server environment (Node/Bun)
  if (typeof process === "undefined" || !process.env) {
    // Browser environment - return empty mappings
    // Domain info will come from the database/API
    return {};
  }

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

let TEAM_TO_DOMAIN: DomainMapping = loadTeamMappings();

// Initialize domain mappings (for browser)
export function initializeDomainMappings(mappings: DomainMapping): void {
  TEAM_TO_DOMAIN = mappings;
}

// Check if domain mappings are configured
export function hasDomainMappings(): boolean {
  return Object.keys(TEAM_TO_DOMAIN).length > 0;
}

export function getDomainForTeam(teamKey: string): DomainName | null {
  // Try exact match first
  if (TEAM_TO_DOMAIN[teamKey]) {
    return TEAM_TO_DOMAIN[teamKey];
  }
  
  // Try case-insensitive match
  const upperKey = teamKey.toUpperCase();
  if (TEAM_TO_DOMAIN[upperKey]) {
    return TEAM_TO_DOMAIN[upperKey];
  }
  
  // Try finding by case-insensitive key match
  const matchingKey = Object.keys(TEAM_TO_DOMAIN).find(
    key => key.toUpperCase() === upperKey
  );
  
  if (matchingKey) {
    return TEAM_TO_DOMAIN[matchingKey];
  }
  
  if (teamKey === "APP" || teamKey.toLowerCase() === "app") {
    console.log('[getDomainForTeam] No match for team:', teamKey, 'Available keys:', Object.keys(TEAM_TO_DOMAIN));
  }
  
  return null;
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

// Get current mappings (for inspection)
export function getDomainMappings(): DomainMapping {
  return { ...TEAM_TO_DOMAIN };
}

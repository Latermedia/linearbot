/**
 * GetDX Team to Domain Mapping
 *
 * Maps GetDX team identifiers to our domain names.
 * Configure via GETDX_DOMAIN_MAPPINGS environment variable.
 *
 * Format: {"getdx-team-id-or-name": "DomainName", ...}
 *
 * This will be configured after inspecting the GetDX API response
 * to see how teams are identified.
 */

export interface GetDXDomainMapping {
  [getdxTeamId: string]: string; // GetDX team ID/name -> Domain name
}

/**
 * Load GetDX team to domain mappings from environment
 */
function loadGetDXMappings(): GetDXDomainMapping {
  if (typeof process === "undefined" || !process.env) {
    return {};
  }

  const envMappings = process.env.GETDX_DOMAIN_MAPPINGS;
  if (envMappings) {
    try {
      return JSON.parse(envMappings) as GetDXDomainMapping;
    } catch (error) {
      console.error("[GETDX] Failed to parse GETDX_DOMAIN_MAPPINGS:", error);
      return {};
    }
  }
  return {};
}

let GETDX_TO_DOMAIN: GetDXDomainMapping = loadGetDXMappings();

/**
 * Initialize GetDX domain mappings (for browser or testing)
 */
export function initializeGetDXMappings(mappings: GetDXDomainMapping): void {
  GETDX_TO_DOMAIN = mappings;
}

/**
 * Check if GetDX domain mappings are configured
 */
export function hasGetDXMappings(): boolean {
  return Object.keys(GETDX_TO_DOMAIN).length > 0;
}

/**
 * Get the domain name for a GetDX team
 *
 * @param getdxTeamId - The GetDX team ID or name
 * @returns Domain name or null if not mapped
 */
export function getDomainForGetDXTeam(getdxTeamId: string): string | null {
  // Try exact match first
  if (GETDX_TO_DOMAIN[getdxTeamId]) {
    return GETDX_TO_DOMAIN[getdxTeamId];
  }

  // Try case-insensitive match
  const lowerKey = getdxTeamId.toLowerCase();
  const matchingKey = Object.keys(GETDX_TO_DOMAIN).find(
    (key) => key.toLowerCase() === lowerKey
  );

  if (matchingKey) {
    return GETDX_TO_DOMAIN[matchingKey];
  }

  return null;
}

/**
 * Get all GetDX team IDs that map to a specific domain
 *
 * @param domainName - The domain name
 * @returns Array of GetDX team IDs
 */
export function getGetDXTeamsForDomain(domainName: string): string[] {
  return Object.entries(GETDX_TO_DOMAIN)
    .filter(([_, domain]) => domain === domainName)
    .map(([teamId]) => teamId);
}

/**
 * Get all unique domains from the GetDX mappings
 */
export function getAllGetDXDomains(): string[] {
  return Array.from(new Set(Object.values(GETDX_TO_DOMAIN)));
}

/**
 * Get current mappings (for inspection/debugging)
 */
export function getGetDXMappings(): GetDXDomainMapping {
  return { ...GETDX_TO_DOMAIN };
}

/**
 * Log available GetDX teams for mapping configuration
 *
 * Call this with API response data to help configure mappings
 */
export function logGetDXTeamsForMapping(
  teams: Array<{
    teamId?: string;
    teamName?: string;
    id?: string;
    name?: string;
  }>
): void {
  console.log("[GETDX] Available teams for mapping:");
  for (const team of teams) {
    const id = team.teamId || team.id || "unknown";
    const name = team.teamName || team.name || "unknown";
    const mapped = getDomainForGetDXTeam(id) || getDomainForGetDXTeam(name);
    console.log(
      `  - ID: "${id}", Name: "${name}" -> ${mapped ? `Mapped to: ${mapped}` : "NOT MAPPED"}`
    );
  }

  if (!hasGetDXMappings()) {
    console.log(
      "[GETDX] No mappings configured. Set GETDX_DOMAIN_MAPPINGS env var."
    );
    console.log(
      '[GETDX] Example: GETDX_DOMAIN_MAPPINGS=\'{"team-id-1": "Platform", "team-id-2": "Product"}\''
    );
  }
}

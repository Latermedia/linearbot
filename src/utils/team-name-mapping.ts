// Team name mapping - maps team keys (slugs) to full team names
// e.g., "APP" -> "Creator Applications"

export interface TeamNameMapping {
  [teamKey: string]: string;
}

// Module-level storage for team name mappings
let TEAM_NAMES: TeamNameMapping = {};

// Initialize team name mappings (for browser)
export function initializeTeamNameMappings(mappings: TeamNameMapping): void {
  TEAM_NAMES = mappings;
}

// Get team name by key, with fallback to key if not found
export function getTeamNameByKey(teamKey: string): string {
  return TEAM_NAMES[teamKey] || teamKey;
}

// Check if team name mappings are configured
export function hasTeamNameMappings(): boolean {
  return Object.keys(TEAM_NAMES).length > 0;
}

// Get all team name mappings (for inspection)
export function getTeamNameMappings(): TeamNameMapping {
  return { ...TEAM_NAMES };
}

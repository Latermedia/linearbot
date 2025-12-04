import { writable, get } from "svelte/store";
import { browser } from "$app/environment";

const STORAGE_KEY = "linear-bot-team-filter";

/**
 * Store for the global team filter.
 * Holds the selected teamKey (e.g., "ENG") or null for "All Teams".
 * Persists to localStorage for session continuity.
 */
function createTeamFilterStore() {
  // Initialize with stored value or default to null (all teams)
  let initialTeamKey: string | null = null;
  if (browser) {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && stored !== "null") {
      initialTeamKey = stored;
    }
  }

  const { subscribe, set } = writable<string | null>(initialTeamKey);

  return {
    subscribe,
    set: (teamKey: string | null) => {
      if (browser) {
        if (teamKey === null) {
          localStorage.removeItem(STORAGE_KEY);
        } else {
          localStorage.setItem(STORAGE_KEY, teamKey);
        }
      }
      set(teamKey);
    },
    clear: () => {
      if (browser) {
        localStorage.removeItem(STORAGE_KEY);
      }
      set(null);
    },
    get: () => get({ subscribe }),
  };
}

export const teamFilterStore = createTeamFilterStore();

/**
 * Check if a team matches the current filter.
 * @param teamKey - The team key to check
 * @param filterTeamKey - The current filter value (null means all teams match)
 */
export function matchesTeamFilter(
  teamKey: string,
  filterTeamKey: string | null
): boolean {
  if (filterTeamKey === null) return true;
  return teamKey === filterTeamKey;
}

/**
 * Check if a set of teams contains the filtered team.
 * @param teams - Set of team keys (e.g., from a project)
 * @param filterTeamKey - The current filter value (null means all match)
 */
export function teamsMatchFilter(
  teams: Set<string>,
  filterTeamKey: string | null
): boolean {
  if (filterTeamKey === null) return true;
  return teams.has(filterTeamKey);
}

/**
 * Check if a JSON array of team IDs/keys contains the filtered team.
 * @param teamIdsJson - JSON string of team IDs/keys array
 * @param filterTeamKey - The current filter value (null means all match)
 */
export function teamIdsMatchFilter(
  teamIdsJson: string,
  filterTeamKey: string | null
): boolean {
  if (filterTeamKey === null) return true;
  try {
    const teamIds: string[] = JSON.parse(teamIdsJson);
    return teamIds.includes(filterTeamKey);
  } catch {
    return false;
  }
}

/**
 * Check if a JSON array of team names contains a team name that matches the filter.
 * @param teamNamesJson - JSON string of team names array
 * @param filterTeamName - The team name to filter by (null means all match)
 */
export function teamNamesMatchFilter(
  teamNamesJson: string,
  filterTeamName: string | null
): boolean {
  if (filterTeamName === null) return true;
  try {
    const teamNames: string[] = JSON.parse(teamNamesJson);
    return teamNames.includes(filterTeamName);
  } catch {
    return false;
  }
}

import { writable, derived, get } from "svelte/store";
import { browser } from "$app/environment";
import {
  getDomainForTeam,
  getTeamsForDomain,
} from "../../utils/domain-mapping";

const STORAGE_KEY = "linear-bot-filter";

/**
 * Filter state for two-tiered domain/team filtering.
 */
export interface FilterState {
  domain: string | null; // e.g., "Platform", "Product"
  teamKey: string | null; // e.g., "ENG", "DESIGN"
}

/**
 * Store for the global two-tiered filter.
 * Holds the selected domain (primary) and teamKey (secondary).
 * Persists to localStorage for session continuity.
 */
function createTeamFilterStore() {
  // Initialize with stored value or default to null (all)
  let initialState: FilterState = { domain: null, teamKey: null };
  if (browser) {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        initialState = {
          domain: parsed.domain ?? null,
          teamKey: parsed.teamKey ?? null,
        };
      } catch {
        // Migration from old format (just teamKey string)
        if (stored !== "null") {
          const teamKey = stored;
          const domain = getDomainForTeam(teamKey);
          initialState = { domain, teamKey };
        }
      }
    }
  }

  const { subscribe, set } = writable<FilterState>(initialState);

  function persist(state: FilterState) {
    if (browser) {
      if (state.domain === null && state.teamKey === null) {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      }
    }
  }

  return {
    subscribe,

    /**
     * Set the domain filter. Clears the team filter.
     */
    setDomain: (domain: string | null) => {
      const newState: FilterState = { domain, teamKey: null };
      persist(newState);
      set(newState);
    },

    /**
     * Set the team filter. Auto-sets the domain based on team mapping.
     */
    setTeam: (teamKey: string | null) => {
      if (teamKey === null) {
        const newState: FilterState = { domain: null, teamKey: null };
        persist(newState);
        set(newState);
      } else {
        const domain = getDomainForTeam(teamKey);
        const newState: FilterState = { domain, teamKey };
        persist(newState);
        set(newState);
      }
    },

    /**
     * Set both domain and team at once.
     */
    setBoth: (domain: string | null, teamKey: string | null) => {
      const newState: FilterState = { domain, teamKey };
      persist(newState);
      set(newState);
    },

    /**
     * Legacy setter - sets teamKey and auto-derives domain.
     * @deprecated Use setTeam() instead
     */
    set: (teamKey: string | null) => {
      if (teamKey === null) {
        const newState: FilterState = { domain: null, teamKey: null };
        persist(newState);
        set(newState);
      } else {
        const domain = getDomainForTeam(teamKey);
        const newState: FilterState = { domain, teamKey };
        persist(newState);
        set(newState);
      }
    },

    /**
     * Clear both filters.
     */
    clear: () => {
      const newState: FilterState = { domain: null, teamKey: null };
      persist(newState);
      set(newState);
    },

    /**
     * Get current state synchronously.
     */
    get: () => get({ subscribe }),
  };
}

export const teamFilterStore = createTeamFilterStore();

/**
 * Derived store for just the teamKey (backward compatibility).
 */
export const selectedTeamKey = derived(
  teamFilterStore,
  ($filter) => $filter.teamKey
);

/**
 * Derived store for just the domain.
 */
export const selectedDomain = derived(
  teamFilterStore,
  ($filter) => $filter.domain
);

/**
 * Check if any filter is active.
 */
export const hasActiveFilter = derived(
  teamFilterStore,
  ($filter) => $filter.domain !== null || $filter.teamKey !== null
);

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
 * Check if a domain matches the current filter.
 * @param domain - The domain to check
 * @param filterDomain - The current domain filter value (null means all domains match)
 */
export function matchesDomainFilter(
  domain: string | null,
  filterDomain: string | null
): boolean {
  if (filterDomain === null) return true;
  return domain === filterDomain;
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
 * Check if a set of teams matches the domain filter.
 * @param teams - Set of team keys (e.g., from a project)
 * @param filterDomain - The current domain filter value (null means all match)
 */
export function teamsMatchDomainFilter(
  teams: Set<string>,
  filterDomain: string | null
): boolean {
  if (filterDomain === null) return true;
  const teamsInDomain = getTeamsForDomain(filterDomain);
  for (const teamKey of teams) {
    if (teamsInDomain.includes(teamKey)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if a set of teams matches the full filter (domain and/or team).
 * @param teams - Set of team keys
 * @param filter - The current filter state
 */
export function teamsMatchFullFilter(
  teams: Set<string>,
  filter: FilterState
): boolean {
  // If team filter is set, use that (more specific)
  if (filter.teamKey !== null) {
    return teams.has(filter.teamKey);
  }
  // Otherwise, use domain filter
  if (filter.domain !== null) {
    return teamsMatchDomainFilter(teams, filter.domain);
  }
  // No filter, match all
  return true;
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

import { writable, derived, get } from "svelte/store";
import { browser } from "$app/environment";
import type { Issue } from "../../db/schema";
import { getIssuesWithProjects } from "../queries";
import { initializeDomainMappings } from "../../utils/domain-mapping";
import { initializeTeamNameMappings } from "../../utils/team-name-mapping";
import {
  processProjects,
  groupProjectsByTeams,
  groupProjectsByDomains,
  projectToSummary,
  type ProjectSummary,
} from "../project-data";
import { getProjectById } from "../queries";
import type { Project } from "../../db/schema";
import { isAuthenticated } from "./auth";

interface DatabaseState {
  loading: boolean;
  error: string | null;
  issues: Issue[];
  lastSync: Date | null;
  configLoaded: boolean;
}

// Track if config loading is in progress to avoid duplicate calls
let configLoadPromise: Promise<boolean> | null = null;
// Track if config was successfully loaded (domain mappings initialized)
let configLoadedSuccessfully = false;

async function loadConfig(): Promise<boolean> {
  if (!browser) {
    return false;
  }

  // Return existing promise if already loading
  if (configLoadPromise) {
    return configLoadPromise;
  }

  configLoadPromise = (async () => {
    try {
      const response = await fetch("/api/config");
      if (response.ok) {
        const config = await response.json();
        if (config.teamDomainMappings) {
          console.log(
            "[loadConfig] Initializing domain mappings:",
            Object.keys(config.teamDomainMappings).length,
            "teams"
          );
          initializeDomainMappings(config.teamDomainMappings);
        } else {
          console.warn("[loadConfig] No teamDomainMappings in config");
        }
        if (config.teamNameMappings) {
          console.log(
            "[loadConfig] Initializing team name mappings:",
            Object.keys(config.teamNameMappings).length,
            "teams"
          );
          initializeTeamNameMappings(config.teamNameMappings);
        } else {
          console.warn("[loadConfig] No teamNameMappings in config");
        }
        configLoadedSuccessfully = true;
        return true;
      } else {
        console.error(
          "[loadConfig] Config API returned status:",
          response.status
        );
        // Reset promise on auth failure so we can retry
        if (response.status === 401) {
          configLoadPromise = null;
        }
        return false;
      }
    } catch (error) {
      console.error("[loadConfig] Failed to load config:", error);
      // Reset promise on error so we can retry
      configLoadPromise = null;
      return false;
    }
  })();

  return configLoadPromise;
}

// Eagerly load config when module is first imported in browser
// This ensures domain mappings are available before any projects are processed
if (browser) {
  loadConfig();
}

function createDatabaseStore() {
  const { subscribe, set, update } = writable<DatabaseState>({
    loading: false,
    error: null,
    issues: [],
    lastSync: null,
    configLoaded: false,
  });

  return {
    subscribe,
    async load() {
      update((state) => ({ ...state, loading: true, error: null }));

      try {
        // Load config (domain mappings) first
        // Always try to load if not yet successful (handles 401 retry after login)
        if (!configLoadedSuccessfully) {
          await loadConfig();
        }

        // Then load issues
        const issues = await getIssuesWithProjects();
        update((state) => ({
          ...state,
          loading: false,
          issues,
          lastSync: new Date(),
        }));
      } catch (error) {
        console.error("[databaseStore] Load error:", error);
        update((state) => ({
          ...state,
          loading: false,
          error: error instanceof Error ? error.message : "Failed to load data",
        }));
      }
    },
    reset() {
      set({
        loading: false,
        error: null,
        issues: [],
        lastSync: null,
        configLoaded: false,
      });
    },
    async refreshProject(projectId: string) {
      if (!browser) return;
      try {
        const project = await getProjectById(projectId);
        if (!project) {
          return;
        }
        // Convert Project to ProjectSummary
        const projectSummary = projectToSummary(project as Project);
        // Update projectsStore with just this project (preserving others)
        projectsStore.update((projects) => {
          const updated = new Map(projects);
          updated.set(projectId, projectSummary);
          return updated;
        });
      } catch (error) {
        console.error(
          `[databaseStore] Error refreshing project ${projectId}:`,
          error
        );
      }
    },
  };
}

export const databaseStore = createDatabaseStore();

// Derived stores for processed data
export const projectsStore = writable<Map<string, ProjectSummary>>(new Map());

// Load projects when database store loads
databaseStore.subscribe(async ($db) => {
  if (!browser || $db.error) {
    if ($db.error) {
      console.log(
        "[projectsStore] Skipping due to error - browser:",
        browser,
        "error:",
        $db.error
      );
      // Only clear on error, not during loading
      projectsStore.set(new Map<string, ProjectSummary>());
    }
    return;
  }
  // Skip if still loading - keep existing projects to avoid closing modals
  if ($db.loading) {
    return;
  }

  // Wait for config to be loaded before processing projects
  // This ensures domain mappings are available
  // If config previously failed (e.g., 401), try again now that we might be authenticated
  if (!configLoadedSuccessfully) {
    await loadConfig();
  } else if (configLoadPromise) {
    await configLoadPromise;
  }

  try {
    const projects = await processProjects();
    projectsStore.set(projects);
  } catch (error) {
    console.error("[projectsStore] Error loading projects:", error);
    projectsStore.set(new Map<string, ProjectSummary>());
  }
});

export const teamsStore = derived(
  [databaseStore, projectsStore],
  ([$db, $projects]) => {
    if (!browser || $db.error || $projects.size === 0) {
      return [];
    }
    // Continue computing teams during loading to keep modals open
    // (will use existing projects and issues temporarily)
    return groupProjectsByTeams($projects, $db.issues);
  }
);

export const domainsStore = derived(teamsStore, ($teams) => {
  if (!browser) return [];
  return groupProjectsByDomains($teams);
});

// Retry configuration for loading teams when authenticated but teams are missing
const TEAM_RETRY_INTERVAL_MS = 2000; // Check every 2 seconds
const TEAM_RETRY_MAX_ATTEMPTS = 10; // Give up after 10 attempts (20 seconds)
let teamRetryAttempts = 0;
let teamRetryIntervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Ensures teams are loaded when authenticated.
 * Called when auth state changes or periodically if teams are missing.
 */
async function ensureTeamsLoaded(): Promise<void> {
  if (!browser) return;

  const authenticated = get(isAuthenticated);
  const currentDomains = get(domainsStore);

  // If not authenticated or teams are already loaded, nothing to do
  if (!authenticated) {
    stopTeamRetry();
    return;
  }

  if (currentDomains.length > 0) {
    stopTeamRetry();
    teamRetryAttempts = 0;
    return;
  }

  // Teams are missing but we're authenticated - try to load
  console.log(
    "[ensureTeamsLoaded] Authenticated but teams missing, loading data...",
    { attempt: teamRetryAttempts + 1 }
  );

  // Reset config load promise to force a fresh fetch
  configLoadPromise = null;
  configLoadedSuccessfully = false;

  await databaseStore.load();
}

function stopTeamRetry(): void {
  if (teamRetryIntervalId !== null) {
    clearInterval(teamRetryIntervalId);
    teamRetryIntervalId = null;
  }
}

function startTeamRetry(): void {
  if (teamRetryIntervalId !== null) return; // Already running

  teamRetryAttempts = 0;
  teamRetryIntervalId = setInterval(() => {
    teamRetryAttempts++;

    if (teamRetryAttempts >= TEAM_RETRY_MAX_ATTEMPTS) {
      console.warn(
        "[ensureTeamsLoaded] Max retry attempts reached, stopping retry"
      );
      stopTeamRetry();
      return;
    }

    ensureTeamsLoaded();
  }, TEAM_RETRY_INTERVAL_MS);
}

// Subscribe to auth changes to trigger team loading
if (browser) {
  isAuthenticated.subscribe((authenticated) => {
    if (authenticated) {
      // When becoming authenticated, immediately try to load teams
      ensureTeamsLoaded().then(() => {
        // If teams still not loaded after first attempt, start retry interval
        const currentDomains = get(domainsStore);
        if (currentDomains.length === 0) {
          startTeamRetry();
        }
      });
    } else {
      // When logging out, stop any retry and reset
      stopTeamRetry();
      teamRetryAttempts = 0;
    }
  });
}

/**
 * Manually trigger a check and load of teams if missing.
 * Useful for components that need to ensure teams are loaded.
 */
export function ensureTeamsLoadedIfAuthenticated(): void {
  if (browser) {
    ensureTeamsLoaded();
  }
}

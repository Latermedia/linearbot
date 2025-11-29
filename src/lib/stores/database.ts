import { writable, derived } from "svelte/store";
import { browser } from "$app/environment";
import type { Issue } from "../../db/schema";
import { getIssuesWithProjects } from "../queries";
import {
  initializeDomainMappings,
  getAllDomains,
} from "../../utils/domain-mapping";
import {
  processProjects,
  groupProjectsByTeams,
  groupProjectsByDomains,
  projectToSummary,
  type ProjectSummary,
} from "../project-data";
import { getProjectById } from "../queries";
import type { Project } from "../../db/schema";

interface DatabaseState {
  loading: boolean;
  error: string | null;
  issues: Issue[];
  lastSync: Date | null;
}

async function loadConfig() {
  if (!browser) return;

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
        const domains = getAllDomains();
        console.log("[loadConfig] Available domains:", domains);
      } else {
        console.warn("[loadConfig] No teamDomainMappings in config");
      }
    } else {
      console.error(
        "[loadConfig] Config API returned status:",
        response.status
      );
    }
  } catch (error) {
    console.error("[loadConfig] Failed to load config:", error);
  }
}

function createDatabaseStore() {
  const { subscribe, set, update } = writable<DatabaseState>({
    loading: false,
    error: null,
    issues: [],
    lastSync: null,
  });

  return {
    subscribe,
    async load() {
      update((state) => ({ ...state, loading: true, error: null }));

      try {
        // Load config (domain mappings) first
        await loadConfig();

        // Then load issues
        console.log("[databaseStore] Loading issues...");
        const issues = await getIssuesWithProjects();
        console.log("[databaseStore] Loaded issues count:", issues.length);
        console.log(
          "[databaseStore] Sample issues:",
          issues.slice(0, 3).map((i) => ({
            id: i.id,
            project_id: i.project_id,
            team_key: i.team_key,
          }))
        );
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
      });
    },
    async refreshProject(projectId: string) {
      if (!browser) return;
      try {
        console.log(`[databaseStore] Refreshing project: ${projectId}`);
        const project = await getProjectById(projectId);
        if (!project) {
          console.warn(`[databaseStore] Project ${projectId} not found`);
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
        console.log(`[databaseStore] Refreshed project: ${projectId}`);
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
  console.log("[projectsStore] Loading projects from database...");
  try {
    const projects = await processProjects();
    console.log("[projectsStore] Loaded projects count:", projects.size);
    console.log(
      "[projectsStore] Sample project IDs:",
      Array.from(projects.keys()).slice(0, 5)
    );
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
      if ($db.error) {
        console.log(
          "[teamsStore] Skipping due to error - browser:",
          browser,
          "error:",
          $db.error,
          "projects:",
          $projects.size
        );
      }
      return [];
    }
    // Continue computing teams during loading to keep modals open
    // (will use existing projects and issues temporarily)
    console.log(
      "[teamsStore] Grouping",
      $projects.size,
      "projects into teams...",
      $db.loading ? "(loading)" : ""
    );
    const teams = groupProjectsByTeams($projects, $db.issues);
    console.log("[teamsStore] Grouped into", teams.length, "teams");
    console.log(
      "[teamsStore] Teams:",
      teams.map((t) => ({ name: t.teamName, projectCount: t.projects.length }))
    );
    return teams;
  }
);

export const domainsStore = derived(teamsStore, ($teams) => {
  if (!browser) return [];
  return groupProjectsByDomains($teams);
});

import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';
import type { Issue } from '../../db/schema';
import { getIssuesWithProjects } from '../queries';
import { initializeDomainMappings } from '../../utils/domain-mapping';
import {
	processProjects,
	groupProjectsByTeams,
	groupProjectsByDomains,
	type ProjectSummary,
	type TeamSummary,
	type DomainSummary
} from '../project-data';

interface DatabaseState {
	loading: boolean;
	error: string | null;
	issues: Issue[];
	lastSync: Date | null;
}

async function loadConfig() {
	if (!browser) return;

	try {
		const response = await fetch('/api/config');
		if (response.ok) {
			const config = await response.json();
			if (config.teamDomainMappings) {
				console.log('[loadConfig] Initializing domain mappings:', Object.keys(config.teamDomainMappings).length, 'teams');
				initializeDomainMappings(config.teamDomainMappings);
				const { getAllDomains } = await import('../../utils/domain-mapping');
				const domains = getAllDomains();
				console.log('[loadConfig] Available domains:', domains);
			} else {
				console.warn('[loadConfig] No teamDomainMappings in config');
			}
		} else {
			console.error('[loadConfig] Config API returned status:', response.status);
		}
	} catch (error) {
		console.error('[loadConfig] Failed to load config:', error);
	}
}

function createDatabaseStore() {
	const { subscribe, set, update } = writable<DatabaseState>({
		loading: false,
		error: null,
		issues: [],
		lastSync: null
	});

	return {
		subscribe,
		async load() {
			update((state) => ({ ...state, loading: true, error: null }));

			try {
				// Load config (domain mappings) first
				await loadConfig();

				// Then load issues
				console.log('[databaseStore] Loading issues...');
				const issues = await getIssuesWithProjects();
				console.log('[databaseStore] Loaded issues count:', issues.length);
				console.log('[databaseStore] Sample issues:', issues.slice(0, 3).map(i => ({
					id: i.id,
					project_id: i.project_id,
					team_key: i.team_key
				})));
				update((state) => ({
					...state,
					loading: false,
					issues,
					lastSync: new Date()
				}));
			} catch (error) {
				console.error('[databaseStore] Load error:', error);
				update((state) => ({
					...state,
					loading: false,
					error: error instanceof Error ? error.message : 'Failed to load data'
				}));
			}
		},
		reset() {
			set({
				loading: false,
				error: null,
				issues: [],
				lastSync: null
			});
		}
	};
}

export const databaseStore = createDatabaseStore();

// Derived stores for processed data
export const projectsStore = derived(databaseStore, ($db) => {
	if (!browser || $db.loading || $db.error) {
		console.log('[projectsStore] Skipping - browser:', browser, 'loading:', $db.loading, 'error:', $db.error);
		return new Map<string, ProjectSummary>();
	}
	console.log('[projectsStore] Processing', $db.issues.length, 'issues into projects...');
	const projects = processProjects($db.issues);
	console.log('[projectsStore] Processed projects count:', projects.size);
	console.log('[projectsStore] Sample project IDs:', Array.from(projects.keys()).slice(0, 5));
	return projects;
});

export const teamsStore = derived([databaseStore, projectsStore], ([$db, $projects]) => {
	if (!browser || $db.loading || $db.error) {
		console.log('[teamsStore] Skipping - browser:', browser, 'loading:', $db.loading, 'error:', $db.error);
		return [];
	}
	console.log('[teamsStore] Grouping', $projects.size, 'projects into teams...');
	const teams = groupProjectsByTeams($projects, $db.issues);
	console.log('[teamsStore] Grouped into', teams.length, 'teams');
	console.log('[teamsStore] Teams:', teams.map(t => ({ name: t.teamName, projectCount: t.projects.length })));
	return teams;
});

export const domainsStore = derived(teamsStore, ($teams) => {
	if (!browser) return [];
	return groupProjectsByDomains($teams);
});


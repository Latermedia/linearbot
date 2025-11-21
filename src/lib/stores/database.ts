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
				initializeDomainMappings(config.teamDomainMappings);
			}
		}
	} catch (error) {
		console.warn('Failed to load config:', error);
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
				const issues = await getIssuesWithProjects();
				update((state) => ({
					...state,
					loading: false,
					issues,
					lastSync: new Date()
				}));
			} catch (error) {
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
	if (!browser) return new Map<string, ProjectSummary>();
	if ($db.loading || $db.error) return new Map<string, ProjectSummary>();
	return processProjects($db.issues);
});

export const teamsStore = derived([databaseStore, projectsStore], ([$db, $projects]) => {
	if (!browser) return [];
	if ($db.loading || $db.error) return [];
	return groupProjectsByTeams($projects, $db.issues);
});

export const domainsStore = derived(teamsStore, ($teams) => {
	if (!browser) return [];
	return groupProjectsByDomains($teams);
});


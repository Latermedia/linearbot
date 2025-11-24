import type { Issue, Project } from '../db/schema';
import { getAllProjects } from './queries';
import { getDomainForTeam, getAllDomains } from '../utils/domain-mapping';

export interface ProjectSummary {
	projectId: string;
	projectName: string;
	projectState: string | null;
	projectHealth: string | null;
	projectUpdatedAt: string | null;
	totalIssues: number;
	issuesByState: Map<string, number>;
	engineerCount: number;
	engineers: Set<string>;
	hasStatusMismatch: boolean;
	isStaleUpdate: boolean;
	lastActivityDate: string;
	teams: Set<string>;
	projectLeadName: string | null;
	missingLead: boolean;
	completedIssues: number;
	inProgressIssues: number;
	startDate: string | null;
	estimatedEndDate: string | null;
	hasViolations: boolean;
	missingHealth: boolean;
	missingEstimateCount: number;
	missingPriorityCount: number;
	noRecentCommentCount: number;
	wipAgeViolationCount: number;
	missingDescriptionCount: number;
	// Computed metrics from sync
	totalPoints: number;
	missingPoints: number;
	averageCycleTime: number | null;
	averageLeadTime: number | null;
	linearProgress: number | null;
	velocity: number;
	estimateAccuracy: number | null;
	daysPerStoryPoint: number | null;
	velocityByTeam: Map<string, number>;
}

export interface TeamSummary {
	teamId: string;
	teamName: string;
	teamKey: string;
	projects: ProjectSummary[];
	domain: string | null;
}

export interface DomainSummary {
	domainName: string;
	teams: TeamSummary[];
	projects: ProjectSummary[];
}


/**
 * Convert Project database record to ProjectSummary
 */
function projectToSummary(project: Project): ProjectSummary {
	// Parse JSON fields back to Maps/Sets
	const issuesByState = new Map<string, number>(
		Object.entries(JSON.parse(project.issues_by_state))
	);
	const engineers = new Set<string>(JSON.parse(project.engineers));
	const teams = new Set<string>(JSON.parse(project.teams));
	const velocityByTeam = new Map<string, number>(
		Object.entries(JSON.parse(project.velocity_by_team))
	);

	return {
		projectId: project.project_id,
		projectName: project.project_name,
		projectState: project.project_state,
		projectHealth: project.project_health,
		projectUpdatedAt: project.project_updated_at,
		totalIssues: project.total_issues,
		issuesByState,
		engineerCount: project.engineer_count,
		engineers,
		hasStatusMismatch: project.has_status_mismatch === 1,
		isStaleUpdate: project.is_stale_update === 1,
		lastActivityDate: project.last_activity_date,
		teams,
		projectLeadName: project.project_lead_name,
		missingLead: project.missing_lead === 1,
		completedIssues: project.completed_issues,
		inProgressIssues: project.in_progress_issues,
		startDate: project.start_date,
		estimatedEndDate: project.estimated_end_date,
		hasViolations: project.has_violations === 1,
		missingHealth: project.missing_health === 1,
		missingEstimateCount: project.missing_estimate_count,
		missingPriorityCount: project.missing_priority_count,
		noRecentCommentCount: project.no_recent_comment_count,
		wipAgeViolationCount: project.wip_age_violation_count,
		missingDescriptionCount: project.missing_description_count,
		// Computed metrics
		totalPoints: project.total_points,
		missingPoints: project.missing_points,
		averageCycleTime: project.average_cycle_time,
		averageLeadTime: project.average_lead_time,
		linearProgress: project.linear_progress,
		velocity: project.velocity,
		estimateAccuracy: project.estimate_accuracy,
		daysPerStoryPoint: project.days_per_story_point,
		velocityByTeam,
	};
}

/**
 * Load projects from database and convert to ProjectSummary map
 */
export async function processProjects(_issues?: Issue[]): Promise<Map<string, ProjectSummary>> {
	// Load projects from database (issues parameter kept for compatibility but not used)
	const dbProjects = await getAllProjects();
	const projects = new Map<string, ProjectSummary>();

	for (const project of dbProjects) {
		projects.set(project.project_id, projectToSummary(project));
	}

	return projects;
}

/**
 * Group projects by teams
 */
export function groupProjectsByTeams(
	projects: Map<string, ProjectSummary>,
	issues: Issue[]
): TeamSummary[] {
	const teamMap = new Map<string, { projects: ProjectSummary[]; teamInfo: any }>();

	for (const project of projects.values()) {
		const projectIssues = issues.filter((i) => i.project_id === project.projectId);

		// Get all unique teams in this project
		const teamsInProject = new Set(projectIssues.map((i) => i.team_key));

		for (const teamKey of teamsInProject) {
			if (!teamMap.has(teamKey)) {
				// Find team info from any issue
				const teamIssue = projectIssues.find((i) => i.team_key === teamKey);
				teamMap.set(teamKey, {
					projects: [],
					teamInfo: {
						teamId: teamIssue?.team_id || teamKey,
						teamName: teamIssue?.team_name || teamKey,
						teamKey
					}
				});
			}
			teamMap.get(teamKey)?.projects.push(project);
		}
	}

	const teams: TeamSummary[] = [];
	for (const [teamKey, { projects, teamInfo }] of teamMap) {
		const domain = getDomainForTeam(teamKey);
		
		// Deduplicate projects by projectId (shouldn't be necessary but ensures correctness)
		const uniqueProjects: ProjectSummary[] = [];
		const seenProjectIds = new Set<string>();
		for (const project of projects) {
			if (!seenProjectIds.has(project.projectId)) {
				uniqueProjects.push(project);
				seenProjectIds.add(project.projectId);
			}
		}
		
		if (teamInfo.teamName === "Creator Applications" || teamKey === "APP") {
			console.log('[groupProjectsByTeams] Team mapping:', {
				teamKey,
				teamName: teamInfo.teamName,
				domain,
				projectsCount: uniqueProjects.length,
				hadDuplicates: projects.length !== uniqueProjects.length
			});
		}
		
		teams.push({
			teamId: teamInfo.teamId,
			teamName: teamInfo.teamName,
			teamKey: teamInfo.teamKey,
			projects: uniqueProjects,
			domain
		});
	}

	return teams.sort((a, b) => a.teamName.localeCompare(b.teamName));
}

/**
 * Group projects by domains
 */
export function groupProjectsByDomains(teams: TeamSummary[]): DomainSummary[] {
	const domainMap = new Map<string, DomainSummary>();
	const allDomains = getAllDomains();
	
	console.log('[groupProjectsByDomains] All domains from mapping:', allDomains);
	console.log('[groupProjectsByDomains] Teams with domains:', teams.map(t => ({ team: t.teamName, teamKey: t.teamKey, domain: t.domain })));

	// Initialize all domains from the mapping
	for (const domainName of allDomains) {
		domainMap.set(domainName, {
			domainName,
			teams: [],
			projects: []
		});
	}

	// Add "Unmapped" domain for teams without a domain
	domainMap.set('Unmapped', {
		domainName: 'Unmapped',
		teams: [],
		projects: []
	});

	// Group teams by domain - all teams in a domain get their projects added to that domain
	// Track project IDs per domain for efficient deduplication
	const domainProjectIds = new Map<string, Set<string>>();
	for (const domainName of domainMap.keys()) {
		domainProjectIds.set(domainName, new Set());
	}
	
	for (const team of teams) {
		const domainName = team.domain || 'Unmapped';
		const domain = domainMap.get(domainName);

		if (!domain) {
			// This shouldn't happen, but if a domain doesn't exist, skip it
			console.warn('[groupProjectsByDomains] Domain not found:', domainName, 'for team:', team.teamName);
			continue;
		}

		domain.teams.push(team);
		// Add projects, deduplicating by projectId
		const projectIdSet = domainProjectIds.get(domainName)!;
		for (const project of team.projects) {
			if (!projectIdSet.has(project.projectId)) {
				domain.projects.push(project);
				projectIdSet.add(project.projectId);
			}
		}
	}

	// Remove empty domains - only return domains that have teams
	const domains = Array.from(domainMap.values()).filter((d) => d.teams.length > 0);
	
	// Verify deduplication worked correctly
	for (const domain of domains) {
		const uniqueProjectIds = new Set(domain.projects.map(p => p.projectId));
		if (uniqueProjectIds.size !== domain.projects.length) {
			console.warn(`[groupProjectsByDomains] Domain "${domain.domainName}" has duplicate projects! Unique: ${uniqueProjectIds.size}, Total: ${domain.projects.length}`);
		}
	}
	
	console.log('[groupProjectsByDomains] Final domains:', domains.map(d => ({ 
		domain: d.domainName, 
		teams: d.teams.length, 
		projects: d.projects.length,
		uniqueProjects: new Set(d.projects.map(p => p.projectId)).size
	})));

	return domains.sort((a, b) => {
		// Put "Unmapped" at the end
		if (a.domainName === 'Unmapped') return 1;
		if (b.domainName === 'Unmapped') return -1;
		return a.domainName.localeCompare(b.domainName);
	});
}


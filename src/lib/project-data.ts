import type { Issue } from '../db/schema';
import {
	isProjectActive,
	hasStatusMismatch,
	isStaleUpdate,
	isMissingLead
} from '../utils/status-helpers';
import { getDomainForTeam, getAllDomains } from '../utils/domain-mapping';
import {
	hasViolations,
	hasMissingEstimate,
	hasMissingPriority,
	hasNoRecentComment,
	hasWIPAgeViolation,
	hasMissingDescription
} from '../utils/issue-validators';

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
 * Calculate project velocity (issues completed per day)
 */
function calculateVelocity(project: ProjectSummary, startDate: Date): number {
	if (project.completedIssues === 0) return 0;

	const now = new Date();
	const daysElapsed = Math.max(
		1,
		(now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
	);

	return project.completedIssues / daysElapsed;
}

/**
 * Estimate project completion date based on velocity
 * Returns date rounded up to end of nearest month
 */
function estimateCompletionDate(project: ProjectSummary, startDate: Date): Date | null {
	const velocity = calculateVelocity(project, startDate);

	if (velocity === 0) {
		// No velocity data, assume 6 months from now as default
		const estimated = new Date();
		estimated.setMonth(estimated.getMonth() + 6);
		return roundUpToMonthEnd(estimated);
	}

	const remainingIssues = project.totalIssues - project.completedIssues;
	const daysToComplete = remainingIssues / velocity;

	const estimatedDate = new Date();
	estimatedDate.setDate(estimatedDate.getDate() + daysToComplete);

	// Round up to end of month, leaning toward furthest date
	return roundUpToMonthEnd(estimatedDate);
}

/**
 * Round date up to the end of the nearest month
 */
function roundUpToMonthEnd(date: Date): Date {
	const rounded = new Date(date);
	// Set to last day of the month
	rounded.setMonth(rounded.getMonth() + 1, 0);
	rounded.setHours(23, 59, 59, 999);
	return rounded;
}

/**
 * Process issues into project summaries
 */
export function processProjects(issues: Issue[]): Map<string, ProjectSummary> {
	const projectGroups = new Map<string, Issue[]>();

	// Group issues by project
	for (const issue of issues) {
		if (!issue.project_id) continue;
		if (!projectGroups.has(issue.project_id)) {
			projectGroups.set(issue.project_id, []);
		}
		projectGroups.get(issue.project_id)?.push(issue);
	}

	const projects = new Map<string, ProjectSummary>();

	for (const [projectId, projectIssues] of projectGroups) {
		// Only include active projects
		if (!isProjectActive(projectIssues)) continue;

		const firstIssue = projectIssues[0];
		const issuesByState = new Map<string, number>();
		const engineers = new Set<string>();
		const teams = new Set<string>();

		let lastActivityDate = firstIssue.updated_at;
		let earliestCreatedAt = firstIssue.created_at;
		let completedCount = 0;
		let inProgressCount = 0;

		for (const issue of projectIssues) {
			// Track issue states
			const stateName = issue.state_name;
			issuesByState.set(stateName, (issuesByState.get(stateName) || 0) + 1);

			// Count completed and in-progress
			if (stateName.toLowerCase().includes('done') || stateName.toLowerCase().includes('completed')) {
				completedCount++;
			}
			if (stateName.toLowerCase() === 'in progress' || issue.state_type === 'started') {
				inProgressCount++;
			}

			// Track engineers
			if (issue.assignee_name) {
				engineers.add(issue.assignee_name);
			}

			// Track teams
			teams.add(issue.team_key);

			// Track latest activity
			if (new Date(issue.updated_at) > new Date(lastActivityDate)) {
				lastActivityDate = issue.updated_at;
			}

			// Track earliest creation
			if (new Date(issue.created_at) < new Date(earliestCreatedAt)) {
				earliestCreatedAt = issue.created_at;
			}
		}

		// Calculate violation counts
		let missingEstimateCount = 0;
		let missingPriorityCount = 0;
		let noRecentCommentCount = 0;
		let wipAgeViolationCount = 0;
		let missingDescriptionCount = 0;

		for (const issue of projectIssues) {
			if (hasMissingEstimate(issue)) missingEstimateCount++;
			if (hasMissingPriority(issue)) missingPriorityCount++;
			if (hasNoRecentComment(issue)) noRecentCommentCount++;
			if (hasWIPAgeViolation(issue)) wipAgeViolationCount++;
			if (hasMissingDescription(issue)) missingDescriptionCount++;
		}

		const projectSummary: ProjectSummary = {
			projectId,
			projectName: firstIssue.project_name || 'Unknown Project',
			projectState: firstIssue.project_state,
			projectHealth: firstIssue.project_health,
			projectUpdatedAt: firstIssue.project_updated_at,
			totalIssues: projectIssues.length,
			issuesByState,
			engineerCount: engineers.size,
			engineers,
			hasStatusMismatch: false,
			isStaleUpdate: false,
			lastActivityDate,
			teams,
			projectLeadName: firstIssue.project_lead_name,
			missingLead: false,
			completedIssues: completedCount,
			inProgressIssues: inProgressCount,
			startDate: earliestCreatedAt,
			estimatedEndDate: null,
			hasViolations: false,
			missingHealth: !firstIssue.project_health,
			missingEstimateCount,
			missingPriorityCount,
			noRecentCommentCount,
			wipAgeViolationCount,
			missingDescriptionCount
		};

		// Calculate flags
		projectSummary.hasStatusMismatch = hasStatusMismatch(projectSummary.projectState, projectIssues);
		projectSummary.isStaleUpdate = isStaleUpdate(projectSummary.lastActivityDate);
		projectSummary.missingLead = isMissingLead(
			projectSummary.projectState,
			projectSummary.projectLeadName,
			projectIssues
		);
		projectSummary.hasViolations = hasViolations(projectIssues);

		// Estimate completion date
		if (earliestCreatedAt) {
			projectSummary.estimatedEndDate = estimateCompletionDate(
				projectSummary,
				new Date(earliestCreatedAt)
			)?.toISOString() || null;
		}

		projects.set(projectId, projectSummary);
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


import type { Issue } from '../db/schema';
import {
	isProjectActive,
	hasStatusMismatch,
	isStaleUpdate,
	isMissingLead
} from '../utils/status-helpers';
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
			estimatedEndDate: null
		};

		// Calculate flags
		projectSummary.hasStatusMismatch = hasStatusMismatch(projectSummary.projectState, projectIssues);
		projectSummary.isStaleUpdate = isStaleUpdate(projectSummary.lastActivityDate);
		projectSummary.missingLead = isMissingLead(
			projectSummary.projectState,
			projectSummary.projectLeadName,
			projectIssues
		);

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
		teams.push({
			teamId: teamInfo.teamId,
			teamName: teamInfo.teamName,
			teamKey: teamInfo.teamKey,
			projects,
			domain: getDomainForTeam(teamKey)
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

	// Initialize all domains
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

	// Group teams by domain
	for (const team of teams) {
		const domainName = team.domain || 'Unmapped';
		const domain = domainMap.get(domainName);

		if (domain) {
			domain.teams.push(team);
			domain.projects.push(...team.projects);
		}
	}

	// Remove empty domains
	const domains = Array.from(domainMap.values()).filter((d) => d.teams.length > 0);

	return domains.sort((a, b) => {
		// Put "Unmapped" at the end
		if (a.domainName === 'Unmapped') return 1;
		if (b.domainName === 'Unmapped') return -1;
		return a.domainName.localeCompare(b.domainName);
	});
}


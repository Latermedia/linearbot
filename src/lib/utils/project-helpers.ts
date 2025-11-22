import type { ProjectSummary } from '../project-data';

/**
 * Format date as "MMM YYYY" (e.g., "Jan 2024")
 */
export function formatDate(dateStr: string | null): string {
	if (!dateStr) return "N/A";
	const date = new Date(dateStr);
	return date.toLocaleDateString("en-US", {
		month: "short",
		year: "numeric",
	});
}

/**
 * Format date as "MMM D, YYYY" (e.g., "Jan 15, 2024")
 */
export function formatDateFull(date: Date | string | null): string {
	if (!date) return "N/A";
	const d = typeof date === "string" ? new Date(date) : date;
	return d.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

/**
 * Format date as relative time (e.g., "Today", "2d ago", "3w ago")
 */
export function formatRelativeDate(dateStr: string | null): string {
	if (!dateStr) return "N/A";
	const date = new Date(dateStr);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

	if (diffDays === 0) return "Today";
	if (diffDays === 1) return "Yesterday";
	if (diffDays < 7) return `${diffDays}d ago`;
	if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
	if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
	return `${Math.floor(diffDays / 365)}y ago`;
}

/**
 * Calculate progress percentage (rounded)
 */
export function getProgressPercent(project: ProjectSummary): number {
	if (!project.totalIssues || project.totalIssues === 0) return 0;
	return Math.round((project.completedIssues / project.totalIssues) * 100);
}

/**
 * Calculate completed percentage (decimal)
 */
export function getCompletedPercent(project: ProjectSummary): number {
	if (!project.totalIssues || project.totalIssues === 0) return 0;
	return (project.completedIssues / project.totalIssues) * 100;
}

/**
 * Calculate WIP (work in progress) percentage
 */
export function getWIPPercent(project: ProjectSummary): number {
	if (!project.totalIssues || project.totalIssues === 0) return 0;
	return (project.inProgressIssues / project.totalIssues) * 100;
}

/**
 * Check if project has health issues (status mismatch, stale update, or missing lead)
 */
export function hasHealthIssues(project: ProjectSummary): boolean {
	return (
		project.hasStatusMismatch || project.isStaleUpdate || project.missingLead
	);
}

/**
 * Alias for hasHealthIssues (used in GanttChart as hasDiscrepancies)
 */
export const hasDiscrepancies = hasHealthIssues;

/**
 * Get backlog count (issues in backlog/todo/unstarted states)
 */
export function getBacklogCount(project: ProjectSummary): number {
	const backlogStates = ["backlog", "todo", "unstarted"];
	let count = 0;
	for (const [state, stateCount] of project.issuesByState) {
		if (backlogStates.includes(state.toLowerCase())) {
			count += stateCount;
		}
	}
	return count;
}

/**
 * Get health display configuration for badges
 */
export function getHealthDisplay(health: string | null): {
	text: string;
	variant: "default" | "destructive" | "secondary" | "outline";
	colorClass: string;
} {
	if (!health) {
		return { text: "—", variant: "outline", colorClass: "" };
	}

	const healthLower = health.toLowerCase();
	if (healthLower === "ontrack" || healthLower === "on track") {
		return {
			text: "On Track",
			variant: "default",
			colorClass: "!text-green-600 dark:!text-green-500",
		};
	}
	if (healthLower === "atrisk" || healthLower === "at risk") {
		return {
			text: "At Risk",
			variant: "default",
			colorClass: "!text-amber-600 dark:!text-amber-500",
		};
	}
	if (healthLower === "offtrack" || healthLower === "off track") {
		return { text: "Off Track", variant: "destructive", colorClass: "" };
	}

	// Fallback for any other values
	return { text: health, variant: "outline", colorClass: "" };
}


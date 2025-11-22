<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { Card } from '$lib/components/ui/card';
	import type { ProjectSummary, TeamSummary, DomainSummary } from '../project-data';

	let { 
		teams = [],
		domains = [],
		groupBy = 'team' as 'team' | 'domain'
	}: {
		teams?: TeamSummary[];
		domains?: DomainSummary[];
		groupBy?: 'team' | 'domain';
	} = $props();

	function getProgressPercent(project: ProjectSummary): number {
		if (!project.totalIssues || project.totalIssues === 0) return 0;
		return Math.round((project.completedIssues / project.totalIssues) * 100);
	}

	function getStatusBadge(project: ProjectSummary) {
		if (project.hasStatusMismatch) {
			return { text: 'Status Mismatch', variant: 'destructive' as const };
		}
		if (project.isStaleUpdate) {
			return { text: 'Stale (7+ days)', variant: 'destructive' as const };
		}
		if (project.missingLead) {
			return { text: 'Missing Lead', variant: 'secondary' as const };
		}
		const progress = getProgressPercent(project);
		if (!isNaN(progress) && progress >= 70) {
			return { text: 'Near Completion', variant: 'default' as const };
		}
		return { text: 'On Track', variant: 'outline' as const };
	}

	function formatDate(dateStr: string | null): string {
		if (!dateStr) return 'N/A';
		const date = new Date(dateStr);
		return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
	}
</script>

<div class="space-y-8">
	{#if groupBy === 'team'}
		{#each teams as team}
			<Card class="p-6">
				<div class="mb-4 flex items-center justify-between">
					<h3 class="text-xl font-semibold">{team.teamName}</h3>
					<Badge variant="outline">{team.projects.length} projects</Badge>
				</div>

				<div class="overflow-x-auto">
					<table class="w-full">
						<thead>
							<tr class="border-b border-border">
								<th class="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Project</th>
								<th class="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Progress</th>
								<th class="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Status</th>
								<th class="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Engineers</th>
								<th class="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Issues</th>
								<th class="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Est. Complete</th>
							</tr>
						</thead>
						<tbody>
							{#each team.projects as project}
								{@const progress = getProgressPercent(project)}
								{@const status = getStatusBadge(project)}
								<tr class="border-b border-border hover:bg-muted/50 transition-colors">
									<td class="py-3 px-2">
										<div class="font-medium">{project.projectName || 'Unknown'}</div>
										{#if project.projectLeadName}
											<div class="text-sm text-muted-foreground">Lead: {project.projectLeadName}</div>
										{/if}
									</td>
									<td class="py-3 px-2">
										<div class="flex items-center gap-2">
											<div class="flex-1 h-2 bg-muted rounded-full overflow-hidden max-w-[100px]">
												<div
													class="h-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all"
													style={`width: ${progress}%`}
												></div>
											</div>
											<span class="text-sm font-medium">{progress}%</span>
										</div>
									</td>
									<td class="py-3 px-2">
										<Badge variant={status?.variant || 'default'}>{status?.text || 'Unknown'}</Badge>
									</td>
									<td class="py-3 px-2 text-sm">{project.engineerCount}</td>
									<td class="py-3 px-2">
										<div class="text-sm">
											<div>{project.completedIssues}/{project.totalIssues} done</div>
											<div class="text-muted-foreground">{project.inProgressIssues} in progress</div>
										</div>
									</td>
									<td class="py-3 px-2 text-sm">{formatDate(project.estimatedEndDate)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</Card>
		{/each}
	{:else}
		{#each domains as domain}
			<Card class="p-6">
				<div class="mb-4 flex items-center justify-between">
					<h3 class="text-xl font-semibold">{domain.domainName}</h3>
					<Badge variant="outline">{domain.projects.length} projects</Badge>
				</div>

				<div class="overflow-x-auto">
					<table class="w-full">
						<thead>
							<tr class="border-b border-border">
								<th class="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Project</th>
								<th class="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Progress</th>
								<th class="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Status</th>
								<th class="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Engineers</th>
								<th class="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Issues</th>
								<th class="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Est. Complete</th>
							</tr>
						</thead>
						<tbody>
							{#each domain.projects as project}
								{@const progress = getProgressPercent(project)}
								{@const status = getStatusBadge(project)}
								<tr class="border-b border-border hover:bg-muted/50 transition-colors">
									<td class="py-3 px-2">
										<div class="font-medium">{project.projectName || 'Unknown'}</div>
										{#if project.projectLeadName}
											<div class="text-sm text-muted-foreground">Lead: {project.projectLeadName}</div>
										{/if}
									</td>
									<td class="py-3 px-2">
										<div class="flex items-center gap-2">
											<div class="flex-1 h-2 bg-muted rounded-full overflow-hidden max-w-[100px]">
												<div
													class="h-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all"
													style={`width: ${progress}%`}
												></div>
											</div>
											<span class="text-sm font-medium">{progress}%</span>
										</div>
									</td>
									<td class="py-3 px-2">
										<Badge variant={status?.variant || 'default'}>{status?.text || 'Unknown'}</Badge>
									</td>
									<td class="py-3 px-2 text-sm">{project.engineerCount}</td>
									<td class="py-3 px-2">
										<div class="text-sm">
											<div>{project.completedIssues}/{project.totalIssues} done</div>
											<div class="text-muted-foreground">{project.inProgressIssues} in progress</div>
										</div>
									</td>
									<td class="py-3 px-2 text-sm">{formatDate(project.estimatedEndDate)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</Card>
		{/each}
	{/if}
</div>


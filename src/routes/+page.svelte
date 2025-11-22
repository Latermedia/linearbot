<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { databaseStore, teamsStore, domainsStore, projectsStore } from '$lib/stores/database';
	import ProjectsTable from '$lib/components/ProjectsTable.svelte';
	import RefreshButton from '$lib/components/RefreshButton.svelte';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import Card from '$lib/components/ui/card.svelte';
	import Skeleton from '$lib/components/ui/skeleton.svelte';
	import Separator from '$lib/components/ui/separator.svelte';

	let groupBy: 'team' | 'domain' = 'team';

	// Initialize with default values for SSR
	let loading = true;
	let error: string | null = null;
	let lastSync: Date | null = null;
	let teams: any[] = [];
	let domains: any[] = [];
	let projects: Map<string, any> = new Map();

	// Only load data in browser
	onMount(() => {
		if (browser) {
			databaseStore.load();
		}
	});

	// Subscribe to stores only in browser
	$: if (browser) {
		({ loading, error, lastSync } = $databaseStore);
		teams = $teamsStore;
		domains = $domainsStore;
		projects = $projectsStore;
	}
</script>

<div class="space-y-5">
	<!-- Header with controls -->
	<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
		<div>
			<h2 class="text-2xl font-semibold">Project Timeline</h2>
			<p class="text-muted-foreground text-sm mt-0.5">View active projects across teams and domains</p>
		</div>
		<RefreshButton {lastSync} />
	</div>

	<!-- Stats summary -->
	{#if !loading && !error && teams.length > 0}
		<div class="grid grid-cols-1 md:grid-cols-3 gap-3">
			<Card class="px-4 py-4">
				<div class="text-xs text-muted-foreground mb-0.5">Total Teams</div>
				<div class="text-2xl font-semibold">{teams.length}</div>
			</Card>
			<Card class="px-4 py-4">
				<div class="text-xs text-muted-foreground mb-0.5">Active Projects</div>
				<div class="text-2xl font-semibold">
					{projects.size}
				</div>
			</Card>
			<Card class="px-4 py-4">
				<div class="text-xs text-muted-foreground mb-0.5">Domains</div>
				<div class="text-2xl font-semibold">{domains.length}</div>
			</Card>
		</div>
	{/if}

	<Separator />

	<!-- Group by toggle -->
	<div class="flex items-center gap-3">
		<span class="text-sm font-medium">Group by:</span>
		<ToggleGroup.Root 
			bind:value={groupBy} 
			variant="outline" 
			type="single"
		>
			<ToggleGroup.Item value="team" aria-label="Group by teams">
				Teams
			</ToggleGroup.Item>
			<ToggleGroup.Item value="domain" aria-label="Group by domains">
				Domains
			</ToggleGroup.Item>
		</ToggleGroup.Root>
	</div>

	<!-- Main content -->
	{#if loading}
		<div class="space-y-4">
			<Card class="px-4 py-6">
				<Skeleton class="h-8 w-48 mb-4" />
				<div class="space-y-3">
					<Skeleton class="h-12 w-full" />
					<Skeleton class="h-12 w-full" />
					<Skeleton class="h-12 w-full" />
					<Skeleton class="h-12 w-full" />
				</div>
			</Card>
		</div>
	{:else if error}
		<Card class="px-4 py-4 border-destructive">
			<div class="font-semibold text-destructive mb-3">Error Loading Data</div>
			<p class="text-muted-foreground mb-3">{error}</p>
			<p class="text-sm text-muted-foreground">
				Make sure the database is synced. Run: <code class="bg-muted px-2 py-1 rounded font-mono"
					>bun run sync</code
				>
			</p>
		</Card>
	{:else if teams.length === 0}
		<Card class="px-4 py-4">
			<div class="font-semibold mb-3">No Projects Found</div>
			<p class="text-muted-foreground">
				No active projects with started issues. Sync your Linear data to see projects.
			</p>
		</Card>
	{:else}
		<ProjectsTable {teams} {domains} {groupBy} />
	{/if}
</div>


<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { databaseStore, teamsStore, domainsStore } from '$lib/stores/database';
	import ProjectsTable from '$lib/components/ProjectsTable.svelte';
	import RefreshButton from '$lib/components/RefreshButton.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Card } from '$lib/components/ui/card';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Separator } from '$lib/components/ui/separator';

	let groupBy: 'team' | 'domain' = 'team';

	// Initialize with default values for SSR
	let loading = true;
	let error: string | null = null;
	let lastSync: Date | null = null;
	let teams: any[] = [];
	let domains: any[] = [];

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
	}
</script>

<div class="space-y-6">
	<!-- Header with controls -->
	<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
		<div>
			<h2 class="text-3xl font-bold">Project Timeline</h2>
			<p class="text-muted-foreground mt-1">View active projects across teams and domains</p>
		</div>
		<RefreshButton {lastSync} />
	</div>

	<!-- Stats summary -->
	{#if !loading && !error && teams.length > 0}
		<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
			<Card class="p-6 border-border bg-card">
				<div class="text-sm text-muted-foreground mb-1">Total Teams</div>
				<div class="text-3xl font-bold">{teams.length}</div>
			</Card>
			<Card class="p-6 border-border bg-card">
				<div class="text-sm text-muted-foreground mb-1">Active Projects</div>
				<div class="text-3xl font-bold">
					{teams.reduce((sum, t) => sum + t.projects.length, 0)}
				</div>
			</Card>
			<Card class="p-6 border-border bg-card">
				<div class="text-sm text-muted-foreground mb-1">Domains</div>
				<div class="text-3xl font-bold">{domains.length}</div>
			</Card>
		</div>
	{/if}

	<Separator />

	<!-- Group by toggle -->
	<div class="flex items-center gap-3">
		<span class="text-sm font-medium">Group by:</span>
		<div class="inline-flex rounded-lg shadow-sm" role="group">
			<Button
				variant={groupBy === 'team' ? 'default' : 'outline'}
				size="sm"
				onclick={() => (groupBy = 'team')}
				class="rounded-r-none"
			>
				Teams
			</Button>
			<Button
				variant={groupBy === 'domain' ? 'default' : 'outline'}
				size="sm"
				onclick={() => (groupBy = 'domain')}
				class="rounded-l-none"
			>
				Domains
			</Button>
		</div>
	</div>

	<!-- Main content -->
	{#if loading}
		<div class="space-y-4">
			<Card class="p-6">
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
		<Card class="p-6 border-destructive">
			<h3 class="text-destructive font-semibold mb-2">Error Loading Data</h3>
			<p class="text-muted-foreground mb-3">{error}</p>
			<p class="text-sm text-muted-foreground">
				Make sure the database is synced. Run: <code class="bg-muted px-2 py-1 rounded font-mono"
					>bun run sync</code
				>
			</p>
		</Card>
	{:else if teams.length === 0}
		<Card class="p-6">
			<h3 class="font-semibold mb-2">No Projects Found</h3>
			<p class="text-muted-foreground">
				No active projects with started issues. Sync your Linear data to see projects.
			</p>
		</Card>
	{:else}
		<ProjectsTable {teams} {domains} {groupBy} />
	{/if}
</div>


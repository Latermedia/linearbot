<script lang="ts">
	import { onMount } from 'svelte';
	import { theme } from '$lib/stores/theme';
	import { Button } from '$lib/components/ui/button';
	import { Sun, Moon } from 'lucide-svelte';

	onMount(() => {
		theme.initialize();
	});

	function toggleTheme() {
		theme.toggle();
	}
</script>

<Button
	on:click={toggleTheme}
	variant="ghost"
	size="icon-sm"
	class="rounded-full"
	aria-label="Toggle theme"
>
	{#if $theme === 'dark'}
		<Sun class="h-5 w-5" />
	{:else}
		<Moon class="h-5 w-5" />
	{/if}
</Button>


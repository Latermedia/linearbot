<script lang="ts">
	import { getToggleGroupCtx, toggleVariants } from './ToggleGroup.svelte';
	import { cn } from '$lib/utils';

	let {
		value,
		class: className,
		...restProps
	}: {
		value: string;
		class?: string;
		[key: string]: any;
	} = $props();

	const ctx = getToggleGroupCtx();
	// Track ctx.value to ensure reactivity
	const currentValue = $derived(ctx.value);
	const isSelected = $derived.by(() => {
		// Access currentValue to track changes
		currentValue;
		return ctx.isSelected(value);
	});
</script>

<button
	type="button"
	data-selected={isSelected}
	data-state={isSelected ? 'on' : 'off'}
	onclick={() => ctx.handleClick(value)}
	class={cn(
		toggleVariants(ctx.variant, ctx.size),
		'min-w-0 flex-1 shrink-0 rounded-sm',
		className
	)}
	{...restProps}
>
	<slot />
</button>


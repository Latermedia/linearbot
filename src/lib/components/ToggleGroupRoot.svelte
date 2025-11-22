<script lang="ts">
	import { setToggleGroupCtx } from './ToggleGroup.svelte';
	import { cn } from '$lib/utils';
	import { tick } from 'svelte';
	import { tweened } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';

	type Variant = 'default' | 'outline';
	type Size = 'default' | 'sm' | 'lg';
	type Type = 'single' | 'multiple';

	let {
		value = $bindable(),
		variant = 'default',
		size = 'default',
		type = 'single',
		class: className,
		...restProps
	}: {
		value?: string | string[];
		variant?: Variant;
		size?: Size;
		type?: Type;
		class?: string;
		[key: string]: any;
	} = $props();

	let containerRef: HTMLDivElement | null = $state(null);
	
	// Use Svelte tweened stores for smooth animation
	const indicatorLeft = tweened(0, { duration: 200, easing: cubicOut });
	const indicatorWidth = tweened(0, { duration: 200, easing: cubicOut });
	const indicatorOpacity = tweened(0, { duration: 150, easing: cubicOut });

	function isSelected(itemValue: string): boolean {
		if (type === 'multiple') {
			return Array.isArray(value) && value.includes(itemValue);
		}
		return value === itemValue;
	}

	function handleClick(itemValue: string) {
		if (type === 'multiple') {
			const current = Array.isArray(value) ? value : [];
			if (current.includes(itemValue)) {
				value = current.filter((v) => v !== itemValue);
			} else {
				value = [...current, itemValue];
			}
		} else {
			value = itemValue;
		}
	}

	async function updateIndicator() {
		if (!containerRef || type !== 'single' || variant !== 'outline') {
			indicatorOpacity.set(0);
			return;
		}

		await tick();
		const selectedButton = containerRef.querySelector(
			'[data-selected="true"]'
		) as HTMLElement;
		
		if (!selectedButton) {
			indicatorOpacity.set(0);
			return;
		}

		const containerRect = containerRef.getBoundingClientRect();
		const buttonRect = selectedButton.getBoundingClientRect();

		const newLeft = buttonRect.left - containerRect.left;
		const newWidth = buttonRect.width;

		// Animate all properties simultaneously
		indicatorLeft.set(newLeft);
		indicatorWidth.set(newWidth);
		indicatorOpacity.set(1);
	}

	$effect(() => {
		value;
		updateIndicator();
	});

	setToggleGroupCtx({
		variant,
		size,
		type,
		value,
		isSelected,
		handleClick
	});
</script>

<div
	bind:this={containerRef}
	class={cn(
		'group/toggle-group relative flex w-fit items-center',
		variant === 'outline' && 'bg-white/5 rounded-md p-0.5 gap-0.5',
		className
	)}
	role="group"
	{...restProps}
>
	{#if variant === 'outline' && type === 'single'}
		<!-- Sliding indicator with Svelte tweened animation -->
		<div
			class="absolute rounded-md bg-white/10 pointer-events-none z-0"
			style="top: 0.125rem; bottom: 0.125rem; left: {$indicatorLeft}px; width: {$indicatorWidth}px; opacity: {$indicatorOpacity};"
			aria-hidden="true"
		/>
	{/if}
	<slot />
</div>


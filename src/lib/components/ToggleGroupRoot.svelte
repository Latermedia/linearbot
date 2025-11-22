<script lang="ts">
	import { setToggleGroupCtx } from './ToggleGroup.svelte';
	import { cn } from '$lib/utils';

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
	let indicatorRef: HTMLDivElement | null = $state(null);

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

	function updateIndicator() {
		if (!containerRef || !indicatorRef || type !== 'single' || variant !== 'outline') return;

		const selectedButton = containerRef.querySelector(
			'[data-selected="true"]'
		) as HTMLElement;
		if (!selectedButton) {
			indicatorRef.style.opacity = '0';
			return;
		}

		indicatorRef.style.opacity = '1';
		const containerRect = containerRef.getBoundingClientRect();
		const buttonRect = selectedButton.getBoundingClientRect();

		indicatorRef.style.width = `${buttonRect.width}px`;
		indicatorRef.style.transform = `translateX(${buttonRect.left - containerRect.left}px)`;
	}

	$effect(() => {
		// Update indicator when value changes
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
		'group/toggle-group flex w-fit items-center',
		variant === 'outline' && 'bg-muted/30 rounded-md p-0.5',
		className
	)}
	role="group"
	{...restProps}
>
	{#if variant === 'outline' && type === 'single'}
		<!-- Minimal sliding indicator -->
		<div
			bind:this={indicatorRef}
			class="absolute h-full rounded-sm bg-background transition-all duration-200 ease-out"
			style="opacity: 0; top: 0;"
			aria-hidden="true"
		/>
	{/if}
	<slot />
</div>


<script lang="ts" module>
	import { getContext, setContext } from 'svelte';
	import { cn } from '$lib/utils';

	type Variant = 'default' | 'outline';
	type Size = 'default' | 'sm' | 'lg';
	type Type = 'single' | 'multiple';

	export interface ToggleGroupContext {
		variant: Variant;
		size: Size;
		type: Type;
		value: string | string[] | undefined;
		isSelected: (value: string) => boolean;
		handleClick: (value: string) => void;
	}

	export function setToggleGroupCtx(ctx: ToggleGroupContext) {
		setContext('toggleGroup', ctx);
	}

	export function getToggleGroupCtx(): ToggleGroupContext {
		const ctx = getContext<ToggleGroupContext>('toggleGroup');
		if (!ctx) {
			throw new Error('ToggleGroup.Item must be used within ToggleGroup.Root');
		}
		return ctx;
	}

	// Elegant Linear-style toggle variants
	export function toggleVariants(variant: Variant, size: Size = 'default') {
		const base = 'inline-flex items-center justify-center whitespace-nowrap text-sm outline-none transition-all duration-200 ease-out cursor-pointer disabled:pointer-events-none disabled:opacity-50';
		
		const variants = {
			default: 'hover:bg-white/10 data-[state=on]:bg-white/10 data-[state=on]:text-white text-neutral-400 bg-transparent rounded',
			outline: 'hover:bg-white/5 data-[state=on]:bg-transparent data-[state=on]:text-white text-neutral-400 bg-transparent rounded-md'
		};

		const sizes = {
			default: 'h-8 min-w-8 px-3',
			sm: 'h-7 min-w-7 px-2.5',
			lg: 'h-9 min-w-9 px-4'
		};

		return cn(base, variants[variant], sizes[size]);
	}
</script>

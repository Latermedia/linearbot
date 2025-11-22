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

	// Minimal Linear-style toggle variants
	export function toggleVariants(variant: Variant, size: Size = 'default') {
		const base = 'inline-flex items-center justify-center whitespace-nowrap text-sm outline-none transition-colors disabled:pointer-events-none disabled:opacity-50';
		
		const variants = {
			default: 'hover:bg-muted/50 data-[state=on]:bg-muted data-[state=on]:text-foreground text-muted-foreground bg-transparent',
			outline: 'hover:bg-muted/30 data-[state=on]:bg-muted data-[state=on]:text-foreground text-muted-foreground bg-transparent'
		};

		const sizes = {
			default: 'h-8 min-w-8 px-3',
			sm: 'h-7 min-w-7 px-2.5',
			lg: 'h-9 min-w-9 px-4'
		};

		return cn(base, variants[variant], sizes[size]);
	}
</script>

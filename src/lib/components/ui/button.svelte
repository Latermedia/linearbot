<script lang="ts" module>
	import { cn, type WithElementRef } from "$lib/utils.js";
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from "svelte/elements";
	import { type VariantProps, tv } from "tailwind-variants";

	export const buttonVariants = tv({
		base: "cursor-pointer inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap text-sm font-medium outline-none transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
		variants: {
			variant: {
				default: "bg-violet-700/80 text-white hover:bg-violet-700 rounded focus:ring-1 focus:ring-violet-600/50",
				destructive: "bg-red-700/80 text-white hover:bg-red-700 rounded focus:ring-1 focus:ring-red-600/50",
				outline: "bg-transparent border border-neutral-800 text-neutral-300 hover:bg-white/10 rounded focus:border-violet-600/50 focus:ring-1 focus:ring-violet-600/30",
				secondary: "bg-white/5 text-neutral-300 hover:bg-white/10 rounded focus:ring-1 focus:ring-violet-600/30",
				ghost: "text-neutral-300 hover:bg-white/10 rounded",
				link: "text-violet-400 underline-offset-4 hover:text-violet-300 hover:underline",
			},
			size: {
				default: "h-8 px-3 py-1.5",
				sm: "h-7 px-2.5 py-1",
				lg: "h-9 px-4 py-2",
				icon: "size-8",
				"icon-sm": "size-7",
				"icon-lg": "size-9",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	});

	export type ButtonVariant = VariantProps<typeof buttonVariants>["variant"];
	export type ButtonSize = VariantProps<typeof buttonVariants>["size"];

	export type ButtonProps = WithElementRef<HTMLButtonAttributes> &
		WithElementRef<HTMLAnchorAttributes> & {
			variant?: ButtonVariant;
			size?: ButtonSize;
		};
</script>

<script lang="ts">
	let {
		class: className,
		variant = "default",
		size = "default",
		ref = $bindable(null),
		href = undefined,
		type = "button",
		disabled,
		children,
		onclick,
		...restProps
	}: ButtonProps = $props();
</script>

{#if href}
	<a
		bind:this={ref}
		data-slot="button"
		class={cn(buttonVariants({ variant, size }), className)}
		href={disabled ? undefined : href}
		aria-disabled={disabled}
		role={disabled ? "link" : undefined}
		tabindex={disabled ? -1 : undefined}
		onclick={onclick}
		{...restProps}
	>
		{@render children?.()}
	</a>
{:else}
	<button
		bind:this={ref}
		data-slot="button"
		class={cn(buttonVariants({ variant, size }), className)}
		{type}
		{disabled}
		onclick={onclick}
		{...restProps}
	>
		{@render children?.()}
	</button>
{/if}


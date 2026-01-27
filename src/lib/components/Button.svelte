<script lang="ts" module>
  import { cn, type WithElementRef } from "$lib/utils.js";
  import type {
    HTMLAnchorAttributes,
    HTMLButtonAttributes,
  } from "svelte/elements";
  import { type VariantProps, tv } from "tailwind-variants";

  export const buttonVariants = tv({
    base: "cursor-pointer inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap text-sm font-medium outline-none transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
    variants: {
      variant: {
        default:
          "bg-brand-600 text-white hover:bg-brand-500 active:bg-brand-700 rounded focus:outline-none focus:ring-1 focus:ring-brand-500/50 focus:border-brand-500",
        destructive:
          "bg-danger-600/80 text-white hover:bg-danger-600 rounded focus:outline-none focus:ring-1 focus:ring-danger-500/50",
        outline:
          "bg-transparent border border-black-300 dark:border-white/10 text-black-700 dark:text-black-300 hover:bg-black-100 dark:hover:bg-white/10 active:bg-black-200 dark:active:bg-white/15 hover:text-black-900 dark:hover:text-white rounded focus:outline-none focus:ring-1 focus:ring-brand-500/50 focus:border-brand-500",
        secondary:
          "bg-black-100 dark:bg-white/5 text-black-700 dark:text-black-300 hover:bg-black-200 dark:hover:bg-white/10 active:bg-black-300 dark:active:bg-white/15 hover:text-black-900 dark:hover:text-white rounded focus:outline-none focus:ring-1 focus:ring-brand-500/50",
        ghost:
          "text-black-600 dark:text-black-400 hover:bg-black-100 dark:hover:bg-white/5 active:bg-black-200 dark:active:bg-white/10 hover:text-black-900 dark:hover:text-white rounded focus:outline-none focus:ring-1 focus:ring-brand-500/50",
        link: "text-brand-500 underline-offset-4 hover:text-brand-400 hover:underline focus:outline-none focus:ring-1 focus:ring-brand-500/50",
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
    {onclick}
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
    {onclick}
    {...restProps}
  >
    {@render children?.()}
  </button>
{/if}

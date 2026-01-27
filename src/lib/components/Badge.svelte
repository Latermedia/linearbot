<script lang="ts" module>
  import { type VariantProps, tv } from "tailwind-variants";

  export const badgeVariants = tv({
    base: "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-medium transition-colors duration-150 [&>svg]:pointer-events-none [&>svg]:size-3",
    variants: {
      variant: {
        default:
          "bg-black-100 dark:bg-white/10 text-black-700 dark:text-black-300",
        secondary:
          "bg-black-200 dark:bg-black-800 text-black-600 dark:text-black-400",
        destructive:
          "bg-danger-100 dark:bg-danger-500/10 text-danger-700 dark:text-danger-400",
        success:
          "bg-success-100 dark:bg-success-500/10 text-success-700 dark:text-success-400",
        warning:
          "bg-warning-100 dark:bg-warning-500/10 text-warning-700 dark:text-warning-400",
        outline:
          "bg-transparent border border-black-300 dark:border-white/10 text-black-700 dark:text-black-300",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  });

  export type BadgeVariant = VariantProps<typeof badgeVariants>["variant"];
</script>

<script lang="ts">
  import type { HTMLAnchorAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "$lib/utils.js";

  let {
    ref = $bindable(null),
    href,
    class: className,
    variant = "default",
    children,
    ...restProps
  }: WithElementRef<HTMLAnchorAttributes> & {
    variant?: BadgeVariant;
  } = $props();
</script>

<svelte:element
  this={href ? "a" : "span"}
  bind:this={ref}
  data-slot="badge"
  {href}
  class={cn(badgeVariants({ variant }), className)}
  {...restProps}
>
  {#if children}
    {@render children()}
  {/if}
</svelte:element>

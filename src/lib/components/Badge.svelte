<script lang="ts" module>
  import { type VariantProps, tv } from "tailwind-variants";

  export const badgeVariants = tv({
    base: "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-medium transition-colors duration-150 [&>svg]:pointer-events-none [&>svg]:size-3",
    variants: {
      variant: {
        default:
          "bg-neutral-100 dark:bg-white/10 text-neutral-700 dark:text-neutral-300",
        secondary:
          "bg-neutral-200 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400",
        destructive:
          "bg-red-100 dark:bg-red-500/10 text-red-700 dark:text-red-400",
        success:
          "bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
        warning:
          "bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400",
        outline:
          "bg-transparent border border-neutral-300 dark:border-white/10 text-neutral-700 dark:text-neutral-300",
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

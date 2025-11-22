<script lang="ts" module>
  import { type VariantProps, tv } from "tailwind-variants";

  export const badgeVariants = tv({
    base: "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-medium transition-colors duration-150 [&>svg]:pointer-events-none [&>svg]:size-3",
    variants: {
      variant: {
        default: "bg-white/10 text-neutral-300",
        secondary: "bg-neutral-800 text-neutral-400",
        destructive: "bg-red-500/10 text-red-400",
        outline: "bg-transparent border border-white/10 text-neutral-300",
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

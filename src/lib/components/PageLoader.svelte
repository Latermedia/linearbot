<script lang="ts">
  /**
   * PageLoader - A centered loading indicator for page content
   * Uses the same 3x3 grid animation as the sync indicator
   */

  interface Props {
    size?: "sm" | "md" | "lg";
    message?: string;
    inline?: boolean;
  }

  let { size = "lg", message, inline = false }: Props = $props();

  // Size mappings
  const sizeClasses = {
    sm: "w-8 h-8 gap-1",
    md: "w-12 h-12 gap-1",
    lg: "w-16 h-16 gap-1.5",
  };

  const blockRadius = {
    sm: "rounded-[2px]",
    md: "rounded-[3px]",
    lg: "rounded-[4px]",
  };

  const paddingClasses = {
    sm: "py-8",
    md: "py-16",
    lg: "py-24",
  };

  // Animation delays for sequential wave effect
  const delays = [0.0, 0.15, 0.3, 0.15, 0.3, 0.45, 0.3, 0.45, 0.6];
</script>

<div
  class="flex flex-col items-center justify-center {inline
    ? 'py-4'
    : paddingClasses[size]} gap-4"
>
  <div class="grid grid-cols-3 {sizeClasses[size]}">
    {#each Array(9) as _, i}
      <div
        class="loader-block w-full h-full {blockRadius[
          size
        ]} bg-brand-500 dark:bg-hot-take-600"
        style="animation-delay: {delays[i]}s;"
      ></div>
    {/each}
  </div>
  {#if message}
    <p class="text-sm text-black-500 dark:text-black-400">{message}</p>
  {/if}
</div>

<style>
  @keyframes loader-pulse {
    0% {
      opacity: 0.2;
      transform: scale(0.85);
    }
    50% {
      opacity: 1;
      transform: scale(1);
    }
    100% {
      opacity: 0.2;
      transform: scale(0.85);
    }
  }

  .loader-block {
    animation: loader-pulse 1.2s ease-in-out infinite;
  }
</style>

<script lang="ts">
  import { onMount } from "svelte";
  import { theme } from "$lib/stores/theme";

  interface Props {
    size?: number;
    class?: string;
    delay?: number;
  }

  let { size = 20, class: className = "", delay = 0 }: Props = $props();

  let mounted = $state(false);
  let animationStarted = $state(false);

  const isDark = $derived($theme === "dark");

  onMount(() => {
    mounted = true;
    if (delay > 0) {
      setTimeout(() => {
        animationStarted = true;
      }, delay);
    } else {
      animationStarted = true;
    }
  });
</script>

<div
  class="logo-container {className}"
  style="width: {size}px; height: {size}px;"
  class:animate={mounted && animationStarted}
>
  <img
    src={isDark
      ? "/logo_icon_knockout_light.svg"
      : "/logo_icon_knockout_dark.svg"}
    alt="Laterbot logo"
    width={size}
    height={size}
    class="logo-svg"
  />
</div>

<style>
  .logo-container {
    position: relative;
  }

  .logo-svg {
    display: block;
    /* Start state: blurred out */
    opacity: 0;
    filter: blur(10px);
    transition:
      opacity 500ms cubic-bezier(0.76, 0, 0.24, 1),
      filter 500ms cubic-bezier(0.76, 0, 0.24, 1);
  }

  /* Animated state: materialize into focus */
  .animate .logo-svg {
    opacity: 1;
    filter: blur(0px);
  }

  /* Reduced motion support */
  @media (prefers-reduced-motion: reduce) {
    .logo-svg {
      filter: none;
      transition: opacity 300ms ease-out;
    }

    .animate .logo-svg {
      opacity: 1;
    }
  }
</style>

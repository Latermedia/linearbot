<script lang="ts">
  import { onMount } from "svelte";

  interface Props {
    size?: number;
    class?: string;
    delay?: number;
  }

  let { size = 20, class: className = "", delay = 0 }: Props = $props();

  let mounted = $state(false);
  let animationStarted = $state(false);

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
  <svg
    width={size}
    height={size}
    viewBox="0 0 200 206"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    class="logo-svg"
  >
    <path
      d="M200 153.612V205.299H63.418L0 132.823V0H60.2197L200 153.612ZM7.24707 7.71777V126.047H128.43V88.8623H52.9736V7.71777H7.24707Z"
      fill="#F8F2EA"
    />
  </svg>
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

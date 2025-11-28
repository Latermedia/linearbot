<script lang="ts">
  import { theme } from "$lib/stores/theme";
  import Button from "$lib/components/Button.svelte";
  import { Sun, Moon } from "lucide-svelte";

  function toggleTheme() {
    theme.toggle();
  }
</script>

<Button
  onclick={toggleTheme}
  variant="ghost"
  size="icon-sm"
  aria-label="Toggle theme"
>
  {#if $theme === "light"}
    <Sun class="h-5 w-5" />
  {:else}
    <Moon class="h-5 w-5" />
  {/if}
</Button>

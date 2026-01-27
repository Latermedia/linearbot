<script lang="ts">
  import { page } from "$app/stores";
  import type { Snippet } from "svelte";
  import { fade } from "svelte/transition";
  import { quartOut } from "svelte/easing";
  import Sidebar from "./Sidebar.svelte";

  interface Props {
    children: Snippet;
  }

  let { children }: Props = $props();

  // Don't show sidebar on login page
  const showSidebar = $derived($page.url.pathname !== "/login");
  const currentPath = $derived($page.url.pathname);
</script>

<div class="flex h-screen bg-ambient-900 dark:bg-black-950 overflow-hidden">
  {#if showSidebar}
    <Sidebar />
  {/if}

  <main class="flex-1 overflow-auto bg-ambient-200 dark:bg-black-950">
    {#key currentPath}
      <div class="min-h-full" in:fade={{ duration: 150, easing: quartOut }}>
        {@render children()}
      </div>
    {/key}
  </main>
</div>

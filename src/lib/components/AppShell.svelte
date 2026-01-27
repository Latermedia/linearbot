<script lang="ts">
  import { page } from "$app/stores";
  import type { Snippet } from "svelte";
  import Sidebar from "./Sidebar.svelte";

  interface Props {
    children: Snippet;
  }

  let { children }: Props = $props();

  // Don't show sidebar on login page
  const showSidebar = $derived($page.url.pathname !== "/login");
</script>

<div class="flex h-screen bg-ambient-900 dark:bg-black-950 overflow-hidden">
  {#if showSidebar}
    <Sidebar />
  {/if}

  <main class="flex-1 overflow-auto bg-white dark:bg-black-950">
    <div class="min-h-full">
      {@render children()}
    </div>
  </main>
</div>

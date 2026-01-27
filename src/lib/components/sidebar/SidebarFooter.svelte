<script lang="ts">
  import { goto } from "$app/navigation";
  import { sidebarCollapsed } from "$lib/stores/sidebar";
  import { isAuthenticated } from "$lib/stores/auth";
  import { theme } from "$lib/stores/theme";
  import { Sun, Moon, LogOut } from "lucide-svelte";
  import SyncIndicator from "$lib/components/SyncIndicator.svelte";

  const isCollapsed = $derived($sidebarCollapsed);

  async function handleLogout() {
    const { csrfPost, clearCsrfToken } = await import("$lib/utils/csrf");
    try {
      await csrfPost("/api/auth/logout");
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      clearCsrfToken();
    }
    isAuthenticated.set(false);
    goto("/login");
  }

  function toggleTheme() {
    theme.toggle();
  }
</script>

<div class="space-y-1">
  <!-- Sync Status -->
  <SyncIndicator />

  <!-- Theme Toggle -->
  <button
    type="button"
    onclick={toggleTheme}
    class="w-full flex items-center gap-3 px-3 py-2 text-sm rounded transition-colors duration-150 cursor-pointer
      text-black-600 dark:text-black-400 hover:text-black-900 dark:hover:text-white hover:bg-black-100 dark:hover:bg-white/5
      {isCollapsed ? 'justify-center' : ''}"
    title={isCollapsed
      ? $theme === "dark"
        ? "Light mode"
        : "Dark mode"
      : undefined}
  >
    {#if $theme === "dark"}
      <Sun class="w-5 h-5 shrink-0" />
    {:else}
      <Moon class="w-5 h-5 shrink-0" />
    {/if}
    {#if !isCollapsed}
      <span>{$theme === "dark" ? "Light mode" : "Dark mode"}</span>
    {/if}
  </button>

  <!-- Logout -->
  {#if $isAuthenticated}
    <button
      type="button"
      onclick={handleLogout}
      class="w-full flex items-center gap-3 px-3 py-2 text-sm rounded transition-colors duration-150 cursor-pointer
        text-black-600 dark:text-black-400 hover:text-black-900 dark:hover:text-white hover:bg-black-100 dark:hover:bg-white/5
        {isCollapsed ? 'justify-center' : ''}"
      title={isCollapsed ? "Logout" : undefined}
    >
      <LogOut class="w-5 h-5 shrink-0" />
      {#if !isCollapsed}
        <span>Logout</span>
      {/if}
    </button>
  {/if}
</div>

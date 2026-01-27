<script lang="ts">
  import { goto } from "$app/navigation";
  import { isAuthenticated } from "$lib/stores/auth";
  import { theme } from "$lib/stores/theme";
  import { Sun, Moon, LogOut } from "lucide-svelte";
  import SyncIndicator from "$lib/components/SyncIndicator.svelte";

  interface Props {
    isCollapsed: boolean;
  }

  let { isCollapsed }: Props = $props();

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
  <SyncIndicator {isCollapsed} />

  <!-- Theme Toggle -->
  <button
    type="button"
    onclick={toggleTheme}
    class="group relative w-full flex items-center py-2 text-sm rounded transition-colors duration-150 cursor-pointer
      text-black-600 dark:text-black-400 hover:text-black-900 dark:hover:text-white hover:bg-ambient-700 dark:hover:bg-white/5"
    title={isCollapsed
      ? $theme === "dark"
        ? "Light mode"
        : "Dark mode"
      : undefined}
  >
    <div class="w-16 flex justify-center shrink-0">
      {#if $theme === "dark"}
        <Sun class="w-5 h-5" />
      {:else}
        <Moon class="w-5 h-5" />
      {/if}
    </div>
    <div
      class="overflow-hidden transition-all duration-250 ease-quart-out text-left"
      style="width: {isCollapsed ? '0' : '176px'}; opacity: {isCollapsed
        ? 0
        : 1}"
    >
      <span class="whitespace-nowrap"
        >{$theme === "dark" ? "Light mode" : "Dark mode"}</span
      >
    </div>

    <!-- Tooltip when collapsed -->
    {#if isCollapsed}
      <div
        class="absolute left-full ml-2 px-2 py-1 text-xs font-medium text-white bg-black-800 rounded shadow-lg
          opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 whitespace-nowrap z-50"
      >
        {$theme === "dark" ? "Light mode" : "Dark mode"}
      </div>
    {/if}
  </button>

  <!-- Logout -->
  {#if $isAuthenticated}
    <button
      type="button"
      onclick={handleLogout}
      class="group relative w-full flex items-center py-2 text-sm rounded transition-colors duration-150 cursor-pointer
        text-black-600 dark:text-black-400 hover:text-black-900 dark:hover:text-white hover:bg-ambient-700 dark:hover:bg-white/5"
      title={isCollapsed ? "Logout" : undefined}
    >
      <div class="w-16 flex justify-center shrink-0">
        <LogOut class="w-5 h-5" />
      </div>
      <div
        class="overflow-hidden transition-all duration-250 ease-quart-out text-left"
        style="width: {isCollapsed ? '0' : '176px'}; opacity: {isCollapsed
          ? 0
          : 1}"
      >
        <span class="whitespace-nowrap">Logout</span>
      </div>

      <!-- Tooltip when collapsed -->
      {#if isCollapsed}
        <div
          class="absolute left-full ml-2 px-2 py-1 text-xs font-medium text-white bg-black-800 rounded shadow-lg
            opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 whitespace-nowrap z-50"
        >
          Logout
        </div>
      {/if}
    </button>
  {/if}
</div>

<style>
  .duration-250 {
    transition-duration: 250ms;
  }
  .ease-quart-out {
    transition-timing-function: cubic-bezier(0.25, 1, 0.5, 1);
  }
</style>

<script lang="ts">
  import "../app.css";
  import { browser } from "$app/environment";
  import { onMount } from "svelte";
  import type { Snippet } from "svelte";
  import { page } from "$app/stores";
  import { theme } from "$lib/stores/theme";
  import { presentationMode } from "$lib/stores/presentation";
  import { isAuthenticated, checkAuth } from "$lib/stores/auth";
  import ThemeToggle from "$lib/components/ThemeToggle.svelte";
  import DevMenuModal from "$lib/components/DevMenuModal.svelte";
  import SyncIndicator from "$lib/components/SyncIndicator.svelte";
  import Button from "$lib/components/ui/button.svelte";
  import { goto } from "$app/navigation";

  let { children }: { children: Snippet } = $props();
  let showDevMenu = $state(false);

  // Initialize theme and check auth
  onMount(() => {
    if (browser) {
      theme.initialize();
      checkAuth();

      // Unregister any existing service workers (from old LibSQL client)
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          for (const registration of registrations) {
            registration.unregister();
            console.log("Unregistered service worker:", registration.scope);
          }
        });
      }
    }
  });

  // Secret dev menu shortcut: Ctrl+Shift+D (Windows/Linux) or Cmd+Shift+D (Mac)
  $effect(() => {
    if (!browser) return;

    function handleKeydown(event: KeyboardEvent) {
      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const keyLower = event.key.toLowerCase();

      // Check for shortcut: Cmd+Shift+D (Mac) or Ctrl+Shift+D (Windows/Linux)
      const modifierPressed = isMac
        ? event.metaKey && event.shiftKey && !event.altKey && !event.ctrlKey
        : event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey;

      if (modifierPressed && keyLower === "d") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        showDevMenu = !showDevMenu;
        return false;
      }
    }

    document.addEventListener("keydown", handleKeydown, {
      capture: true,
      passive: false,
    });

    return () => {
      document.removeEventListener("keydown", handleKeydown, {
        capture: true,
      } as any);
    };
  });

  // Reactively sync dark class on html element with theme store
  $effect(() => {
    if (browser) {
      document.documentElement.classList.remove("dark");
      if ($theme === "dark") {
        document.documentElement.classList.add("dark");
      }
    }
  });

  // Client-side route protection (for SPA navigation)
  $effect(() => {
    if (!browser) return;

    // Skip auth check on login page
    if ($page.url.pathname === "/login") {
      return;
    }

    // Check auth status and redirect if not authenticated
    checkAuth().then((authenticated) => {
      if (!authenticated && $page.url.pathname !== "/login") {
        const redirectTo = $page.url.pathname + $page.url.search;
        goto(`/login?redirect=${encodeURIComponent(redirectTo)}`);
      }
    });
  });
</script>

<div class="min-h-screen bg-white dark:bg-neutral-950">
  <header
    class="sticky top-0 z-50 border-b backdrop-blur-sm border-neutral-200 dark:border-white/10 bg-white/95 dark:bg-neutral-950/95"
  >
    <div class="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-4">
      <div class="flex justify-between items-center">
        <div class="flex gap-6 items-center">
          <h1
            class="text-xl font-semibold tracking-tight text-neutral-900 dark:text-white"
          >
            LinearBot
          </h1>
          {#if !$presentationMode}
            <nav class="flex gap-1 items-center">
              <a
                href="/"
                onclick={() => presentationMode.set(false)}
                class="px-3 py-1.5 text-sm font-medium rounded transition-colors
                  {$page.url.pathname === '/'
                  ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-50 dark:hover:bg-neutral-900'}"
              >
                Dashboard
              </a>
              <a
                href="/executive"
                onclick={() => presentationMode.set(false)}
                class="px-3 py-1.5 text-sm font-medium rounded transition-colors
                  {$page.url.pathname === '/executive'
                  ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-50 dark:hover:bg-neutral-900'}"
              >
                Executive
              </a>
            </nav>
          {/if}
        </div>
        <div class="flex gap-4 items-center">
          <SyncIndicator />
          <ThemeToggle />
          {#if $isAuthenticated}
            <Button
              variant="outline"
              size="sm"
              onclick={async () => {
                await fetch("/api/auth/logout", { method: "POST" });
                isAuthenticated.set(false);
                goto("/login");
              }}
            >
              Logout
            </Button>
          {/if}
        </div>
      </div>
    </div>
  </header>

  <main class="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
    {@render children()}
  </main>

  <footer
    class="mt-12 border-t border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-neutral-900"
  >
    <div class="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <p class="text-sm text-center text-neutral-500 dark:text-neutral-500">
        Linear Bot - Track WIP constraints and project health
      </p>
    </div>
  </footer>

  <!-- Dev Menu Modal -->
  {#if showDevMenu}
    <DevMenuModal onclose={() => (showDevMenu = false)} />
  {/if}
</div>

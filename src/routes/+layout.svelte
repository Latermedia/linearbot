<script lang="ts">
  import "../app.css";
  import { browser } from "$app/environment";
  import { onMount } from "svelte";
  import type { Snippet } from "svelte";
  import { page } from "$app/stores";
  import { theme } from "$lib/stores/theme";
  import { checkAuth } from "$lib/stores/auth";
  import { goto } from "$app/navigation";
  import AppShell from "$lib/components/AppShell.svelte";
  import DevMenuModal from "$lib/components/DevMenuModal.svelte";

  let { children }: { children: Snippet } = $props();
  let showDevMenu = $state(false);
  let previousPathname = $state<string | null>(null);

  // Check if we should show the app shell (not on login page)
  const showAppShell = $derived($page.url.pathname !== "/login");

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

      // Set initial pathname after mount to detect subsequent navigation
      previousPathname = $page.url.pathname;
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

  // Client-side route protection (for SPA navigation only, not initial load)
  // Server-side redirect handles initial load authentication, so we skip client redirect
  // on initial load to prevent Firefox from canceling the request (NS_BINDING_CANCELED)
  $effect(() => {
    if (!browser) return;

    const currentPathname = $page.url.pathname;

    // Skip auth check on login page
    if (currentPathname === "/login") {
      previousPathname = currentPathname;
      return;
    }

    // Only check auth if pathname actually changed (SPA navigation)
    // Skip on initial load when previousPathname is null or same as current
    const isNavigation =
      previousPathname !== null && previousPathname !== currentPathname;

    if (!isNavigation) {
      // Update previousPathname for next check
      previousPathname = currentPathname;
      return;
    }

    // Check auth status and redirect if not authenticated (SPA navigation only)
    checkAuth().then((authenticated) => {
      if (!authenticated && currentPathname !== "/login") {
        goto("/login");
      }
      // Update previousPathname after auth check
      previousPathname = currentPathname;
    });
  });
</script>

{#if showAppShell}
  <AppShell>
    <div class="p-6">
      {@render children()}
    </div>
  </AppShell>
{:else}
  <div class="min-h-screen bg-black-950">
    {@render children()}
  </div>
{/if}

<!-- Dev Menu Modal -->
{#if showDevMenu}
  <DevMenuModal onclose={() => (showDevMenu = false)} />
{/if}

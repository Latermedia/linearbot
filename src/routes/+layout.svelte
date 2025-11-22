<script lang="ts">
  import "../app.css";
  import { browser } from "$app/environment";
  import { onMount } from "svelte";
  import { theme } from "$lib/stores/theme";
  import ThemeToggle from "$lib/components/ThemeToggle.svelte";

  // Initialize theme
  onMount(() => {
    if (browser) {
      theme.initialize();

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

  // Reactively sync dark class on html element with theme store
  $: if (browser) {
    document.documentElement.classList.remove("dark");
    if ($theme === "dark") {
      document.documentElement.classList.add("dark");
    }
  }
</script>

<div class="min-h-screen bg-white dark:bg-neutral-950">
  <header
    class="sticky top-0 z-50 border-b backdrop-blur-sm border-neutral-200 dark:border-white/10 bg-white/95 dark:bg-neutral-950/95"
  >
    <div class="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-4">
      <div class="flex justify-between items-center">
        <div class="flex gap-3 items-center">
          <h1
            class="text-xl font-semibold tracking-tight text-neutral-900 dark:text-white"
          >
            LinearBot
          </h1>
        </div>
        <div class="flex gap-4 items-center">
          <a
            href="/"
            class="text-sm font-medium transition-colors duration-150 text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
          >
            Timeline
          </a>
          <ThemeToggle />
        </div>
      </div>
    </div>
  </header>

  <main class="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <slot />
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
</div>

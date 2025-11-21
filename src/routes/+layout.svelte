<script lang="ts">
  import "../app.css";
  import ThemeToggle from "$lib/components/ThemeToggle.svelte";
  import { browser } from "$app/environment";
  import { onMount } from "svelte";

  // Unregister any existing service workers (from old LibSQL client)
  onMount(() => {
    if (browser && "serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          registration.unregister();
          console.log("Unregistered service worker:", registration.scope);
        }
      });
    }
  });
</script>

<div class="min-h-screen bg-background">
  <header class="bg-card border-b border-border shadow-sm sticky top-0 z-50">
    <div class="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <h1
            class="text-2xl font-bold bg-gradient-to-r from-blue-500 to-cyan-500 bg-clip-text text-transparent"
          >
            LINEAR BOT
          </h1>
          <span class="text-2xl">🚀</span>
        </div>
        <div class="flex items-center gap-4">
          <a
            href="/"
            class="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
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

  <footer class="border-t border-border bg-card mt-12">
    <div class="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <p class="text-sm text-muted-foreground text-center">
        Linear Bot - Track WIP constraints and project health
      </p>
    </div>
  </footer>
</div>

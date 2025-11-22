<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { browser } from "$app/environment";
  import Button from "$lib/components/ui/button.svelte";
  import { databaseStore } from "../stores/database";
  import { RefreshCw } from "lucide-svelte";

  let { lastSync = null }: { lastSync?: Date | null } = $props();

  const THROTTLE_MS = 10 * 60 * 1000; // 10 minutes
  const POLL_INTERVAL = 5000; // 5 seconds
  const STORAGE_KEY = "linear-bot-last-sync";

  let canRefresh = true;
  let timeUntilRefresh = 0;
  let intervalId: number | undefined;
  let pollIntervalId: number | undefined;
  let isRefreshing = false;

  function checkThrottle() {
    if (!browser) return;

    const lastSyncTime = localStorage.getItem(STORAGE_KEY);
    if (!lastSyncTime) {
      canRefresh = true;
      timeUntilRefresh = 0;
      return;
    }

    const lastSyncDate = new Date(lastSyncTime);
    const now = new Date();
    const elapsed = now.getTime() - lastSyncDate.getTime();

    if (elapsed >= THROTTLE_MS) {
      canRefresh = true;
      timeUntilRefresh = 0;
    } else {
      canRefresh = false;
      timeUntilRefresh = Math.ceil((THROTTLE_MS - elapsed) / 1000);
    }
  }

  async function handleRefresh() {
    if (!canRefresh || !browser || isRefreshing) return;

    isRefreshing = true;
    localStorage.setItem(STORAGE_KEY, new Date().toISOString());
    canRefresh = false;

    try {
      await databaseStore.load();
    } finally {
      isRefreshing = false;
      checkThrottle();
    }
  }

  function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  function formatLastSync(date: Date | null): string {
    if (!date) return "Never synced";

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));

    if (diffMins < 1) return "Just now";
    if (diffMins === 1) return "1 minute ago";
    if (diffMins < 60) return `${diffMins} minutes ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours === 1) return "1 hour ago";
    return `${diffHours} hours ago`;
  }

  function formatDateTime(date: Date | null): string {
    if (!date) return "Never";

    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }

  // Poll for database updates
  async function pollForUpdates() {
    if (!browser || isRefreshing) return;

    try {
      // Check if there are new updates available
      const response = await fetch("/api/issues/latest-update");

      if (response.ok) {
        const data = await response.json();
        if (data.latest && lastSync) {
          const latestUpdate = new Date(data.latest);
          if (latestUpdate > lastSync) {
            // New data available, auto-refresh
            await databaseStore.load();
          }
        }
      }
    } catch (error) {
      // Silently fail polling errors
      console.debug("Poll error:", error);
    }
  }

  // Only run in browser
  onMount(() => {
    checkThrottle();

    // Countdown timer for throttle
    if (!canRefresh) {
      intervalId = setInterval(() => {
        timeUntilRefresh--;
        if (timeUntilRefresh <= 0) {
          checkThrottle();
          if (canRefresh && intervalId) {
            clearInterval(intervalId);
            intervalId = undefined;
          }
        }
      }, 1000) as unknown as number;
    }

    // Start polling for updates
    pollIntervalId = setInterval(
      pollForUpdates,
      POLL_INTERVAL
    ) as unknown as number;

    return () => {
      if (intervalId) clearInterval(intervalId);
      if (pollIntervalId) clearInterval(pollIntervalId);
    };
  });

  onDestroy(() => {
    if (intervalId) clearInterval(intervalId);
    if (pollIntervalId) clearInterval(pollIntervalId);
  });
</script>

<div class="flex flex-col sm:flex-row items-start sm:items-center gap-3">
  <div class="text-sm">
    <div class="text-muted-foreground">
      Last sync: <span class="font-medium text-foreground"
        >{formatLastSync(lastSync)}</span
      >
    </div>
    <div class="text-xs text-muted-foreground">
      {formatDateTime(lastSync)}
    </div>
  </div>
  <Button
    onclick={handleRefresh}
    disabled={!canRefresh || isRefreshing}
    variant="default"
    size="sm"
  >
    <RefreshCw class={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
    {#if isRefreshing}
      Refreshing...
    {:else if !canRefresh}
      Refresh in {formatTime(timeUntilRefresh)}
    {:else}
      Refresh Data
    {/if}
  </Button>
</div>

<style>
  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  :global(.animate-spin) {
    animation: spin 1s linear infinite;
  }
</style>

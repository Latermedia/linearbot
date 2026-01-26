<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import Button from "$lib/components/Button.svelte";

  let password = $state("");
  let error = $state("");
  let isLoading = $state(false);
  let passwordInput: HTMLInputElement;

  onMount(() => {
    passwordInput?.focus();
  });

  async function handleSubmit(event: Event) {
    event.preventDefault();
    error = "";
    isLoading = true;

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ password }),
      });

      const data = await response.json();

      if (!response.ok) {
        error = data.error || "Invalid password";
        return;
      }

      // Update auth state and redirect to home page
      const { isAuthenticated } = await import("$lib/stores/auth");
      // Fetch CSRF token after successful login
      const { getCsrfToken } = await import("$lib/utils/csrf");
      await getCsrfToken();
      isAuthenticated.set(true);
      goto("/");
    } catch (err) {
      error = "An error occurred. Please try again.";
      console.error("Login error:", err);
    } finally {
      isLoading = false;
    }
  }
</script>

<div
  class="min-h-screen flex items-center justify-center bg-white dark:bg-neutral-950 px-4"
>
  <div class="w-full max-w-md">
    <div class="text-center mb-8">
      <h1 class="text-2xl font-semibold text-neutral-900 dark:text-white mb-2">
        Laterbot
      </h1>
      <p class="text-sm text-neutral-600 dark:text-neutral-400">
        Enter password to access
      </p>
    </div>

    <form onsubmit={handleSubmit} class="space-y-4">
      <div>
        <label
          for="password"
          class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2"
        >
          Password
        </label>
        <input
          id="password"
          type="password"
          bind:value={password}
          bind:this={passwordInput}
          disabled={isLoading}
          autocomplete="current-password"
          class="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-md bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white placeholder-neutral-500 dark:placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-500 dark:focus:ring-neutral-400 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
          placeholder="Enter password"
        />
      </div>

      {#if error}
        <div
          class="px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md"
        >
          <p class="text-sm text-red-800 dark:text-red-200">{error}</p>
        </div>
      {/if}

      <Button type="submit" disabled={isLoading || !password} class="w-full">
        {isLoading ? "Signing in..." : "Sign in"}
      </Button>
    </form>
  </div>
</div>

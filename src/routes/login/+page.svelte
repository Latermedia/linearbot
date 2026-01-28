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
  class="flex justify-center items-center px-4 min-h-screen bg-ambient-800 dark:bg-black-950"
>
  <div class="w-full max-w-md">
    <div class="mb-8 text-center">
      <h1 class="mb-2 text-2xl font-semibold text-black-900 dark:text-white">
        Laterbot
      </h1>
    </div>

    <form onsubmit={handleSubmit} class="space-y-4">
      <div>
        <label
          for="password"
          class="block mb-2 text-sm font-medium text-black-700 dark:text-black-300"
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
          class="px-3 py-2 w-full rounded-md border border-black-200 dark:border-black-700 bg-ambient-600 dark:bg-black-900 text-black-900 dark:text-white placeholder-black-500 dark:placeholder-black-400 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:focus:ring-black-400 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
          placeholder="Enter password"
        />
      </div>

      {#if error}
        <div
          class="px-4 py-3 rounded-md border bg-danger-50 dark:bg-danger-900/20 border-danger-200 dark:border-danger-800"
        >
          <p class="text-sm text-danger-800 dark:text-danger-200">{error}</p>
        </div>
      {/if}

      <Button type="submit" disabled={isLoading || !password} class="w-full">
        {isLoading ? "Signing in..." : "Sign in"}
      </Button>
    </form>
  </div>
</div>

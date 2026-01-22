<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import Modal from "$lib/components/Modal.svelte";
  import { databaseStore } from "../stores/database";
  import { AlertTriangle } from "lucide-svelte";
  import { csrfPost } from "$lib/utils/csrf";

  let {
    onclose,
  }: {
    onclose: () => void;
  } = $props();

  const DELETE_CONFIRMATION_TEXT = "DELETE";

  let isResetting = $state(false);
  let resetError = $state<string | null>(null);
  let resetSuccess = $state(false);

  // Delete confirmation state
  let deleteConfirmationInput = $state("");
  let adminPasswordInput = $state("");
  let deleteInputRef = $state<HTMLInputElement | null>(null);
  let adminPasswordInputRef = $state<HTMLInputElement | null>(null);

  const canDelete = $derived(
    deleteConfirmationInput === DELETE_CONFIRMATION_TEXT &&
      adminPasswordInput.length > 0
  );

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      onclose();
    }
  }

  async function handleResetDatabase() {
    if (!browser || isResetting || !canDelete) return;

    isResetting = true;
    resetError = null;
    resetSuccess = false;

    try {
      const response = await csrfPost("/api/db/reset", {
        adminPassword: adminPasswordInput,
      });

      const data = await response.json();

      if (!response.ok) {
        resetError = data.error || "Failed to reset database";
        return;
      }

      resetSuccess = true;
      deleteConfirmationInput = "";
      adminPasswordInput = "";
      // Reload data after reset
      await databaseStore.load();
    } catch (error) {
      resetError =
        error instanceof Error ? error.message : "Failed to reset database";
    } finally {
      isResetting = false;
    }
  }

  onMount(() => {
    document.addEventListener("keydown", handleKeydown);
    // Focus the confirmation input when modal opens
    setTimeout(() => {
      deleteInputRef?.focus();
    }, 50);

    return () => {
      document.removeEventListener("keydown", handleKeydown);
    };
  });
</script>

{#snippet childrenSnippet()}
  <div class="space-y-6">
    <!-- Reset Database Section -->
    <div class="space-y-3">
      <div class="flex gap-2 items-center text-red-400">
        <AlertTriangle class="w-3.5 h-3.5" />
        <span class="text-xs font-medium">Danger Zone</span>
      </div>

      <p class="text-xs text-neutral-500">
        Reset database and delete all synced data. This will permanently delete
        all data from the database.
      </p>

      {#if resetSuccess}
        <p class="text-xs text-green-400">Database reset successfully</p>
      {/if}
      {#if resetError}
        <p class="text-xs text-red-400">{resetError}</p>
      {/if}

      <div class="space-y-2">
        <input
          id="delete-confirm"
          type="text"
          bind:value={deleteConfirmationInput}
          bind:this={deleteInputRef}
          class="px-2.5 py-1.5 w-full text-xs text-white rounded bg-neutral-800/50 placeholder-neutral-600 focus:outline-none focus:ring-1 focus:ring-red-500/50"
          placeholder="Type DELETE to confirm"
          autocomplete="off"
          spellcheck="false"
          onkeydown={(e) => {
            if (e.key === "Enter" && canDelete) {
              adminPasswordInputRef?.focus();
            }
          }}
        />
        <input
          id="admin-password"
          type="password"
          bind:value={adminPasswordInput}
          bind:this={adminPasswordInputRef}
          class="px-2.5 py-1.5 w-full text-xs text-white rounded bg-neutral-800/50 placeholder-neutral-600 focus:outline-none focus:ring-1 focus:ring-red-500/50"
          placeholder="Enter admin password"
          autocomplete="off"
          spellcheck="false"
          onkeydown={(e) => {
            if (e.key === "Enter" && canDelete && !isResetting) {
              handleResetDatabase();
            }
          }}
        />
        <div class="flex gap-2">
          <button
            onclick={() => {
              deleteConfirmationInput = "";
              adminPasswordInput = "";
            }}
            class="flex-1 px-3 py-1.5 text-xs transition-colors cursor-pointer text-neutral-400 hover:text-white"
          >
            Clear
          </button>
          <button
            onclick={handleResetDatabase}
            disabled={isResetting || !canDelete}
            class="flex-1 px-3 py-1.5 text-xs text-red-400 rounded transition-colors cursor-pointer bg-red-500/10 hover:bg-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isResetting ? "Resetting..." : "Reset"}
          </button>
        </div>
      </div>
    </div>

    <!-- Footer hint -->
    <div class="pt-4 border-t border-neutral-800">
      <p class="text-xs text-center text-neutral-500">
        <kbd
          class="px-1.5 py-0.5 rounded border bg-neutral-800 border-neutral-700 text-neutral-300"
          >Esc</kbd
        >
        to close
      </p>
    </div>
  </div>
{/snippet}

<Modal title="Tools" {onclose} size="sm" children={childrenSnippet} />

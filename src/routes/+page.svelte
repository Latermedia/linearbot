<script lang="ts">
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { presentationMode } from "$lib/stores/presentation";
  import TeamDashboardView from "$lib/components/views/TeamDashboardView.svelte";

  // Page data from server load function
  let { data } = $props();

  // Engineer-to-team mapping for filtering IC metrics by team
  const engineerTeamMapping = $derived(data.engineerTeamMapping);

  // Secret executive view shortcut: Ctrl+Shift+E (Windows/Linux) or Cmd+Shift+E (Mac)
  $effect(() => {
    if (!browser) return;

    function handleKeydown(event: KeyboardEvent) {
      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const keyLower = event.key.toLowerCase();

      // Check for shortcut: Cmd+Shift+E (Mac) or Ctrl+Shift+E (Windows/Linux)
      const modifierPressed = isMac
        ? event.metaKey && event.shiftKey && !event.altKey && !event.ctrlKey
        : event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey;

      if (modifierPressed && keyLower === "e") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        presentationMode.set(true);
        goto("/executive");
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
</script>

<div class="space-y-6">
  <TeamDashboardView {engineerTeamMapping} />
</div>

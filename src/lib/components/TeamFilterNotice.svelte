<script lang="ts">
  import { teamFilterStore, hasActiveFilter } from "$lib/stores/team-filter";
  import { teamsStore } from "$lib/stores/database";
  import { Info } from "lucide-svelte";

  interface Props {
    /** The granularity level this page supports (e.g., "domain", "organization") */
    level?: string;
  }

  let { level = "domain" }: Props = $props();

  const teams = $derived($teamsStore);
  const filter = $derived($teamFilterStore);
  const isFilterActive = $derived($hasActiveFilter);

  // Find the filter display name
  const filterDisplayName = $derived.by(() => {
    if (filter.teamKey) {
      const team = teams.find((t) => t.teamKey === filter.teamKey);
      return team?.teamName || filter.teamKey;
    }
    if (filter.domain) {
      return filter.domain;
    }
    return null;
  });
</script>

{#if isFilterActive && filterDisplayName}
  <div
    class="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-blue-500/10 dark:bg-blue-500/10 border border-blue-500/30 dark:border-blue-500/20 text-xs text-blue-700 dark:text-blue-400"
  >
    <Info class="w-3.5 h-3.5 shrink-0" />
    <span>
      Filtering by <span class="font-medium text-blue-800 dark:text-blue-300"
        >{filterDisplayName}</span
      >
      — this view shows {level}-level data only
    </span>
  </div>
{/if}

<script lang="ts">
  import { teamFilterStore } from "$lib/stores/team-filter";
  import { teamsStore } from "$lib/stores/database";
  import { Info } from "lucide-svelte";

  interface Props {
    /** The granularity level this page supports (e.g., "domain", "organization") */
    level?: string;
  }

  let { level = "domain" }: Props = $props();

  const teams = $derived($teamsStore);
  const selectedTeamKey = $derived($teamFilterStore);

  // Find the selected team name
  const selectedTeamName = $derived.by(() => {
    if (!selectedTeamKey) return null;
    const team = teams.find((t) => t.teamKey === selectedTeamKey);
    return team?.teamName || selectedTeamKey;
  });
</script>

{#if selectedTeamKey && selectedTeamName}
  <div
    class="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-blue-500/10 border border-blue-500/20 text-xs text-blue-400"
  >
    <Info class="w-3.5 h-3.5 shrink-0" />
    <span>
      Filtering by <span class="font-medium text-blue-300"
        >{selectedTeamName}</span
      >
      — this view shows {level}-level data only
    </span>
  </div>
{/if}

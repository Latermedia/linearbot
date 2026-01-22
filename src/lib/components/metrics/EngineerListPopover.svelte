<script lang="ts" module>
  export interface EngineerItem {
    assignee_id: string;
    assignee_name: string;
    avatar_url: string | null;
  }
</script>

<script lang="ts">
  interface Props {
    engineers: EngineerItem[];
    title: string;
    position: { x: number; y: number };
    onEngineerClick?: (engineerId: string) => void;
    onMouseEnter?: () => void;
    onMouseLeave?: () => void;
  }

  let {
    engineers,
    title,
    position,
    onEngineerClick,
    onMouseEnter,
    onMouseLeave,
  }: Props = $props();
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="fixed z-50 px-3 py-2 bg-neutral-900 border border-white/10 rounded-lg shadow-xl min-w-[200px] max-w-[280px]"
  style="left: {position.x + 12}px; top: {position.y - 8}px;"
  onmouseenter={onMouseEnter}
  onmouseleave={onMouseLeave}
>
  <div class="mb-2 text-xs font-medium text-neutral-400">{title}</div>
  <div class="space-y-1 max-h-[200px] overflow-y-auto">
    {#each engineers as engineer (engineer.assignee_id)}
      <button
        type="button"
        class="flex items-center gap-2 w-full px-2 py-1.5 text-left rounded hover:bg-white/5 transition-colors cursor-pointer"
        onclick={() => onEngineerClick?.(engineer.assignee_id)}
      >
        {#if engineer.avatar_url}
          <img src={engineer.avatar_url} alt="" class="w-5 h-5 rounded-full" />
        {:else}
          <div
            class="w-5 h-5 rounded-full bg-neutral-700 flex items-center justify-center text-[10px] text-neutral-400"
          >
            {engineer.assignee_name.charAt(0).toUpperCase()}
          </div>
        {/if}
        <span class="text-sm text-neutral-200 truncate"
          >{engineer.assignee_name}</span
        >
      </button>
    {/each}
  </div>
</div>

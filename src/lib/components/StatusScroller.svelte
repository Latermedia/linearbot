<script lang="ts">
  let {
    messages,
  }: {
    messages: string[];
  } = $props();

  // Show only the most recent message
  const currentMessage = $derived(
    messages.length > 0 ? messages[messages.length - 1] : null
  );
</script>

<div class="overflow-hidden relative h-12">
  {#if currentMessage}
    <div
      class="flex absolute inset-0 items-end text-xs truncate text-black-500"
    >
      {currentMessage}
    </div>
  {/if}
</div>

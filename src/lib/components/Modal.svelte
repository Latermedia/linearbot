<script lang="ts">
  import { onMount } from "svelte";
  import { X } from "lucide-svelte";

  let {
    title,
    onclose,
    size = "md",
  }: {
    title: string;
    onclose: () => void;
    size?: "sm" | "md" | "lg" | "xl";
  } = $props();

  const sizeClasses = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
  };

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      onclose();
    }
  }

  function handleBackdropClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (target.classList.contains("modal-backdrop")) {
      onclose();
    }
  }

  function handleBackdropKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const target = event.target as HTMLElement;
      if (target.classList.contains("modal-backdrop")) {
        onclose();
      }
    }
  }

  onMount(() => {
    document.addEventListener("keydown", handleKeydown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeydown);
      document.body.style.overflow = "";
    };
  });
</script>

<div
  class="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/70"
  onclick={handleBackdropClick}
  onkeydown={handleBackdropKeydown}
  role="dialog"
  aria-modal="true"
  aria-labelledby="modal-title"
  tabindex="-1"
>
  <div
    class="w-full {sizeClasses[
      size
    ]} rounded-md border shadow-2xl bg-neutral-900 border-white/10 shadow-black/50 m-4"
    role="document"
  >
    <div class="p-5">
      <!-- Header -->
      <div class="flex items-center justify-between mb-5">
        <h2 id="modal-title" class="text-sm font-medium text-white">{title}</h2>
        <button
          class="text-neutral-500 hover:text-white transition-colors"
          onclick={onclose}
          aria-label="Close modal"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Content -->
      <div class="space-y-5">
        <slot />
      </div>
    </div>
  </div>
</div>

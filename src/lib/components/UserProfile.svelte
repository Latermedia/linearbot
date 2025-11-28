<script lang="ts">
  let {
    name,
    avatarUrl = null,
    size = "md",
    showName = true,
  }: {
    name: string;
    avatarUrl?: string | null;
    size?: "xs" | "sm" | "md" | "lg";
    showName?: boolean;
  } = $props();

  // Generate initials from name
  function getInitials(name: string): string {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) {
      return parts[0].substring(0, 2).toUpperCase();
    }
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  // Generate a consistent color from name
  function getColorFromName(name: string): string {
    const colors = [
      "from-violet-500 to-fuchsia-500",
      "from-cyan-500 to-blue-500",
      "from-emerald-500 to-teal-500",
      "from-amber-500 to-orange-500",
      "from-rose-500 to-pink-500",
      "from-indigo-500 to-purple-500",
      "from-lime-500 to-green-500",
      "from-sky-500 to-indigo-500",
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  const initials = $derived(getInitials(name));
  const gradientClass = $derived(getColorFromName(name));

  const sizeClasses = {
    xs: {
      avatar: "w-5 h-5",
      text: "text-[8px]",
      nameText: "text-xs text-neutral-400",
      gap: "gap-1.5",
    },
    sm: {
      avatar: "w-6 h-6",
      text: "text-[10px]",
      nameText: "text-sm text-white",
      gap: "gap-2",
    },
    md: {
      avatar: "w-8 h-8",
      text: "text-xs",
      nameText: "text-sm text-white",
      gap: "gap-2.5",
    },
    lg: {
      avatar: "w-10 h-10",
      text: "text-sm",
      nameText: "text-base text-white",
      gap: "gap-3",
    },
  };

  const classes = $derived(sizeClasses[size]);
</script>

<div class="flex items-center {classes.gap}">
  <!-- Avatar -->
  <div
    class="relative flex-shrink-0 rounded-full ring-1 shadow-md ring-white/20 shadow-black/30"
  >
    {#if avatarUrl}
      <img
        src={avatarUrl}
        alt="{name}'s avatar"
        class="{classes.avatar} rounded-full object-cover"
      />
    {:else}
      <div
        class="{classes.avatar} rounded-full bg-gradient-to-br {gradientClass} flex items-center justify-center"
      >
        <span class="{classes.text} font-medium text-white">{initials}</span>
      </div>
    {/if}
  </div>

  <!-- Name -->
  {#if showName}
    <span class="{classes.nameText} font-medium truncate">{name}</span>
  {/if}
</div>

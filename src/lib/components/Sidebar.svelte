<script lang="ts">
  import { browser } from "$app/environment";
  import { sidebarCollapsed } from "$lib/stores/sidebar";
  import {
    LayoutDashboard,
    ClipboardCheck,
    Activity,
    FolderCheck,
    TrendingUp,
    Bug,
    Target,
    Users,
    Presentation,
    Settings,
    ChevronsLeft,
    ChevronsRight,
  } from "lucide-svelte";
  import SidebarItem from "./sidebar/SidebarItem.svelte";
  import SidebarTeamFilter from "./sidebar/SidebarTeamFilter.svelte";
  import SidebarFooter from "./sidebar/SidebarFooter.svelte";

  const isCollapsed = $derived($sidebarCollapsed);

  function toggleSidebar() {
    sidebarCollapsed.toggle();
  }

  // Keyboard shortcut: Cmd/Ctrl + B
  $effect(() => {
    if (!browser) return;

    function handleKeydown(event: KeyboardEvent) {
      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const modifierPressed = isMac ? event.metaKey : event.ctrlKey;

      if (
        modifierPressed &&
        event.key.toLowerCase() === "b" &&
        !event.shiftKey &&
        !event.altKey
      ) {
        event.preventDefault();
        sidebarCollapsed.toggle();
      }
    }

    document.addEventListener("keydown", handleKeydown);
    return () => document.removeEventListener("keydown", handleKeydown);
  });
</script>

<aside
  class="flex flex-col h-full bg-[#0d0d0d] border-r border-white/10 transition-all duration-200 ease-out shrink-0"
  style="width: {isCollapsed ? '64px' : '240px'}"
>
  <!-- Logo -->
  <div
    class="flex items-center px-3 py-4 border-b border-white/5 {isCollapsed
      ? 'justify-center'
      : 'gap-2'}"
  >
    <div
      class="w-7 h-7 rounded bg-violet-600 flex items-center justify-center shrink-0"
    >
      <span class="text-white font-bold text-sm">L</span>
    </div>
    {#if !isCollapsed}
      <span class="text-white font-semibold text-sm tracking-tight"
        >LinearBot</span
      >
    {/if}
  </div>

  <!-- Team Filter -->
  <div class="px-2 py-3 border-b border-white/5">
    <SidebarTeamFilter />
  </div>

  <!-- Navigation -->
  <nav class="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
    <SidebarItem href="/" icon={LayoutDashboard} label="Overview" />
    <SidebarItem
      href="/linear-hygiene"
      icon={ClipboardCheck}
      label="Linear Hygiene"
      indent
    />
    <SidebarItem href="/wip-health" icon={Activity} label="WIP Health" indent />
    <SidebarItem
      href="/project-health"
      icon={FolderCheck}
      label="Project Health"
      indent
    />
    <SidebarItem
      href="/productivity"
      icon={TrendingUp}
      label="Productivity"
      indent
    />
    <SidebarItem href="/quality" icon={Bug} label="Quality" indent />
    <SidebarItem href="/initiatives" icon={Target} label="Initiatives" />
    <SidebarItem href="/engineers" icon={Users} label="Engineers" />
    <SidebarItem href="/executive" icon={Presentation} label="Executive" />
  </nav>

  <!-- Settings -->
  <div class="px-2 py-2 border-t border-white/5">
    <SidebarItem href="/organization" icon={Settings} label="Settings" />
  </div>

  <!-- Footer: Sync, Theme, Logout -->
  <div class="px-2 py-3 border-t border-white/5">
    <SidebarFooter />
  </div>

  <!-- Collapse Toggle - at bottom -->
  <div class="px-2 py-3 border-t border-white/5">
    <button
      type="button"
      onclick={toggleSidebar}
      class="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded transition-colors duration-150 cursor-pointer
        text-neutral-400 hover:text-white hover:bg-white/5
        {isCollapsed ? 'justify-center' : ''}"
      title={isCollapsed ? "Expand sidebar (⌘B)" : "Collapse sidebar (⌘B)"}
    >
      {#if isCollapsed}
        <ChevronsRight class="w-5 h-5 shrink-0" />
      {:else}
        <ChevronsLeft class="w-5 h-5 shrink-0" />
        <span>Collapse</span>
      {/if}
    </button>
  </div>
</aside>

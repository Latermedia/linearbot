<script lang="ts">
  import { browser } from "$app/environment";
  import { page } from "$app/stores";
  import { sidebarCollapsed } from "$lib/stores/sidebar";
  import { cubicOut, quartInOut } from "svelte/easing";
  import { tweened } from "svelte/motion";
  import { tick } from "svelte";
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
  } from "lucide-svelte";
  import SidebarItem from "./sidebar/SidebarItem.svelte";
  import SidebarTeamFilter from "./sidebar/SidebarTeamFilter.svelte";
  import SidebarFooter from "./sidebar/SidebarFooter.svelte";
  import AnimatedLogo from "./AnimatedLogo.svelte";

  const isCollapsed = $derived($sidebarCollapsed);

  // Tweened width for smooth slide animation
  const sidebarWidth = tweened(240, {
    duration: 250,
    easing: quartInOut,
  });

  // Track whether this is the initial mount to skip animation
  let isInitialMount = true;

  // Update width when collapsed state changes
  $effect(() => {
    const targetWidth = isCollapsed ? 64 : 240;
    if (isInitialMount) {
      // Skip animation on initial mount
      sidebarWidth.set(targetWidth, { duration: 0 });
      isInitialMount = false;
    } else {
      sidebarWidth.set(targetWidth);
    }
  });

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

  // Nav indicator animation
  let navRef: HTMLElement | null = $state(null);
  let indicatorInitialLoad = $state(true);

  const indicatorTop = tweened(0, { duration: 200, easing: cubicOut });
  const indicatorHeight = tweened(0, { duration: 200, easing: cubicOut });
  const indicatorOpacity = tweened(0, { duration: 150, easing: cubicOut });

  async function updateIndicator() {
    if (!navRef || !browser) return;

    await tick();

    const activeItem = navRef.querySelector(
      '[data-active="true"]'
    ) as HTMLElement;

    if (!activeItem) {
      indicatorOpacity.set(0);
      return;
    }

    const newTop = activeItem.offsetTop;
    const newHeight = activeItem.offsetHeight;

    if (indicatorInitialLoad) {
      indicatorTop.set(newTop, { duration: 0 });
      indicatorHeight.set(newHeight, { duration: 0 });
      indicatorOpacity.set(1, { duration: 0 });
      indicatorInitialLoad = false;
    } else {
      indicatorTop.set(newTop);
      indicatorHeight.set(newHeight);
      indicatorOpacity.set(1);
    }
  }

  // Update indicator when route changes
  $effect(() => {
    $page.url.pathname;
    updateIndicator();
  });

  // Also update when collapsed state changes (positions might shift)
  $effect(() => {
    isCollapsed;
    // Small delay to let the layout settle
    setTimeout(updateIndicator, 50);
  });
</script>

<aside
  class="flex flex-col h-full bg-ambient-900 dark:bg-[#0d0d0d] border-r border-black-200 dark:border-white/10 shrink-0 overflow-x-hidden"
  style="width: {$sidebarWidth}px"
>
  <!-- Logo -->
  <div class="py-4 border-b border-black-100 dark:border-white/5">
    <div class="flex items-center">
      <div class="w-16 flex justify-center shrink-0">
        <AnimatedLogo size={20} delay={150} />
      </div>
      <div
        class="overflow-hidden transition-all duration-250 ease-quart-out text-left"
        style="width: {isCollapsed ? '0' : '176px'}; opacity: {isCollapsed
          ? 0
          : 1}"
      >
        <span
          class="logo-text text-black-900 dark:text-white font-semibold text-sm tracking-tight whitespace-nowrap"
          >Laterbot</span
        >
      </div>
    </div>
  </div>

  <!-- Team Filter -->
  <div class="py-3 border-b border-black-100 dark:border-white/5">
    <SidebarTeamFilter />
  </div>

  <!-- Navigation -->
  <nav
    bind:this={navRef}
    class="relative flex-1 py-4 space-y-1 overflow-y-auto overflow-x-clip"
  >
    <!-- Sliding indicator -->
    <div
      class="absolute left-2 right-2 rounded-md bg-black-100 dark:bg-white/10 pointer-events-none z-0 transition-[left,right] duration-250"
      style="top: {$indicatorTop}px; height: {$indicatorHeight}px; opacity: {$indicatorOpacity};"
      aria-hidden="true"
    ></div>

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
    <SidebarItem href="/organization" icon={Settings} label="Settings" />
  </nav>

  <!-- Footer: Sync, Theme, Logout -->
  <div class="py-3 border-t border-black-100 dark:border-white/5">
    <SidebarFooter {isCollapsed} />
  </div>

  <!-- Collapse Toggle - at bottom -->
  <div class="py-3 border-t border-black-100 dark:border-white/5">
    <button
      type="button"
      onclick={toggleSidebar}
      class="w-full flex items-center py-2 text-sm font-medium rounded transition-colors duration-150 cursor-pointer
        text-black-600 dark:text-black-400 hover:text-black-900 dark:hover:text-white hover:bg-ambient-700 dark:hover:bg-white/5"
      title={isCollapsed ? "Expand sidebar (⌘B)" : "Collapse sidebar (⌘B)"}
    >
      <div class="w-16 flex justify-center shrink-0">
        <div
          class="w-5 h-5 transition-transform duration-250"
          style="transform: rotate({isCollapsed ? '180deg' : '0deg'})"
        >
          <ChevronsLeft class="w-5 h-5" />
        </div>
      </div>
      <div
        class="overflow-hidden transition-all duration-250 ease-quart-out text-left"
        style="width: {isCollapsed ? '0' : '176px'}; opacity: {isCollapsed
          ? 0
          : 1}"
      >
        <span class="whitespace-nowrap">Collapse</span>
      </div>
    </button>
  </div>
</aside>

<style>
  /* Quartic easing: cubic-bezier(0.76, 0, 0.24, 1) for quartInOut */
  .duration-250 {
    transition-duration: 250ms;
  }
  .ease-quart-out {
    transition-timing-function: cubic-bezier(0.25, 1, 0.5, 1);
  }

  .logo-text {
    animation: textBlurIn 0.5s cubic-bezier(0.76, 0, 0.24, 1) 0.15s both;
  }

  @keyframes textBlurIn {
    from {
      opacity: 0;
      filter: blur(10px);
    }
    to {
      opacity: 1;
      filter: blur(0px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .logo-text {
      animation: none;
    }
  }
</style>

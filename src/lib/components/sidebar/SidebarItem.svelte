<script lang="ts">
  import { page } from "$app/stores";
  import { sidebarCollapsed } from "$lib/stores/sidebar";
  import type { Component, ComponentType } from "svelte";

  interface Props {
    href: string;
    icon: ComponentType<any> | Component<any>;
    label: string;
    exactMatch?: boolean;
  }

  let { href, icon: Icon, label, exactMatch = true }: Props = $props();

  const isActive = $derived(
    exactMatch
      ? $page.url.pathname === href
      : $page.url.pathname.startsWith(href)
  );
  const isCollapsed = $derived($sidebarCollapsed);
</script>

<a
  {href}
  class="group relative flex items-center gap-3 px-3 py-2 text-sm font-medium rounded transition-colors duration-150
    {isActive
    ? 'text-white bg-white/10 border-l-2 border-violet-500 -ml-[2px] pl-[14px]'
    : 'text-neutral-400 hover:text-white hover:bg-white/5'}"
  title={isCollapsed ? label : undefined}
>
  <Icon class="w-5 h-5 shrink-0" />
  {#if !isCollapsed}
    <span class="truncate">{label}</span>
  {/if}

  <!-- Tooltip when collapsed -->
  {#if isCollapsed}
    <div
      class="absolute left-full ml-2 px-2 py-1 text-xs font-medium text-white bg-neutral-800 rounded shadow-lg
        opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 whitespace-nowrap z-50"
    >
      {label}
    </div>
  {/if}
</a>

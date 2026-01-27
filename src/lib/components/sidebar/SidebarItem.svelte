<script lang="ts">
  import { page } from "$app/stores";
  import { sidebarCollapsed } from "$lib/stores/sidebar";
  import type { Component, ComponentType } from "svelte";

  interface Props {
    href: string;
    icon: ComponentType<any> | Component<any>;
    label: string;
    exactMatch?: boolean;
    indent?: boolean;
  }

  let {
    href,
    icon: Icon,
    label,
    exactMatch = true,
    indent = false,
  }: Props = $props();

  const isActive = $derived(
    exactMatch
      ? $page.url.pathname === href
      : $page.url.pathname.startsWith(href)
  );
  const isCollapsed = $derived($sidebarCollapsed);
</script>

<a
  {href}
  class="group relative flex items-center gap-3 py-2 text-sm font-medium rounded transition-colors duration-150
    {indent && !isCollapsed ? 'pl-9 pr-3' : 'px-3'}
    {isActive
    ? 'text-brand-800 dark:text-white bg-brand-100 dark:bg-white/10 border-l-2 border-brand-500 -ml-[2px] pl-[14px]'
    : 'text-black-600 dark:text-black-400 hover:text-black-900 dark:hover:text-white hover:bg-black-100 dark:hover:bg-white/5'}
    {isActive && indent && !isCollapsed ? 'pl-[34px]' : ''}"
  title={isCollapsed ? label : undefined}
>
  <Icon class="{indent ? 'w-4 h-4' : 'w-5 h-5'} shrink-0" />
  {#if !isCollapsed}
    <span class="truncate">{label}</span>
  {/if}

  <!-- Tooltip when collapsed -->
  {#if isCollapsed}
    <div
      class="absolute left-full ml-2 px-2 py-1 text-xs font-medium text-white bg-black-800 rounded shadow-lg
        opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 whitespace-nowrap z-50"
    >
      {label}
    </div>
  {/if}
</a>

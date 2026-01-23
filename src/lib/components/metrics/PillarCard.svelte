<script lang="ts">
  import { onMount } from "svelte";
  import Card from "$lib/components/Card.svelte";
  import Badge from "$lib/components/Badge.svelte";
  import TrendChip from "./TrendChip.svelte";
  import type { TrendResult } from "$lib/utils/trend-calculation";

  interface DetailLine {
    /** Unique identifier for this detail line (used for hover callbacks) */
    id?: string;
    label: string;
    value: string | number;
    /** Secondary value shown between value and label (e.g., count in parens) */
    secondaryValue?: string;
    highlight?: boolean;
  }

  interface TwoColumnDetails {
    left?: {
      header: string;
      items: DetailLine[];
    };
    right?: {
      header: string;
      items: DetailLine[];
    };
  }

  interface SubtitleInfo {
    /** LaTeX formula to render (optional) */
    formula?: string;
    /** Lines of content to show in the tooltip (supports basic text) */
    content: string[];
  }

  // KaTeX for rendering math formulas
  let katex: typeof import("katex") | null = null;
  onMount(async () => {
    katex = await import("katex");
  });

  function renderFormula(formula: string): string {
    if (!katex) return formula;
    try {
      return katex.default.renderToString(formula, {
        throwOnError: false,
        displayMode: true,
      });
    } catch {
      return formula;
    }
  }

  interface Props {
    title: string;
    value: string | number;
    /** Optional unit displayed inline after value with smaller styling */
    valueUnit?: string;
    subtitle?: string;
    /** Optional info tooltip for the subtitle - shows (i) icon with hover content */
    subtitleInfo?: SubtitleInfo;
    /** Standard list-style details */
    details?: DetailLine[];
    /** Two-column layout for details (e.g., Self-reported vs Trajectory) */
    twoColumnDetails?: TwoColumnDetails;
    /** Message when there are no issues */
    noIssuesMessage?: string;
    underConstruction?: boolean;
    onClick?: () => void;
    /** Callback when hovering over a detail line (null when mouse leaves) */
    onDetailHover?: (detailId: string | null, event: MouseEvent | null) => void;
    /** Week trend data */
    weekTrend?: TrendResult | null;
    /** Month trend data */
    monthTrend?: TrendResult | null;
    /** Whether higher values are better for this metric (for trend color) */
    higherIsBetter?: boolean;
  }

  let {
    title,
    value,
    valueUnit,
    subtitle,
    subtitleInfo,
    details = [],
    twoColumnDetails,
    noIssuesMessage,
    underConstruction = false,
    onClick,
    onDetailHover,
    weekTrend = null,
    monthTrend = null,
    higherIsBetter = true,
  }: Props = $props();

  // Info tooltip hover state
  let showInfoTooltip = $state(false);
  let infoTooltipPosition = $state({ x: 0, y: 0, alignRight: false });

  const TOOLTIP_WIDTH = 380; // max-width of tooltip
  const VIEWPORT_PADDING = 16; // padding from edge of viewport

  function handleInfoMouseEnter(event: MouseEvent) {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const viewportWidth = window.innerWidth;

    // Check if tooltip would overflow right edge
    const wouldOverflowRight =
      rect.left + TOOLTIP_WIDTH > viewportWidth - VIEWPORT_PADDING;

    if (wouldOverflowRight) {
      // Align tooltip to right edge of viewport with padding
      infoTooltipPosition = {
        x: viewportWidth - TOOLTIP_WIDTH - VIEWPORT_PADDING,
        y: rect.bottom + 8,
        alignRight: true,
      };
    } else {
      infoTooltipPosition = {
        x: rect.left,
        y: rect.bottom + 8,
        alignRight: false,
      };
    }
    showInfoTooltip = true;
  }

  function handleInfoMouseLeave() {
    showInfoTooltip = false;
  }

  function handleDetailMouseEnter(
    detailId: string | undefined,
    event: MouseEvent
  ) {
    if (detailId && onDetailHover) {
      onDetailHover(detailId, event);
    }
  }

  function handleDetailMouseLeave() {
    onDetailHover?.(null, null);
  }

  // Check if two-column details has any content
  const hasTwoColumnContent = $derived(
    (twoColumnDetails?.left?.items?.length ?? 0) > 0 ||
      (twoColumnDetails?.right?.items?.length ?? 0) > 0
  );
</script>

<Card
  class="transition-colors duration-150 border {underConstruction
    ? 'border-neutral-700/50 opacity-60 cursor-not-allowed'
    : 'hover:bg-white/5 border-white/10'}"
>
  <button
    type="button"
    class="w-full text-left cursor-pointer disabled:cursor-not-allowed"
    onclick={onClick}
    disabled={underConstruction || !onClick}
  >
    <div class="flex justify-between items-start mb-3">
      <div class="text-xs font-medium tracking-wide uppercase text-neutral-400">
        {title}
      </div>
      {#if underConstruction}
        <Badge variant="outline">
          <span class="flex items-center gap-1">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="w-3 h-3"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fill-rule="evenodd"
                d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
                clip-rule="evenodd"
              />
            </svg>
            TBD
          </span>
        </Badge>
      {/if}
    </div>

    <div class="space-y-3">
      <div>
        {#if underConstruction}
          <div class="text-2xl font-semibold text-neutral-500">—</div>
          <div class="text-xs text-neutral-500">GetDX mapping pending</div>
        {:else}
          <div class="flex items-center gap-2">
            <span class="text-2xl font-semibold text-neutral-200">
              {value}{#if valueUnit}<span
                  class="text-sm font-normal text-neutral-400">{valueUnit}</span
                >{/if}
            </span>
            {#if weekTrend?.hasEnoughData}
              <TrendChip
                direction={weekTrend.direction}
                percentChange={weekTrend.percentChange}
                period="{weekTrend.actualDays ?? 7}d"
                {higherIsBetter}
              />
            {/if}
            {#if monthTrend?.hasEnoughData}
              <TrendChip
                direction={monthTrend.direction}
                percentChange={monthTrend.percentChange}
                period="{monthTrend.actualDays ?? 30}d"
                {higherIsBetter}
              />
            {/if}
          </div>
          {#if subtitle}
            <div class="flex gap-1 items-center text-xs text-neutral-500">
              <span>{subtitle}</span>
              {#if subtitleInfo}
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <span
                  class="inline-flex justify-center items-center w-3.5 h-3.5 text-[9px] font-medium rounded-full border cursor-help text-neutral-400 border-neutral-600 hover:text-neutral-300 hover:border-neutral-500 transition-colors"
                  onmouseenter={handleInfoMouseEnter}
                  onmouseleave={handleInfoMouseLeave}
                >
                  i
                </span>
              {/if}
            </div>
          {/if}
        {/if}
      </div>

      {#if twoColumnDetails && !underConstruction}
        <!-- Two-column layout for details -->
        {#if hasTwoColumnContent}
          <div class="flex justify-between text-xs">
            {#if twoColumnDetails.left && twoColumnDetails.left.items.length > 0}
              <div class="space-y-0.5">
                <div
                  class="text-neutral-500 text-[10px] uppercase tracking-wider"
                >
                  {twoColumnDetails.left.header}
                </div>
                {#each twoColumnDetails.left.items as item (item.label)}
                  <div>
                    <span class="font-semibold text-neutral-400"
                      >{item.value}</span
                    >
                    <span class="text-neutral-500">{item.label}</span>
                  </div>
                {/each}
              </div>
            {/if}
            {#if twoColumnDetails.right && twoColumnDetails.right.items.length > 0}
              <div class="space-y-0.5">
                <div
                  class="text-neutral-500 text-[10px] uppercase tracking-wider"
                >
                  {twoColumnDetails.right.header}
                </div>
                {#each twoColumnDetails.right.items as item (item.label)}
                  <div>
                    <span class="font-semibold text-neutral-400"
                      >{item.value}</span
                    >
                    <span class="text-neutral-500">{item.label}</span>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {:else if noIssuesMessage}
          <div class="text-xs text-neutral-500">{noIssuesMessage}</div>
        {/if}
      {:else if details.length > 0 && !underConstruction}
        <!-- Standard list layout for details -->
        <div class="space-y-0.5 text-xs">
          {#each details as detail (detail.label)}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class={detail.id && onDetailHover
                ? "cursor-pointer hover:text-neutral-300 transition-colors"
                : ""}
              onmouseenter={(e) => handleDetailMouseEnter(detail.id, e)}
              onmouseleave={handleDetailMouseLeave}
            >
              <span class="font-semibold text-neutral-400">{detail.value}</span
              >{#if detail.secondaryValue}<span class="text-neutral-400/50"
                  >{detail.secondaryValue}</span
                >{/if}<span class="text-neutral-500">{detail.label}</span>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </button>
</Card>

<!-- Info tooltip -->
{#if showInfoTooltip && subtitleInfo}
  <div
    class="fixed z-50 px-4 py-3 text-xs rounded-md border shadow-lg pointer-events-none bg-neutral-900 border-neutral-700 max-w-[380px]"
    style="left: {infoTooltipPosition.x}px; top: {infoTooltipPosition.y}px;"
  >
    <div class="space-y-3">
      {#if subtitleInfo.formula}
        <div class="py-2 text-center formula-container">
          <!-- eslint-disable-next-line svelte/no-at-html-tags -->
          {@html renderFormula(subtitleInfo.formula)}
        </div>
      {/if}
      {#each subtitleInfo.content as line}
        <p class="text-neutral-300 leading-relaxed">{line}</p>
      {/each}
    </div>
  </div>
{/if}

<style>
  /* KaTeX formula styling */
  .formula-container :global(.katex) {
    font-size: 1.1em;
    color: #e5e5e5;
  }
  .formula-container :global(.katex-display) {
    margin: 0;
  }
</style>

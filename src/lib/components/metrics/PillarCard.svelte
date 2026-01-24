<script lang="ts">
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
    /** The "why" - punchy principle statement */
    why: string;
    /** The "how" - plain English explanation lines */
    how: string[];
    /** LaTeX formula to render (optional, shown at bottom for curious users) */
    formula?: string;
  }

  interface Props {
    title: string;
    value: string | number;
    /** Optional unit displayed inline after value with smaller styling */
    valueUnit?: string;
    subtitle?: string;
    /** Health status for the indicator dot */
    status?: "healthy" | "warning" | "critical" | "unknown" | "pending";
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
    /** Display variant: default card style or hero marquee style */
    variant?: "default" | "hero";
  }

  let {
    title,
    value,
    valueUnit,
    subtitle,
    status,
    subtitleInfo: _subtitleInfo,
    details = [],
    twoColumnDetails,
    noIssuesMessage,
    underConstruction = false,
    onClick,
    onDetailHover,
    weekTrend = null,
    monthTrend = null,
    higherIsBetter = true,
    variant = "default",
  }: Props = $props();

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

{#if variant === "hero"}
  <!-- Hero/Marquee variant - larger centered display -->
  <Card
    class="transition-colors duration-150 border {underConstruction
      ? 'border-neutral-700/50 opacity-60 cursor-not-allowed'
      : 'hover:bg-white/5 border-white/10'}"
  >
    <button
      type="button"
      class="w-full cursor-pointer disabled:cursor-not-allowed py-4"
      onclick={onClick}
      disabled={underConstruction || !onClick}
    >
      <!-- Title label -->
      <div
        class="text-xs font-medium tracking-wide uppercase text-neutral-400 text-center mb-3"
      >
        {title}
        {#if underConstruction}
          <Badge variant="outline" class="ml-2">
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

      <!-- Large metric value -->
      {#if underConstruction}
        <div
          class="text-5xl lg:text-6xl font-bold text-neutral-500 text-center tracking-tight"
        >
          —
        </div>
        <div class="text-sm text-neutral-500 text-center mt-2">
          GetDX mapping pending
        </div>
      {:else}
        <div class="text-center">
          <span
            class="text-5xl lg:text-6xl font-bold text-white tracking-tight"
          >
            {value}{#if valueUnit}<span
                class="text-2xl font-normal text-neutral-400">{valueUnit}</span
              >{/if}
          </span>
        </div>

        <!-- Subtitle -->
        {#if subtitle}
          <p class="text-sm text-neutral-400 text-center mt-2">
            {subtitle}
          </p>
        {/if}

        <!-- Status badge -->
        {#if status}
          <div class="flex justify-center mt-2">
            <span
              class="text-xs font-medium px-2 py-0.5 rounded {status ===
              'healthy'
                ? 'bg-emerald-500/20 text-emerald-400'
                : status === 'warning'
                  ? 'bg-amber-500/20 text-amber-400'
                  : status === 'critical'
                    ? 'bg-red-500/20 text-red-400'
                    : 'bg-neutral-500/20 text-neutral-400'}"
            >
              {status === "healthy"
                ? "Healthy"
                : status === "warning"
                  ? "Warning"
                  : status === "critical"
                    ? "Critical"
                    : "Unknown"}
            </span>
          </div>
        {/if}
      {/if}
    </button>
  </Card>
{:else}
  <!-- Default card variant -->
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
        <div
          class="flex items-center gap-2 text-xs font-medium tracking-wide uppercase text-neutral-400"
        >
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
                    class="text-sm font-normal text-neutral-400"
                    >{valueUnit}</span
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
            <div class="flex items-center gap-2">
              {#if subtitle}
                <span class="text-xs text-neutral-500">{subtitle}</span>
              {/if}
              {#if status && !underConstruction}
                <span
                  class="text-[10px] font-medium px-1.5 py-0.5 rounded {status ===
                  'healthy'
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : status === 'warning'
                      ? 'bg-amber-500/20 text-amber-400'
                      : status === 'critical'
                        ? 'bg-red-500/20 text-red-400'
                        : 'bg-neutral-500/20 text-neutral-400'}"
                >
                  {status === "healthy"
                    ? "Healthy"
                    : status === "warning"
                      ? "Warning"
                      : status === "critical"
                        ? "Critical"
                        : "Unknown"}
                </span>
              {/if}
            </div>
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
                <span class="font-semibold text-neutral-400"
                  >{detail.value}</span
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
{/if}

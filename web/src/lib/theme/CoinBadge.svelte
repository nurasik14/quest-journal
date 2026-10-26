<!--
  CoinBadge: silver-tael balance (or a price). When `amount` changes while
  mounted, a "+20" / "−150" chip floats up and a polite live region announces
  it. Negative balances show neutrally (no red, no guilt: motivation §3.7).
  The ingot is an inline SVG icon (UI), not decoration.
-->
<script lang="ts">
  interface Props {
    amount: number;
    size?: 'sm' | 'md' | 'lg';
    /** Unit for screen readers / optional visible unit */
    label?: string;
    /** Show the unit visibly ("120 taels") */
    showUnit?: boolean;
    /** Float a delta chip + announce when amount changes (default true) */
    showDelta?: boolean;
    /** price = a cost tag in the market; balance = the wallet */
    kind?: 'balance' | 'price' | 'reward';
    /** Dim when unaffordable etc. (text stays AA) */
    muted?: boolean;
    /**
     * Live-region sentence when `amount` changes (M5, designer-AC4, pre-approved): omitted → the default
     * "Earned/Spent N…" text; a string → that sentence; null → silent (the parent announces the event itself).
     */
    announce?: string | null;
    class?: string;
  }

  let {
    amount,
    size = 'md',
    label = 'silver taels',
    showUnit = false,
    showDelta = true,
    kind = 'balance',
    muted = false,
    announce: announceText,
    class: className = ''
  }: Props = $props();

  const nf = new Intl.NumberFormat('en');
  const fmt = (n: number) => (n < 0 ? '−' : '') + nf.format(Math.abs(n));

  let delta = $state<number | null>(null);
  let deltaKey = $state(0);
  let announce = $state('');
  let prev: number | undefined;

  $effect(() => {
    const a = amount;
    if (prev !== undefined && a !== prev && showDelta) {
      delta = a - prev;
      deltaKey++;
      announce =
        announceText === undefined
          ? `${delta > 0 ? 'Earned' : 'Spent'} ${nf.format(Math.abs(delta))} ${label}. Balance ${fmt(a)}.`
          : (announceText ?? '');
    }
    prev = a;
  });
</script>

<span class={['qj-coin', className]} data-size={size} data-kind={kind} class:muted>
  <svg class="ingot" viewBox="0 0 48 32" aria-hidden="true" focusable="false">
    <path class="body" d="M2 12c4 1 8 3 12 3h20c4 0 8-2 12-3-1 9-9 16-22 16S3 21 2 12Z" />
    <path class="dome" d="M14 16c0-7 4.5-11.5 10-11.5S34 9 34 16c-3 1-6.5 1.5-10 1.5S17 17 14 16Z" />
    <path class="wing" d="M1 9c3 0 6 1 9 4l-8 1zM47 9c-3 0-6 1-9 4l8 1z" />
    <path class="shine" d="M19 11c1-3 4-4.5 6-4" />
  </svg>
  <span class="num">{fmt(amount)}</span>
  {#if showUnit}<span class="unit" aria-hidden="true">taels</span>{/if}
  <span class="qj-sr-only">{label}</span>
  {#if delta !== null}
    {#key deltaKey}
      <span class="delta" data-sign={delta > 0 ? 'up' : 'down'} aria-hidden="true">
        {delta > 0 ? '+' : '−'}{nf.format(Math.abs(delta))}
      </span>
    {/key}
  {/if}
  {#if showDelta && announceText !== null}<span class="qj-sr-only" aria-live="polite">{announce}</span>{/if}
</span>

<style>
  .qj-coin {
    --_h: 2.25rem;
    --_icon: 1.35rem;
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    min-height: var(--_h);
    padding: 0 var(--sp-3) 0 var(--sp-2);
    border-radius: var(--r-pill);
    border: var(--bw-hair) solid color-mix(in srgb, var(--coin) 65%, transparent);
    background: var(--coin-soft);
    color: var(--coin-ink);
    font-family: var(--font-body);
    font-weight: var(--fw-bold);
    font-variant-numeric: tabular-nums lining-nums;
    line-height: 1;
    white-space: nowrap;
  }
  .qj-coin[data-size='sm'] {
    --_h: 1.75rem;
    --_icon: 1.05rem;
    padding: 0 var(--sp-2) 0 var(--sp-1);
    font-size: var(--fs-sm);
  }
  .qj-coin[data-size='lg'] {
    --_h: 3rem;
    --_icon: 2rem;
    padding: 0 var(--sp-4) 0 var(--sp-3);
    font-size: var(--fs-lg);
    font-family: var(--font-display);
  }
  .qj-coin[data-kind='price'] {
    background: transparent;
  }
  .qj-coin[data-kind='reward'] {
    background: transparent;
    border-color: transparent;
    padding-inline: 0;
  }
  .qj-coin.muted {
    color: var(--ink-muted);
    border-color: var(--line);
    background: var(--surface-sunk);
  }

  .ingot {
    width: var(--_icon);
    height: auto;
    flex: none;
    overflow: visible;
  }
  .ingot .body { fill: var(--coin); stroke: var(--coin-edge); stroke-width: 1.2; }
  .ingot .dome { fill: color-mix(in srgb, var(--coin) 80%, #fff); stroke: var(--coin-edge); stroke-width: 1.2; }
  .ingot .wing { fill: var(--coin-edge); }
  .ingot .shine { fill: none; stroke: #fff; stroke-width: 1.6; stroke-linecap: round; opacity: 0.7; }
  .muted .ingot { filter: grayscale(0.8); opacity: 0.7; }

  .unit {
    font-weight: var(--fw-regular);
    font-size: 0.85em;
  }

  .delta {
    position: absolute;
    right: 0;
    top: -0.25rem;
    padding: 2px var(--sp-2);
    border-radius: var(--r-pill);
    background: var(--surface);
    border: 1px solid var(--coin);
    color: var(--coin-ink);
    font-size: var(--fs-sm);
    pointer-events: none;
    animation: float-away 1400ms var(--ease-out) both;
  }
  .delta[data-sign='down'] {
    color: var(--ink-muted);
    border-color: var(--line-strong);
  }
  @keyframes float-away {
    0% { opacity: 0; transform: translateY(6px) scale(0.9); }
    15% { opacity: 1; transform: translateY(-4px) scale(1); }
    70% { opacity: 1; }
    100% { opacity: 0; transform: translateY(-22px); }
  }
  @media (prefers-reduced-motion: reduce) {
    .delta {
      animation: hold-then-hide 1600ms steps(1, end) both;
    }
  }
  @keyframes hold-then-hide {
    0% { opacity: 1; transform: translateY(-110%); }
    100% { opacity: 0; transform: translateY(-110%); }
  }
</style>

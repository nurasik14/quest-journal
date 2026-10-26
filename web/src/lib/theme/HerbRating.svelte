<!--
  HerbRating: satisfaction 1–10 as leaves on a herb stem (Evening ledger).
  Leaves alternate above/below the stem so 10 targets (≈60×48px each) fit a
  328px phone column. Native radios underneath: arrow keys, screen readers
  and form semantics come for free. The anchor sentence for the chosen value
  is shown below (motivation §5.3). Rating colour never changes with the
  value: a low day isn't "bad" UI.
-->
<script lang="ts">
  import { RATING_ANCHORS } from './vocab';

  interface Props {
    value?: number | null;
    max?: number;
    name?: string;
    legend?: string;
    /** Visually hide the legend (keep it for screen readers) */
    hideLegend?: boolean;
    anchors?: readonly string[];
    showAnchor?: boolean;
    readonly?: boolean;
    required?: boolean;
    size?: 'md' | 'sm';
    onchange?: (value: number) => void;
    class?: string;
  }

  const nextId = () => `qj-herb-${Math.random().toString(36).slice(2, 10)}`;

  let {
    value = $bindable(null),
    max = 10,
    name = nextId(),
    legend = 'How was today, overall?',
    hideLegend = false,
    anchors = RATING_ANCHORS,
    showAnchor = true,
    readonly = false,
    required = false,
    size = 'md',
    onchange,
    class: className = ''
  }: Props = $props();

  let preview = $state<number | null>(null);
  const shown = $derived(preview ?? value ?? 0);
  const leaves = $derived(Array.from({ length: max }, (_, i) => i + 1));

  /* Read-only (sheet, month-ago card): one image with one label, not a 10-item disabled radio group (M6 fix 1, NIT-1). */
  const readonlyLabel = $derived(
    value ? `${legend}: ${value} of ${max}${anchors[value - 1] ? `, ${anchors[value - 1]}` : ''}` : `${legend}: not rated`
  );

  function pick(n: number) {
    if (readonly) return;
    value = n;
    onchange?.(n);
  }
</script>

<fieldset
  class={['qj-herb', className]}
  data-size={size}
  disabled={readonly}
  role={readonly ? 'img' : undefined}
  aria-label={readonly ? readonlyLabel : undefined}
>
  <legend class={hideLegend ? 'qj-sr-only' : 'legend'} aria-hidden={readonly ? 'true' : undefined}>{legend}</legend>
  <div class="branch" aria-hidden={readonly ? 'true' : undefined} style:grid-template-columns="repeat({max + 1}, minmax(0, 1fr))">
    <span class="stem" aria-hidden="true"></span>
    {#each leaves as n (n)}
      <label
        class="leaf"
        class:filled={shown >= n}
        class:current={value === n}
        data-side={n % 2 === 1 ? 'up' : 'down'}
        style:--n={n}
        onpointerenter={(e) => {
          if (e.pointerType === 'mouse' && !readonly) preview = n;
        }}
        onpointerleave={() => (preview = null)}
      >
        <input
          type="radio"
          class="qj-sr-only"
          {name}
          value={n}
          checked={value === n}
          {required}
          tabindex={readonly ? -1 : undefined}
          onchange={() => pick(n)}
        />
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path class="blade" d="M4 20C3 12 7 4 21 3c0 14-8 18-17 17Z" />
          <path class="vein" d="M5 19 18 6M10 14l-.5-4M10 14l4 .5M13.5 10.5 13 7M13.5 10.5l3.5.5" />
        </svg>
        <span class="qj-sr-only">{n} of {max}{anchors[n - 1] ? `: ${anchors[n - 1]}` : ''}</span>
      </label>
    {/each}
  </div>
  {#if showAnchor}
    <p class="anchor" aria-live={readonly ? undefined : 'polite'} aria-hidden={readonly ? 'true' : undefined}>
      {#if shown}
        <strong class="score">{shown}<span class="of">/{max}</span></strong>
        <span class="text">{anchors[shown - 1] ?? ''}</span>
      {:else}
        <span class="text hint">Tap a leaf. Only this is required.</span>
      {/if}
    </p>
  {/if}
</fieldset>

<style>
  .qj-herb {
    --_row: 48px;
    margin: 0;
    padding: 0;
    border: 0;
    min-width: 0;
    display: grid;
    gap: var(--sp-2);
  }
  .qj-herb[data-size='sm'] {
    --_row: 30px;
  }
  .legend {
    padding: 0;
    margin-bottom: var(--sp-2);
    font-family: var(--font-display);
    font-weight: var(--fw-display);
    font-size: var(--fs-md);
    color: var(--ink);
  }
  .branch {
    position: relative;
    display: grid;
    grid-template-rows: var(--_row) var(--_row);
    max-width: 30rem;
  }
  .stem {
    position: absolute;
    left: 2%;
    right: 0;
    top: 50%;
    height: 3px;
    translate: 0 -50%;
    border-radius: var(--r-pill);
    background: linear-gradient(90deg, var(--rod), color-mix(in srgb, var(--jade) 70%, var(--rod)));
    pointer-events: none;
  }
  .stem::before {
    /* the cut end of the stem */
    content: '';
    position: absolute;
    left: -4px;
    top: 50%;
    width: 7px;
    height: 7px;
    translate: 0 -50%;
    border-radius: 50%;
    background: var(--rod);
  }
  .leaf {
    position: relative;
    grid-column: var(--n) / span 2;
    display: grid;
    place-items: center;
    cursor: pointer;
    border-radius: var(--r-md);
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
  }
  .leaf[data-side='up'] {
    grid-row: 1;
    align-items: end;
  }
  .leaf[data-side='down'] {
    grid-row: 2;
    align-items: start;
  }
  svg {
    width: min(100%, calc(var(--_row) * 0.95));
    height: auto;
    overflow: visible;
    transition:
      transform var(--dur-base) var(--ease-stamp),
      filter var(--dur-base) var(--ease-out);
  }
  .leaf[data-side='up'] svg {
    transform-origin: 15% 85%;
    rotate: -8deg;
  }
  .leaf[data-side='down'] svg {
    transform-origin: 15% 15%;
    scale: 1 -1;
    rotate: 8deg;
  }
  .blade {
    fill: transparent;
    stroke: var(--line-strong);
    stroke-width: 1.4;
    transition: fill var(--dur-fast) var(--ease-out);
  }
  .vein {
    fill: none;
    stroke: var(--line-strong);
    stroke-width: 1;
    stroke-linecap: round;
  }
  .filled .blade {
    fill: var(--jade);
    stroke: color-mix(in srgb, var(--jade) 70%, #000);
  }
  .filled .vein {
    stroke: var(--surface);
    opacity: 0.8;
  }
  .current svg {
    transform: scale(1.12);
    filter: drop-shadow(0 2px 3px rgb(0 0 0 / 0.2));
  }
  .leaf:has(input:focus-visible) {
    outline: 3px solid var(--focus-ring);
    outline-offset: -2px;
  }
  fieldset:disabled .leaf {
    cursor: default;
  }

  .anchor {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
    min-height: 1.6em;
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-sm);
    line-height: var(--lh-snug);
  }
  .score {
    font-family: var(--font-display);
    font-size: var(--fs-lg);
    color: var(--accent-ink);
    font-variant-numeric: tabular-nums;
  }
  .of {
    font-size: var(--fs-sm);
    color: var(--ink-muted);
  }
  .hint {
    color: var(--ink-muted);
  }
</style>

<!--
  LanternScale (name kept for API stability): the morning check-in, written as a pulse reading.
  Five ruled columns numbered 一 to 五 in brush; the columns up to the chosen reading fill with a
  vermilion wash, the chosen one is inked solid like a seal. Native radios underneath (arrow keys
  work); the English label for the chosen value ("Weak pulse", "Steady"…) is shown and announced.
-->
<script lang="ts">
  import { kanjiNumber } from './folio';
  import { ENERGY_LABELS } from './vocab';

  interface Props {
    value?: number | null;
    name?: string;
    legend?: string;
    hideLegend?: boolean;
    labels?: readonly string[];
    disabled?: boolean;
    onchange?: (value: number) => void;
    class?: string;
  }

  let {
    value = $bindable(null),
    name = `qj-energy-${Math.random().toString(36).slice(2, 10)}`,
    legend = 'How much energy do you have today?',
    hideLegend = false,
    labels = ENERGY_LABELS,
    disabled = false,
    onchange,
    class: className = ''
  }: Props = $props();

  const levels = [1, 2, 3, 4, 5];
</script>

<fieldset class={['qj-pulse', className]} {disabled}>
  <legend class={hideLegend ? 'qj-sr-only' : 'legend'}>{legend}</legend>
  <div class="row">
    {#each levels as n (n)}
      <label class="cell" class:filled={(value ?? 0) >= n} class:current={value === n}>
        <input
          type="radio"
          class="qj-sr-only"
          {name}
          value={n}
          checked={value === n}
          onchange={() => {
            value = n;
            onchange?.(n);
          }}
        />
        <span class="num qj-brush" aria-hidden="true">{kanjiNumber(n)}</span>
        <span class="arabic" aria-hidden="true">{n}</span>
        <span class="qj-sr-only">{n}: {labels[n - 1] ?? ''}</span>
      </label>
    {/each}
  </div>
  <p class="label" aria-live="polite">
    {#if value}<strong>{labels[value - 1]}</strong>{:else}<span class="hint">Take today's pulse: one is bedridden, five is ready to taste poison.</span>{/if}
  </p>
</fieldset>

<style>
  .qj-pulse {
    margin: 0;
    padding: 0;
    border: 0;
    min-width: 0;
    display: grid;
    gap: var(--sp-2);
  }
  .legend {
    padding: 0;
    margin-bottom: var(--sp-2);
    font-family: var(--font-display);
    font-weight: var(--fw-display);
    font-size: var(--fs-md);
  }
  /* five ruled columns, like the 界行 of a ledger page */
  .row {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    max-width: 22rem;
    border: 2px solid var(--rule);
    outline: 1px solid var(--rule);
    outline-offset: -5px;
    padding: 4px;
    background: var(--surface);
  }
  .cell {
    position: relative;
    display: grid;
    justify-items: center;
    align-content: center;
    gap: var(--sp-1);
    min-height: 88px;
    cursor: pointer;
    color: var(--ink);
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
    transition: background-color var(--dur-base) var(--ease-out), color var(--dur-base) var(--ease-out);
  }
  .cell + .cell {
    border-left: 1px solid var(--rule);
  }
  .num {
    font-size: 1.6rem;
    min-height: 1.6rem;
  }
  .arabic {
    font-size: var(--fs-xs);
    font-variant-numeric: tabular-nums;
    color: var(--ink-muted);
  }
  .filled {
    background: var(--seal-soft);
  }
  .current {
    background: var(--seal);
    color: var(--on-seal);
  }
  .current .arabic {
    color: var(--on-seal);
  }
  .current .num {
    animation: stamp 260ms var(--ease-stamp) both;
  }
  @keyframes stamp {
    from { transform: scale(1.35); opacity: 0.4; }
    to { transform: none; opacity: 1; }
  }
  .cell:has(input:focus-visible) {
    outline: 3px solid var(--focus-ring);
    outline-offset: 1px;
    z-index: 1;
  }
  fieldset:disabled .cell {
    cursor: default;
  }
  .label {
    margin: 0;
    min-height: 1.6em;
    font-family: var(--font-display);
    font-size: var(--fs-md);
    color: var(--ink);
  }
  .hint {
    font-family: var(--font-body);
    font-size: var(--fs-sm);
    color: var(--ink-muted);
  }
  @media (prefers-reduced-motion: reduce) {
    .current .num {
      animation: none;
    }
  }
  :global(:root[data-motion='reduce']) .current .num {
    animation: none;
  }
</style>

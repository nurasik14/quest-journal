<!--
  LatticeFrame (name kept for API stability): the 四周雙邊 border of a woodblock page, a thick outer
  rule and a thin inner one, around content that matters on its own (the day's rating, the notes on
  you). Ruling only, no photo: the frame marks a place to write, the way the printed border on a ledger
  page does. `pattern` picks the ink: ice = vermilion (default), floral/tiles = Maomao's jade,
  beams = Jinshi's violet.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';

  type Pattern = 'ice' | 'floral' | 'tiles' | 'beams';

  interface Props extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
    pattern?: Pattern;
    /** Outer rule thickness */
    weight?: 'thin' | 'regular' | 'thick';
    /** Inner padding */
    inset?: 'none' | 'sm' | 'md';
    children?: Snippet;
  }

  let {
    pattern = 'ice',
    weight = 'regular',
    inset = 'md',
    children,
    class: className,
    ...rest
  }: Props = $props();
</script>

<div {...rest} class={['qj-lattice', className]} data-pattern={pattern} data-weight={weight} data-inset={inset}>
  {@render children?.()}
</div>

<style>
  .qj-lattice {
    --_rule: var(--rule);
    --_bw: 2px;
    --_pad: var(--sp-4);
    position: relative;
    box-sizing: border-box;
    padding: calc(var(--_pad) + 5px);
    background: var(--surface);
    border: var(--_bw) solid var(--_rule);
    border-radius: var(--r-xs);
    box-shadow: var(--shadow-2);
  }
  .qj-lattice::after {
    content: '';
    position: absolute;
    inset: 4px;
    border: 1px solid var(--_rule);
    pointer-events: none;
  }
  .qj-lattice[data-pattern='floral'],
  .qj-lattice[data-pattern='tiles'] {
    --_rule: var(--jade);
  }
  .qj-lattice[data-pattern='beams'] {
    --_rule: var(--boss);
  }
  .qj-lattice[data-weight='thin'] { --_bw: 1px; }
  .qj-lattice[data-weight='thick'] { --_bw: 3px; }
  .qj-lattice[data-inset='none'] { --_pad: 0; }
  .qj-lattice[data-inset='sm'] { --_pad: var(--sp-2); }
</style>

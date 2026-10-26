<!--
  ScrollCard: a loose leaf laid into the notebook (the name is kept for API stability).
    default  a fresh slip of paper with a hairline edge
    boss     Jinshi's commission: violet double rule (四周雙邊) and, with `rods`, the silk cord it came tied with
    quiet    a sunk, dashed placeholder (loading ghosts, offline, gentle notes)
    alert    a vermilion edge for "this didn't work" (never for the user's own failures)
  `band` lays a strip of a real painting across the top. `unroll` inks the leaf in once on mount
  (reduced motion: a plain fade).
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';

  type Variant = 'default' | 'boss' | 'quiet' | 'alert';

  interface Props extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
    variant?: Variant;
    /** Ink the leaf in on mount */
    unroll?: boolean;
    /** Boss only: the silk cord the commission is tied with */
    rods?: boolean;
    tag?: 'section' | 'article' | 'div' | 'li' | 'aside';
    /** Painting strip across the top: a CSS image value such as "var(--qj-img-band-evening)". */
    band?: string | false;
    heading?: Snippet;
    footer?: Snippet;
    children?: Snippet;
  }

  let {
    variant = 'default',
    unroll = false,
    rods = true,
    tag = 'section',
    band,
    heading,
    footer,
    children,
    class: className,
    ...rest
  }: Props = $props();

  const bandImage = $derived(band ? band : null);
</script>

<svelte:element
  this={tag}
  {...rest}
  class={['qj-scroll', className]}
  data-variant={variant}
  data-unroll={unroll ? '' : undefined}
>
  {#if rods && variant === 'boss'}<span class="cord" aria-hidden="true"></span>{/if}
  <div class="sheet">
    {#if bandImage}
      <div class="band" aria-hidden="true" style:--qj-band={bandImage}></div>
    {/if}
    <div class="inner">
      {#if heading}<header class="head">{@render heading()}</header>{/if}
      {#if children}<div class="body">{@render children()}</div>{/if}
      {#if footer}<footer class="foot">{@render footer()}</footer>{/if}
    </div>
  </div>
</svelte:element>

<style>
  .qj-scroll {
    position: relative;
    display: block;
    margin: 0;
    list-style: none;
  }
  .sheet {
    position: relative;
    overflow: hidden;
    background-color: var(--surface);
    border: var(--bw-hair) solid var(--line);
    border-radius: var(--r-sm);
    box-shadow: var(--shadow-2);
  }
  .inner {
    display: grid;
    gap: var(--sp-3);
    padding: var(--sp-4);
    /* a parent can reserve a margin column (QuestCard's brush labels) */
    padding-inline-start: var(--leaf-pad-start, var(--sp-4));
  }
  .head {
    display: grid;
    gap: var(--sp-2);
  }
  .body {
    display: grid;
    gap: var(--sp-3);
    color: var(--ink);
  }
  .foot {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    padding-top: var(--sp-3);
    border-top: var(--bw-hair) solid var(--rule-faint);
  }

  /* A strip of a real painting, closed off by a vermilion double rule */
  .band {
    height: 72px;
    background:
      linear-gradient(var(--photo-scrim), var(--photo-scrim)),
      var(--qj-band) center 35% / cover no-repeat,
      linear-gradient(90deg, var(--surface-sunk), var(--seal-soft), var(--surface-sunk));
    filter: var(--photo-filter);
    border-bottom: 2px solid var(--rule);
    box-shadow: 0 3px 0 -2px var(--rule);
    margin-bottom: 3px;
  }

  /* Jinshi's commission: violet 四周雙邊 */
  .qj-scroll[data-variant='boss'] .sheet {
    border: 2px solid var(--boss);
    outline: 1px solid var(--boss);
    outline-offset: -6px;
    background-image: linear-gradient(to bottom, var(--boss-soft), transparent 9rem);
    box-shadow: var(--shadow-2), var(--glow-lantern);
  }
  .qj-scroll[data-variant='boss'] .inner {
    padding: var(--sp-4) calc(var(--sp-4) + 4px);
    padding-inline-start: calc(var(--leaf-pad-start, var(--sp-4)) + 4px);
  }
  /* the cord: a violet silk tie over the top edge of the leaf. It hangs mostly in the gap above the card;
     only the tassel's tip reaches into the top padding, so it can never cover the meta row, title or seal. */
  .cord {
    position: absolute;
    z-index: var(--z-seal);
    top: -22px;
    right: 112px; /* clear of the 勝 seal in the top-right corner */
    width: 4px;
    height: 26px;
    border-radius: 2px;
    background: repeating-linear-gradient(
      -45deg,
      var(--boss) 0 3px,
      color-mix(in srgb, var(--boss) 65%, #000) 3px 5px
    );
    pointer-events: none;
  }
  .cord::after {
    content: '';
    position: absolute;
    left: -4px;
    bottom: -11px;
    width: 12px;
    height: 13px;
    border-radius: 2px 2px 6px 6px;
    background: repeating-linear-gradient(
      to right,
      var(--boss) 0 1px,
      color-mix(in srgb, var(--boss) 55%, transparent) 1px 2px
    );
  }

  .qj-scroll[data-variant='quiet'] .sheet {
    background-color: var(--surface-sunk);
    border-style: dashed;
    border-color: var(--line-strong);
    box-shadow: none;
  }
  .qj-scroll[data-variant='alert'] .sheet {
    border-left: 4px solid var(--seal);
  }

  /* Ink in */
  .qj-scroll[data-unroll] .sheet {
    animation: qj-ink-in var(--dur-unroll) var(--ease-out) both;
  }
  @media (prefers-reduced-motion: reduce) {
    .qj-scroll[data-unroll] .sheet {
      animation: qj-fade-in 160ms linear both;
    }
  }
  :global(:root[data-motion='reduce']) .qj-scroll[data-unroll] .sheet {
    animation: qj-fade-in 160ms linear both;
  }
</style>

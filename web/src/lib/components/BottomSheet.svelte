<!--
  Shared bottom sheet (designer M6 risk 9): role=dialog, aria-modal, a window-level Esc + Tab trap (works wherever
  focus is), focus moves to the title on open and returns to the opener on close, safe-area padding, a paper scrim.
  Used by the Garden day sheet. (The M5 Market sheet still has its own copy; migrating it is a backlog item.)
-->
<script lang="ts">
  import { onMount, tick, type Snippet } from 'svelte';
  import { FOCUSABLE_SELECTOR, focusables, trapTarget } from '../focusTrap';

  interface Props {
    /** Id of the heading inside `children` (aria-labelledby). */
    labelledby: string;
    onclose: () => void;
    children: Snippet;
  }
  let { labelledby, onclose, children }: Props = $props();

  let el = $state<HTMLElement | null>(null);
  const opener = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;

  onMount(() => {
    void tick().then(() => {
      const h = el?.querySelector<HTMLElement>(`#${CSS.escape(labelledby)}`);
      if (h) {
        if (!h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1');
        h.focus();
      }
    });
    return () => {
      // Focus goes back to the plot/row that opened the sheet.
      if (opener && document.contains(opener)) opener.focus();
    };
  });

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onclose();
      return;
    }
    if (e.key !== 'Tab' || !el) return;
    // Only nodes that can really take focus (MED-1: fieldset-disabled radios of a read-only HerbRating don't).
    const nodes = focusables(el.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    const active = document.activeElement;
    const target = trapTarget(nodes, active, el.contains(active), e.shiftKey, (a, b) =>
      a instanceof Node ? (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 : false
    );
    if (target === null) return;
    e.preventDefault();
    if (target !== 'stay') target.focus();
  }
</script>

<svelte:window {onkeydown} />

<div class="scrim" aria-hidden="true" onclick={onclose}></div>
<div class="sheet" role="dialog" aria-modal="true" aria-labelledby={labelledby} bind:this={el}>
  {@render children()}
</div>

<style>
  /* Same geometry as the Market buy sheet (M5): above the tab bar, safe-area aware, paper surface. */
  .scrim {
    position: fixed;
    inset: 0;
    z-index: var(--z-overlay);
    background: rgb(0 0 0 / 0.35);
  }
  .sheet {
    position: fixed;
    left: 0;
    right: 0;
    bottom: calc(var(--nav-height, 0px) + env(safe-area-inset-bottom, 0px));
    z-index: calc(var(--z-overlay) + 1);
    display: grid;
    gap: var(--sp-3);
    max-width: 36rem;
    max-height: calc(100dvh - var(--nav-height, 0px) - env(safe-area-inset-bottom, 0px) - env(safe-area-inset-top, 0px) - var(--sp-6));
    overflow-y: auto;
    overscroll-behavior: contain;
    margin: 0 auto;
    padding: var(--sp-5) var(--sp-4) var(--sp-4);
    border-radius: var(--r-lg);
    background: var(--surface);
    color: var(--ink);
    box-shadow: var(--shadow-3);
    animation: sheet-in var(--dur-2, 200ms) var(--ease-out) both;
  }
  @keyframes sheet-in {
    from {
      transform: translateY(24px);
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .sheet {
      animation: none;
    }
  }
  :global(:root[data-motion='reduce']) .sheet {
    animation: none;
  }
</style>

<!--
  PageTitle: a page heading with its 題簽, the narrow paper title slip pasted on a thread-bound book,
  written vertically in brush (日録, 花苑, 覚書…) inside a double rule. The slip is aria-hidden: the
  h1 inside `children` names the page.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    /** Two or three kanji, e.g. PAGE_KANJI.evening */
    kanji: string;
    children: Snippet;
    class?: string;
  }

  let { kanji, children, class: className = '' }: Props = $props();
</script>

<div class={['qj-pagetitle', className]}>
  <span class="slip" aria-hidden="true"><span class="qj-brush">{kanji}</span></span>
  <div class="t">{@render children()}</div>
</div>

<style>
  .qj-pagetitle {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
    gap: var(--sp-3);
  }
  .slip {
    display: grid;
    place-items: center;
    padding: var(--sp-2) 5px;
    min-height: 4.5rem;
    background: var(--surface);
    border: 2px solid var(--rule);
    outline: 1px solid var(--rule);
    outline-offset: -5px;
    color: var(--ink);
    font-size: 1.15rem;
    box-shadow: var(--shadow-1);
  }
  .t {
    min-width: 0;
    display: grid;
    gap: var(--sp-1);
    align-self: center;
  }
</style>

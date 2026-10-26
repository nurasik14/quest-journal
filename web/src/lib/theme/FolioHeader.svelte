<!--
  FolioHeader: the head of today's leaf in the notebook.
    [ spine column ]  the date written the way a ledger page is headed (十月廿六日 · 月曜), under a
                      fish-tail mark 魚尾 like the fold of a woodblock page. Decorative: the h1 says it.
    [ heading ]       the date as the page h1, the weekday and week, then any trailing content (balance).
    [ plate ]         the herb of the day: a real woodblock plate from the 1848 植物名實圖考, picked by
                      the server's date so it changes at the same moment the page does.
  The plate's one-line note runs under the three columns.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import HerbPlate from './HerbPlate.svelte';
  import { folioDate, plateFor, PLATE_SOURCE, type HerbPlate as Plate } from './folio';

  interface Props {
    /** Logical date YYYY-MM-DD (from the server, never the phone clock) */
    date: string;
    /** e.g. "Week 44" */
    week?: string;
    /** Small line above the date, e.g. "Monday's prescriptions" */
    eyebrow?: string;
    /** Override the herb of the day */
    plate?: Plate;
    headingLevel?: 1 | 2;
    /** Ink the header in once on mount */
    animate?: boolean;
    trailing?: Snippet;
    children?: Snippet;
    class?: string;
  }

  let {
    date,
    week,
    eyebrow = 'Prescriptions for',
    plate,
    headingLevel = 1,
    animate = true,
    trailing,
    children,
    class: className = ''
  }: Props = $props();

  const parsed = $derived.by(() => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
  });
  const weekday = $derived(parsed ? parsed.toLocaleDateString('en-GB', { weekday: 'long' }) : '');
  const dayMonth = $derived(parsed ? parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }) : date);
  const kanji = $derived(folioDate(date));
  const herb = $derived(plate ?? plateFor(date));
</script>

<header class={['qj-folio', className]} data-animate={animate ? '' : undefined}>
  <div class="spine" aria-hidden="true">
    <span class="fishtail"></span>
    {#if kanji}
      <span class="qj-brush md">{kanji.month}{kanji.day}</span>
      <span class="qj-brush wk">{kanji.weekday}</span>
    {/if}
  </div>

  <div class="text">
    {#if eyebrow}<p class="eyebrow">{eyebrow}</p>{/if}
    <svelte:element this={`h${headingLevel}`} class="date">
      <span class="dm">{dayMonth}</span>
      <span class="wd">{weekday}{week ? ` · ${week}` : ''}</span>
    </svelte:element>
    {@render children?.()}
    {#if trailing}<div class="trailing">{@render trailing()}</div>{/if}
  </div>

  <HerbPlate plate={herb} height="6.5rem" class="plate" />

  <p class="herb-note">
    <span class="from">From the herbal:</span>
    {herb.note}
    <cite>{PLATE_SOURCE}</cite>
  </p>
</header>

<style>
  .qj-folio {
    display: grid;
    grid-template-columns: 2.25rem minmax(0, 1fr) auto;
    grid-template-areas:
      'spine text plate'
      'note note note';
    column-gap: var(--sp-3);
    row-gap: var(--sp-3);
    align-items: start;
    padding-bottom: var(--sp-4);
    border-bottom: 1px solid var(--rule);
    box-shadow: 0 3px 0 -2px var(--rule);
  }

  /* 版心: the folded centre strip of a woodblock leaf, with its fish-tail mark */
  .spine {
    grid-area: spine;
    display: grid;
    justify-items: center;
    align-content: start;
    gap: var(--sp-2);
    min-height: 100%;
    padding-block: 0 var(--sp-2);
    border-inline: 1px solid var(--rule);
    color: var(--ink);
  }
  .fishtail {
    width: 100%;
    height: 14px;
    background: var(--vermilion);
    clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 45%, 0 100%);
    opacity: 0.85;
  }
  .md {
    font-size: 1.2rem;
  }
  .wk {
    font-size: 0.95rem;
    color: var(--seal);
  }

  .text {
    grid-area: text;
    min-width: 0;
    display: grid;
    gap: var(--sp-1);
    align-content: start;
  }
  .eyebrow {
    margin: 0;
    font-size: var(--fs-xs);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--ink-muted);
  }
  .date {
    display: grid;
    margin: 0;
    font-family: var(--font-display);
    line-height: var(--lh-tight);
  }
  .dm {
    font-size: clamp(1.75rem, 1.2rem + 3vw, 2.6rem);
    font-weight: var(--fw-display-heavy);
    color: var(--ink);
    white-space: nowrap;
  }
  .wd {
    margin-top: 2px;
    font-size: var(--fs-base);
    font-weight: var(--fw-medium);
    color: var(--accent-ink);
  }
  .trailing {
    margin-top: var(--sp-2);
    justify-self: start;
  }

  .qj-folio :global(.plate) {
    grid-area: plate;
    width: 5.5rem;
  }

  .herb-note {
    grid-area: note;
    margin: 0;
    font-family: var(--font-note);
    font-size: var(--fs-sm);
    line-height: var(--lh-snug);
    color: var(--ink);
  }
  .from {
    color: var(--seal);
    font-weight: var(--fw-bold);
  }
  cite {
    display: block;
    margin-top: 2px;
    font-family: var(--font-body);
    font-style: normal;
    font-size: var(--fs-xs);
    color: var(--ink-muted);
  }

  .qj-folio[data-animate] .text,
  .qj-folio[data-animate] .spine {
    animation: qj-ink-in var(--dur-slow) var(--ease-out) both;
  }
  .qj-folio[data-animate] :global(.plate) {
    animation: qj-ink-in var(--dur-unroll) var(--ease-out) 120ms both;
  }
  @media (prefers-reduced-motion: reduce) {
    .qj-folio[data-animate] .text,
    .qj-folio[data-animate] .spine,
    .qj-folio[data-animate] :global(.plate) {
      animation: qj-fade-in 160ms linear both;
    }
  }
  :global(:root[data-motion='reduce']) .qj-folio[data-animate] .text,
  :global(:root[data-motion='reduce']) .qj-folio[data-animate] .spine,
  :global(:root[data-motion='reduce']) .qj-folio[data-animate] :global(.plate) {
    animation: qj-fade-in 160ms linear both;
  }
</style>

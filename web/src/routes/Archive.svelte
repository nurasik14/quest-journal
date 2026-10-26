<!--
  The garden (designer screens.md §4, sprint M6 goals 13–17). It shows the past back honestly:
  - it counts up (days logged, quests done, longest streak), and the numbers come from the server's ledger, never recounted here;
  - missing is not bad: unrated, unwritten and unreadable days are visibly different without colour, and never coloured as a low rating;
  - categories are correlations, not verdicts: fixed order, a minimum sample, let-go never shown.
  Everything the user wrote is rendered as plain text (no {@html}).
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { DayJson, FileProblem, HeatmapDay, StatsResponse } from '../../../server/src/api-types';
  import { api, ApiError, NetworkError } from '../lib/api';
  import BalanceBadge from '../lib/components/BalanceBadge.svelte';
  import BottomSheet from '../lib/components/BottomSheet.svelte';
  import OfflineCard from '../lib/components/OfflineCard.svelte';
  import Quarantine from '../lib/components/Quarantine.svelte';
  import { COPY } from '../lib/copy';
  import { buildRows, canWrite, shownCategories, dateParam, dayMonth, gardenLevel, plotLabel, rangeWindow, shortDate, type GardenRange } from '../lib/garden';
  import { prettyDate } from '../lib/questView';
  import { router } from '../lib/router.svelte';
  import { categoryInfo, HerbRating, Icon, PAGE_KANJI, PageTitle, ScrollCard, STATUS, Sticker } from '../lib/theme';

  let range = $state<GardenRange>('4w');
  let stats = $state<StatsResponse | null>(null);
  let loading = $state(true);
  let failed = $state(false);
  /** The failure was the network (or a timeout): the neutral offline card, never the red error (H1 #299). */
  let unreachable = $state(false);

  /** The day sheet: the date, then the page (or why there's none). */
  let sheetDate = $state<string | null>(null);
  let sheetDay = $state<DayJson | null>(null);
  let sheetProblem = $state<FileProblem | null>(null);
  let sheetLoading = $state(false);

  const today = $derived(stats?.today ?? '');
  const rows = $derived(stats ? buildRows(stats.heatmap, stats.today, range) : []);
  const empty = $derived(stats !== null && stats.days_logged < 3);
  const cats = $derived(stats ? shownCategories(stats.by_category) : []);
  const maxDone = $derived(Math.max(1, ...cats.map((c) => c.done + c.partial)));
  const legend = [1, 2, 3, 4, 5] as const;

  async function load() {
    loading = true;
    failed = false;
    unreachable = false;
    try {
      // The server knows "today" (logical date, tz, rollover): ask once with no params, then the window.
      const first = stats ?? (await api.stats(undefined, undefined)).data;
      const w = rangeWindow(first.today, range);
      stats = (await api.stats(w.from, w.to)).data;
    } catch (e) {
      if (e instanceof NetworkError) unreachable = true;
      else console.warn('[garden] load', e);
      failed = true;
    } finally {
      loading = false;
    }
  }

  function setRange(r: GardenRange) {
    if (r === range) return;
    range = r;
    void load();
  }

  async function openDay(date: string) {
    sheetDate = date;
    sheetDay = null;
    sheetProblem = null;
    sheetLoading = true;
    try {
      sheetDay = (await api.day(date)).data;
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) {
        const d = e.details as Record<string, unknown>;
        sheetProblem = {
          code: e.code,
          file: typeof d.file === 'string' ? d.file : `days/${date}.md`,
          ...(typeof d.line === 'number' ? { line: d.line } : {}),
          ...(typeof d.field === 'string' ? { field: d.field } : {}),
          ...(typeof d.raw === 'string' ? { raw: d.raw } : {})
        } as FileProblem;
      }
      // 404 → no page: the sheet says so (and offers the ledger link when recent)
    } finally {
      sheetLoading = false;
    }
  }

  function closeSheet() {
    sheetDate = null;
  }

  function cellState(h: HeatmapDay): string {
    return h.state === 'rated' ? `rated g${gardenLevel(h.satisfaction ?? 1)}` : h.state;
  }

  onMount(() => {
    void load().then(() => {
      const d = dateParam(location.search);
      if (d) void openDay(d);
    });
  });

  // A deep link while already on /archive (e.g. from a Notes evidence chip) opens that day too.
  let lastSeq = router.seq;
  $effect(() => {
    const seq = router.seq;
    if (seq === lastSeq) return;
    lastSeq = seq;
    const d = dateParam(location.search);
    if (d && stats) void openDay(d);
  });
</script>

<svelte:head><title>The garden · Quest Journal</title></svelte:head>

<ScrollCard unroll band="var(--qj-img-band-garden)">
  {#snippet heading()}
    <div class="head">
      <PageTitle kanji={PAGE_KANJI.archive}><h1 tabindex="-1">{COPY.gardenTitle}</h1></PageTitle>
      <BalanceBadge />
    </div>
  {/snippet}

  {#if failed && !stats && unreachable}
    <OfflineCard busy={loading} onretry={() => void load()} />
  {:else if failed && !stats}
    <div class="qj-banner qj-banner--error" role="alert">
      <p>{COPY.gardenError}</p>
      <button type="button" class="qj-btn qj-btn--sm" onclick={() => void load()}>{COPY.tryAgain}</button>
    </div>
  {:else if empty}
    <div class="empty">
      <p>{COPY.gardenEmpty}</p>
      <Sticker event="idle" seed="garden" size={96} />
    </div>
  {:else}
    <dl class="stats" aria-busy={loading && !stats}>
      <div>
        <dt>{COPY.gardenDaysLogged}</dt>
        <dd class="num">{stats ? stats.days_logged.toLocaleString('en-US') : '—'}</dd>
      </div>
      <div>
        <dt>{COPY.gardenQuestsDone}</dt>
        <dd class="num">{stats ? stats.quests_done.toLocaleString('en-US') : '—'}</dd>
      </div>
      <div>
        <dt>{COPY.gardenLongest}</dt>
        <dd class="num">{stats ? stats.longest_streak : '—'}</dd>
      </div>
    </dl>
    {#if stats && stats.streak >= 2}<p class="current">{COPY.gardenCurrent(stats.streak)}</p>{/if}
  {/if}
</ScrollCard>

{#if !empty && !(failed && !stats)}
  <section class="garden" aria-labelledby="garden-h">
    <div class="garden-head">
      <h2 id="garden-h">{COPY.gardenGridLabel}</h2>
      <div class="chips" role="group" aria-label={COPY.gardenRange}>
        <button type="button" class="qj-chip" aria-pressed={range === '4w'} onclick={() => setRange('4w')}>{COPY.gardenRange4w}</button>
        <button type="button" class="qj-chip" aria-pressed={range === '3m'} onclick={() => setRange('3m')}>{COPY.gardenRange3m}</button>
      </div>
    </div>

    {#if stats && stats.warnings.length > 0}
      <p class="qj-hint partial" role="status">{COPY.gardenPartial(stats.warnings.length)}</p>
    {/if}
    {#if failed && stats && !unreachable}
      <div class="qj-banner qj-banner--error" role="alert">
        <p>{COPY.gardenError}</p>
        <button type="button" class="qj-btn qj-btn--sm" onclick={() => void load()}>{COPY.tryAgain}</button>
      </div>
    {/if}

    <div class="grid" class:loading={loading && !stats}>
      <span class="corner" aria-hidden="true"></span>
      {#each ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as d, i (i)}<span class="wd" aria-hidden="true">{d}</span>{/each}
      {#if stats}
        {#each rows as row (row.weekStart)}
          <span class="month" aria-hidden="true">{row.label ?? ''}</span>
          {#each row.cells as cell (cell.date)}
            {#if cell.day}
              {@const h = cell.day}
              <button
                type="button"
                class="plot {cellState(h)}"
                class:today={h.date === today}
                aria-label={plotLabel(h)}
                onclick={() => void openDay(h.date)}
              >
                {#if h.state === 'rated'}<span class="n">{h.satisfaction}</span>{:else if h.state === 'unrated'}<span class="dot" aria-hidden="true">·</span>{/if}
              </button>
            {:else}
              <span class="plot none" aria-hidden="true"></span>
            {/if}
          {/each}
        {/each}
      {:else}
        {#each Array.from({ length: 28 }, (_, i) => i) as i (i)}
          {#if i % 7 === 0}<span class="month" aria-hidden="true"></span>{/if}
          <span class="plot gap" aria-hidden="true"></span>
        {/each}
      {/if}
    </div>

    <div class="legend" aria-label={COPY.gardenLegend} role="group">
      <span class="key"><span class="plot gap swatch" aria-hidden="true"></span>{COPY.gardenNoEntry}</span>
      {#each legend as lvl (lvl)}
        <span class="key"
          ><span class="plot rated g{lvl} swatch" aria-hidden="true"><span class="n">{lvl * 2 - 1}–{lvl * 2}</span></span>{COPY.gardenAnchors[lvl - 1]}</span
        >
      {/each}
      <span class="key"><span class="plot unrated swatch" aria-hidden="true"><span class="dot">·</span></span>{COPY.gardenNoRating}</span>
      <span class="key"><span class="plot broken swatch" aria-hidden="true"></span>{COPY.gardenBroken}</span>
    </div>
  </section>

  {#if stats && cats.length > 0}
    <section class="cats" aria-labelledby="cats-h">
      <h2 id="cats-h">{COPY.gardenByCategory}</h2>
      <ul>
        {#each cats as c (c.category)}
          {@const info = categoryInfo(c.category)}
          {@const done = c.done + c.partial}
          <li>
            <div class="cat-line">
              <span class="cat-name"><Icon name={info.icon} />{info.label} <span class="plain">· {info.plain}</span></span>
              <span class="cat-nums">
                <span>{COPY.gardenDone(done)}</span>
                {#if c.avg_satisfaction !== null}
                  <span>{COPY.gardenAvg(c.avg_satisfaction.toFixed(1), c.n_rated)}</span>
                {:else}
                  <span class="few">{COPY.gardenTooFew(c.n_rated, stats.min_rated)}</span>
                {/if}
              </span>
            </div>
            <span class="track" aria-hidden="true"><span class="bar" style:width="{(done / maxDone) * 100}%" style:background="var({info.colorVar})"></span></span>
          </li>
        {/each}
      </ul>
      <p class="caption">{COPY.gardenCaption}</p>
    </section>
  {/if}

  {#if stats?.this_day_last_month}
    {@const m = stats.this_day_last_month}
    <ScrollCard>
      {#snippet heading()}<h2>{COPY.gardenMonthAgo} · {dayMonth(m.date)}</h2>{/snippet}
      <div class="month-ago">
        {#if m.satisfaction !== null}<HerbRating value={m.satisfaction} readonly size="sm" hideLegend legend={COPY.gardenMonthAgo} />{/if}
        {#if m.highlight}<p class="highlight">{m.highlight}</p>{/if}
        {#if m.quests.length}
          <ul class="mq">
            {#each m.quests as q, i (i)}<li>{q.title} <span class="muted">· {STATUS[q.status as keyof typeof STATUS]?.label ?? q.status}</span></li>{/each}
          </ul>
        {/if}
        <!-- Read-only (H1 #266): the day sheet, never the editable Evening form for a month-old page. -->
        <a
          class="qj-btn qj-btn--quiet qj-btn--sm"
          href="/archive?date={m.date}"
          onclick={(e) => {
            e.preventDefault(); // already on the garden: open the sheet directly (works on a second tap too)
            void openDay(m.date);
          }}>{COPY.gardenReadPage}</a
        >
      </div>
    </ScrollCard>
  {/if}
{/if}

{#if sheetDate}
  {@const date = sheetDate}
  <BottomSheet labelledby="day-sheet-title" onclose={closeSheet}>
    <h2 id="day-sheet-title">{prettyDate(date)}</h2>
    {#if sheetLoading}
      <p class="muted">…</p>
    {:else if sheetProblem}
      <Quarantine problem={sheetProblem} />
    {:else if sheetDay}
      {@const d = sheetDay}
      {#if d.private}<p class="qj-hint">{COPY.gardenPrivate}</p>{/if}
      {#if d.satisfaction !== null}
        <HerbRating value={d.satisfaction} readonly size="sm" hideLegend legend={shortDate(date)} />
      {:else}
        <p class="muted">{date === today ? COPY.gardenNotYet : COPY.gardenNoRating}</p>
      {/if}
      {#if d.mood.length}<p class="moods">{#each d.mood as m (m)}<span class="qj-chip">{m}</span>{/each}</p>{/if}
      {#if d.highlight.trim()}<p class="highlight">{d.highlight}</p>{/if}
      {#if d.quests.length}
        <h3>{COPY.gardenQuests}</h3>
        <ul class="sheet-quests">
          {#each d.quests as q (q.id)}
            <li class="q {q.status}">
              <span class="seal" aria-hidden="true">{q.status === 'done' ? '済' : q.status === 'partial' ? '半' : ''}</span>
              <span>{q.title}</span>
              <span class="muted">· {STATUS[q.status as keyof typeof STATUS]?.label ?? q.status}</span>
            </li>
          {/each}
        </ul>
      {/if}
      {#if d.notes.trim()}<p class="notes">{d.notes}</p>{/if}
      {#if d.gratitude.trim()}<p class="notes muted">{d.gratitude}</p>{/if}
    {:else}
      <p class="muted">{COPY.noDay}</p>
    {/if}
    <div class="sheet-actions">
      {#if canWrite(date, today) && !sheetProblem}
        <a class="qj-btn qj-btn--quiet qj-btn--sm" href="/evening/{date}" onclick={closeSheet}>{COPY.gardenWriteLedger}</a>
      {:else}<span></span>{/if}
      <button type="button" class="qj-btn qj-btn--sm" onclick={closeSheet}>{COPY.close}</button>
    </div>
  </BottomSheet>
{/if}

<style>
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-2) var(--sp-3);
  }
  .head :global(.qj-pagetitle) {
    flex: 1 1 12rem;
  }
  .stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--sp-3);
    margin: 0;
  }
  .stats div {
    display: flex;
    flex-direction: column-reverse;
    gap: var(--sp-1);
  }
  .stats dt {
    font-size: var(--fs-sm);
    color: var(--ink-muted);
  }
  .stats dd {
    margin: 0;
  }
  .num {
    font-family: var(--font-display);
    font-size: var(--fs-2xl, 1.75rem);
    font-variant-numeric: tabular-nums;
    line-height: 1.1;
  }
  .current {
    margin: var(--sp-2) 0 0;
    font-size: var(--fs-sm);
    color: var(--ink-muted);
  }
  .empty {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-4);
  }
  .garden,
  .cats {
    margin-top: var(--sp-5);
    display: grid;
    gap: var(--sp-3);
  }
  .garden-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-2);
  }
  h2 {
    margin: 0;
  }
  .chips {
    display: flex;
    gap: var(--sp-2);
  }
  .partial {
    margin: 0;
  }
  /* 1.5rem label column + 7 shrinkable columns: fits 320 px with no horizontal scroll (designer-AC3).
     NIT-4 (M6 fix 1): the label column was 2rem with 3px gaps, which left plots at 43.6 px on a 390 phone.
     1.5rem still fits a three-letter month at --fs-xs, and plots are ≥ 44 px at 390. */
  .grid {
    display: grid;
    grid-template-columns: 1.5rem repeat(7, minmax(0, 1fr));
    gap: 2px;
    max-width: 30rem;
  }
  .wd,
  .month {
    font-size: var(--fs-xs, 0.75rem);
    color: var(--ink-muted);
    text-align: center;
    align-self: center;
  }
  .month {
    text-align: left;
  }
  .plot {
    aspect-ratio: 1;
    min-height: 32px;
    min-width: 0;
    display: grid;
    place-items: center;
    padding: 0;
    border-radius: var(--r-sm, 6px);
    border: 1px solid transparent;
    background: transparent;
    color: var(--ink);
    font: inherit;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
  }
  span.plot.none {
    cursor: default;
  }
  .plot.rated {
    font-weight: 700;
  }
  .plot.g1 {
    background: var(--garden-1);
    color: var(--garden-ink-1);
  }
  .plot.g2 {
    background: var(--garden-2);
    color: var(--garden-ink-2);
  }
  .plot.g3 {
    background: var(--garden-3);
    color: var(--garden-ink-3);
  }
  .plot.g4 {
    background: var(--garden-4);
    color: var(--garden-ink-4);
  }
  .plot.g5 {
    background: var(--garden-5);
    color: var(--garden-ink-5);
  }
  /* (b) logged, no rating: paper fill + a small dot */
  .plot.unrated {
    background: var(--surface);
    border-color: var(--line);
  }
  .dot {
    font-weight: 700;
    color: var(--ink-muted);
  }
  /* (c) not written / today not rated yet: soft dashed outline, never red */
  .plot.gap,
  .plot.pending {
    border: 1.5px dashed var(--garden-empty-line);
  }
  /* (e) can't be read: diagonal hatch, neutral */
  .plot.broken {
    border-color: var(--line-strong);
    background: repeating-linear-gradient(135deg, var(--surface-sunk) 0 4px, var(--surface) 4px 8px);
  }
  .plot.today {
    outline: 2px solid var(--focus, var(--accent));
    outline-offset: 1px;
  }
  .grid.loading .plot {
    border: 1.5px dashed var(--garden-empty-line);
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2) var(--sp-4);
    font-size: var(--fs-sm);
  }
  .key {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
  }
  .swatch {
    width: 2.25rem;
    min-height: 1.75rem;
    aspect-ratio: auto;
    font-size: var(--fs-xs, 0.75rem);
    cursor: default;
  }
  .cats ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: var(--sp-3);
  }
  .cat-line {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: var(--sp-1) var(--sp-3);
  }
  .cat-name {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    font-weight: 600;
  }
  .plain {
    font-weight: 400;
    color: var(--ink-muted);
  }
  .cat-nums {
    display: inline-flex;
    flex-wrap: wrap;
    gap: var(--sp-3);
    font-size: var(--fs-sm);
    font-variant-numeric: tabular-nums;
  }
  .few {
    color: var(--ink-muted);
  }
  .track {
    display: block;
    height: 8px;
    margin-top: var(--sp-1);
    border-radius: 999px;
    background: var(--surface-sunk);
    overflow: hidden;
  }
  .bar {
    display: block;
    height: 100%;
    border-radius: 999px;
  }
  .caption {
    margin: 0;
    font-size: var(--fs-sm);
    color: var(--ink-muted);
  }
  .month-ago {
    display: grid;
    gap: var(--sp-3);
    justify-items: start;
  }
  .highlight {
    margin: 0;
    font-family: var(--font-display);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .notes {
    margin: 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .mq,
  .sheet-quests {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: var(--sp-2);
    overflow-wrap: anywhere;
  }
  .sheet-quests .q {
    display: flex;
    gap: var(--sp-2);
    align-items: baseline;
  }
  .seal {
    display: inline-block;
    min-width: 1.25em;
    color: var(--seal);
    font-family: var(--font-display);
    font-weight: 800;
  }
  h3 {
    margin: 0;
    font-size: var(--fs-md, 1rem);
  }
  .moods {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    margin: 0;
  }
  .muted {
    color: var(--ink-muted);
  }
  .sheet-actions {
    display: flex;
    justify-content: space-between;
    gap: var(--sp-2);
  }
</style>

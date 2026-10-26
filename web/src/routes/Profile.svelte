<!--
  Notes on you (designer screens.md §5, sprint M6 goals 8–12). Order: h1 header → pending suggestions → tabs
  (Insights · Profile) → Settings → About. The user is the ground truth: both pages are plain text, editable by hand,
  saved only through GET/PUT /api/kb/:name with If-Match. Nothing here calls Claude except the existing
  onboarding/proposal flows (psychologist-AC12). Text from the files is never rendered as HTML.
-->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { KbInsightsJson, KbProfileJson, ProposalJson } from '../../../server/src/api-types';
  import { api, NetworkError } from '../lib/api';
  import BalanceBadge from '../lib/components/BalanceBadge.svelte';
  import NotesEditor from '../lib/components/NotesEditor.svelte';
  import OfflineCard from '../lib/components/OfflineCard.svelte';
  import ProposalList from '../lib/components/ProposalList.svelte';
  import { COPY } from '../lib/copy';
  import { notes, refreshNotes } from '../lib/notes.svelte';
  import { noteBlocks, onlyHeadings } from '../lib/notesText';
  import {
    applyMotion,
    applyStickers,
    getCountdown,
    getMotion,
    getStickers,
    setCountdown,
    syncThemeColor,
    type CountdownSetting,
    type MotionSetting,
    type StickerSetting
  } from '../lib/settings';
  import { applyTheme, getStoredTheme, PAGE_KANJI, PageTitle, ScrollCard, Sticker, type ThemeName } from '../lib/theme';

  type Tab = 'insights' | 'profile';
  const TABS: Tab[] = ['insights', 'profile'];
  const CAP = 60;

  let clock = $state<{ date: string; tz: string; rollover_hour: number } | null>(null);
  let proposals = $state<ProposalJson[]>([]);
  let profile = $state<KbProfileJson | null>(null);
  let insights = $state<KbInsightsJson | null>(null);
  let tab = $state<Tab>('insights');
  let editing = $state<Tab | null>(null);
  let sources = $state<string | null>(null);

  let theme = $state<ThemeName>(getStoredTheme());
  let countdown = $state<CountdownSetting>(getCountdown());
  let motion = $state<MotionSetting>(getMotion());
  let stickers = $state<StickerSetting>(getStickers());

  const blocks = $derived(profile ? noteBlocks(profile.content) : []);

  /** Neither notes page could be fetched because the laptop is unreachable (H1 #299). */
  let unreachable = $state(false);

  async function loadNotes() {
    const [p, i] = await Promise.allSettled([api.profile(), api.insights()]);
    unreachable = [p, i].some((r) => r.status === 'rejected' && r.reason instanceof NetworkError) && !profile && !insights;
    if (p.status === 'fulfilled') {
      profile = p.value.data;
      notes.profileEmpty = p.value.data.empty;
    }
    if (i.status === 'fulfilled') insights = i.value.data;
  }

  onMount(() => {
    api.health().then(
      (r) => (clock = r.data),
      () => {}
    );
    api.proposals().then(
      (r) => {
        proposals = r.data.proposals;
        notes.pending = proposals.length;
      },
      () => {}
    );
    void loadNotes();
    fetch('/IMAGE_SOURCES.md', { cache: 'no-store' })
      .then((r) => (r.ok ? r.text() : null))
      .then((t) => (sources = t), () => {});
  });

  function onTabKey(e: KeyboardEvent) {
    const i = TABS.indexOf(tab);
    let next: number | null = null;
    if (e.key === 'ArrowRight') next = (i + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = TABS.length - 1;
    if (next === null) return;
    e.preventDefault();
    tab = TABS[next]!;
    void tick().then(() => document.getElementById(`tab-${tab}`)?.focus());
  }

  function saved(name: Tab, json: KbProfileJson | KbInsightsJson) {
    if (name === 'profile') {
      profile = json as KbProfileJson;
      notes.profileEmpty = (json as KbProfileJson).empty;
    } else insights = json as KbInsightsJson;
    editing = null;
    void tick().then(() => document.getElementById(`edit-${name}`)?.focus());
  }

  function setTheme(t: ThemeName) {
    theme = t;
    applyTheme(t);
    syncThemeColor(t);
  }
  function setMotion(m: MotionSetting) {
    motion = m;
    applyMotion(m);
  }
  function chooseCountdown(c: CountdownSetting) {
    countdown = c;
    setCountdown(c);
  }
  function setStickers(s: StickerSetting) {
    stickers = s;
    applyStickers(s);
  }
</script>

<svelte:head><title>Notes · Quest Journal</title></svelte:head>

<ScrollCard unroll band="var(--qj-img-band-notes)">
  {#snippet heading()}
    <header class="head">
      <PageTitle kanji={PAGE_KANJI.profile}><h1 tabindex="-1">{COPY.notesTitle}</h1></PageTitle>
      <Sticker event="idle" seed="notes" size={64} frame="round" />
      <BalanceBadge />
    </header>
  {/snippet}
</ScrollCard>

{#if proposals.length}
  <ScrollCard>
    {#snippet heading()}<h2>{COPY.notesPending}</h2>{/snippet}
    <div class="lists">
      {#each proposals as p (p.id)}
        <ProposalList
          proposal={p}
          showDate
          onchange={() => {
            void refreshNotes();
            void loadNotes();
          }}
        />
      {/each}
    </div>
  </ScrollCard>
{/if}

<section class="notes">
  <div class="tabs" role="tablist" aria-label={COPY.notesTitle} tabindex="-1" onkeydown={onTabKey}>
    {#each TABS as t (t)}
      <button
        type="button"
        role="tab"
        id="tab-{t}"
        aria-selected={tab === t}
        aria-controls="panel-{t}"
        tabindex={tab === t ? 0 : -1}
        onclick={() => (tab = t)}>{t === 'insights' ? COPY.notesTabInsights : COPY.notesTabProfile}</button
      >
    {/each}
  </div>

  <div class="panel" role="tabpanel" id="panel-{tab}" aria-labelledby="tab-{tab}">
    {#if tab === 'insights'}
      {#if editing === 'insights' && insights}
        <NotesEditor
          name="insights"
          label={COPY.notesTabInsights}
          content={insights.content}
          etag={insights.etag}
          onsaved={(j) => saved('insights', j)}
          oncancel={() => (editing = null)}
        />
      {:else if insights}
        {#if insights.unparsed_lines > 0}<p class="qj-banner qj-banner--info">{COPY.notesUnparsed(insights.unparsed_lines)}</p>{/if}
        {#if insights.items.length >= CAP}<p class="qj-banner qj-banner--info">{COPY.notesCap}</p>{/if}
        {#if insights.items.length === 0}
          <p class="muted">{COPY.notesEmptyInsights}</p>
        {:else}
          <ul class="insights">
            {#each insights.items as it, i (`${it.id}:${i}`)}
              <li>
                <p>{it.text}</p>
                {#if it.evidence.length}
                  <p class="evidence">
                    <span class="muted">{COPY.notesEvidence}</span>
                    {#each it.evidence as d (d)}<a class="qj-chip" href="/archive?date={d}">{d}</a>{/each}
                  </p>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
        <p><button type="button" id="edit-insights" class="qj-btn qj-btn--sm" onclick={() => (editing = 'insights')}>{COPY.notesEditRaw}</button></p>
      {:else if unreachable}
        <OfflineCard onretry={() => void loadNotes()} />
      {:else}
        <p class="muted">…</p>
      {/if}
    {:else if editing === 'profile' && profile}
      <NotesEditor
        name="profile"
        label={COPY.notesTabProfile}
        content={profile.content}
        etag={profile.etag}
        onsaved={(j) => saved('profile', j)}
        oncancel={() => (editing = null)}
      />
    {:else if profile}
      <div class="preview">
        {#if blocks.length === 0 || onlyHeadings(blocks)}<p class="muted">{COPY.notesEmptyProfile}</p>{/if}
        {#each blocks as b, i (i)}
          {#if b.kind === 'heading'}
            <h3>{b.text}</h3>
          {:else if b.kind === 'list'}
            <ul>{#each b.items as it, j (j)}<li>{it}</li>{/each}</ul>
          {:else if b.kind === 'quote'}
            <p class="muted">{b.text}</p>
          {:else}
            <p>{b.text}</p>
          {/if}
        {/each}
      </div>
      <p class="actions">
        <button type="button" id="edit-profile" class="qj-btn qj-btn--sm" onclick={() => (editing = 'profile')}>{COPY.notesEdit}</button>
        <a class="qj-btn qj-btn--quiet qj-btn--sm" href="/onboarding">{profile.empty ? COPY.quizStart : COPY.quizRetake}</a>
      </p>
    {:else if unreachable}
      <OfflineCard onretry={() => void loadNotes()} />
    {:else}
      <p class="muted">…</p>
    {/if}
  </div>
</section>

<ScrollCard>
  {#snippet heading()}<h2>{COPY.settingsTitle}</h2>{/snippet}
  <div class="settings">
    <div class="setting" role="group" aria-labelledby="set-theme">
      <span id="set-theme" class="qj-label">{COPY.settingsTheme}</span>
      <div class="seg">
        <button type="button" class="qj-chip" aria-pressed={theme === 'system'} onclick={() => setTheme('system')}>{COPY.themeSystem}</button>
        <button type="button" class="qj-chip" aria-pressed={theme === 'light'} onclick={() => setTheme('light')}>{COPY.themePaper}</button>
        <button type="button" class="qj-chip" aria-pressed={theme === 'dark'} onclick={() => setTheme('dark')}>{COPY.themeNight}</button>
      </div>
    </div>
    <div class="setting" role="group" aria-labelledby="set-motion">
      <span id="set-motion" class="qj-label">{COPY.settingsMotion}</span>
      <div class="seg">
        <button type="button" class="qj-chip" aria-pressed={motion === 'system'} onclick={() => setMotion('system')}>{COPY.motionSystem}</button>
        <button type="button" class="qj-chip" aria-pressed={motion === 'reduce'} onclick={() => setMotion('reduce')}>{COPY.motionReduce}</button>
      </div>
    </div>
    <div class="setting" role="group" aria-labelledby="set-stickers">
      <span id="set-stickers" class="qj-label">{COPY.settingsStickers}</span>
      <div class="seg">
        <button type="button" class="qj-chip" aria-pressed={stickers === 'on'} onclick={() => setStickers('on')}>{COPY.stickersOn}</button>
        <button type="button" class="qj-chip" aria-pressed={stickers === 'off'} onclick={() => setStickers('off')}>{COPY.stickersOff}</button>
      </div>
    </div>
    <div class="setting" role="group" aria-labelledby="set-countdown">
      <span id="set-countdown" class="qj-label">{COPY.settingsCountdown}</span>
      <div class="seg">
        <button type="button" class="qj-chip" aria-pressed={countdown === 'on'} onclick={() => chooseCountdown('on')}>{COPY.stickersOn}</button>
        <button type="button" class="qj-chip" aria-pressed={countdown === 'off'} onclick={() => chooseCountdown('off')}>{COPY.stickersOff}</button>
      </div>
    </div>
    {#if clock}<p class="clock">{COPY.clockLine(clock.tz, clock.rollover_hour, clock.date)}</p>{/if}
  </div>
</ScrollCard>

<ScrollCard>
  {#snippet heading()}<h2>{COPY.aboutTitle}</h2>{/snippet}
  <p>{COPY.aboutVersion(__APP_VERSION__)}</p>
  {#if sources}
    <details>
      <summary>{COPY.aboutImages}</summary>
      <pre class="sources">{sources}</pre>
    </details>
  {/if}
</ScrollCard>

<style>
  /* LOW-1 (M6 fix 1): the disclosure is a tap target, so it gets the 44 px minimum. */
  summary {
    /* keep display: list-item so the disclosure triangle stays */
    min-height: 44px;
    box-sizing: border-box;
    padding-block: var(--sp-2);
    cursor: pointer;
    touch-action: manipulation;
  }
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-3);
  }
  .head h1 {
    margin: 0;
  }
  .head :global(.qj-pagetitle) {
    flex: 1 1 12rem;
  }
  .lists {
    display: grid;
    gap: var(--sp-5);
  }
  .notes {
    margin-block: var(--sp-5);
  }
  .tabs {
    display: flex;
    gap: var(--sp-2);
    border-bottom: 1px solid var(--line);
    margin-bottom: var(--sp-4);
  }
  [role='tab'] {
    min-height: 48px;
    padding: 0 var(--sp-4);
    border: 0;
    border-bottom: 3px solid transparent;
    background: none;
    color: var(--ink-muted);
    font: inherit;
    font-weight: 500;
    cursor: pointer;
  }
  /* Selected = underline AND weight, never colour alone (designer-AC13). */
  [role='tab'][aria-selected='true'] {
    border-bottom-color: var(--accent);
    color: var(--ink);
    font-weight: 700;
  }
  .panel {
    display: grid;
    gap: var(--sp-3);
  }
  .insights {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: var(--sp-3);
  }
  .insights li {
    padding-left: var(--sp-3);
    border-left: 3px solid var(--line-strong);
    overflow-wrap: anywhere;
  }
  .insights p {
    margin: 0;
  }
  .evidence {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    margin-top: var(--sp-2) !important;
    font-size: var(--fs-sm);
  }
  .preview {
    overflow-wrap: anywhere;
  }
  .preview h3 {
    margin: var(--sp-4) 0 var(--sp-2);
    font-size: var(--fs-md, 1rem);
  }
  .preview p,
  .preview ul {
    margin: 0 0 var(--sp-2);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }
  .settings {
    display: grid;
    gap: var(--sp-4);
  }
  .setting {
    display: grid;
    gap: var(--sp-2);
  }
  .seg {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }
  .clock {
    margin: 0;
    font-size: var(--fs-sm);
    color: var(--ink-muted);
  }
  .muted {
    color: var(--ink-muted);
  }
  .sources {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-size: var(--fs-xs, 0.75rem);
    max-height: 50vh;
    overflow: auto;
  }
</style>

<!--
  Full-height plain-text editor for kb/profile.md and kb/insights.md (designer-AC14/AC15, architect-AC7).
  - Every save sends If-Match. A 412 keeps the user's text and offers Copy / Load the newer page / Save mine anyway
    (the last one re-reads the etag and overwrites: a deliberate choice, never automatic). The panel renders ABOVE
    the textarea, scrolls into view and takes focus; the sticky Save then becomes "Save mine anyway" (H1 #316).
  - A dirty draft asks before the page unloads (H1: unsaved-text safety, same as Evening).
  - Over the size limit → an inline note; the text stays.
  - Cancel on a dirty draft asks once, inline (no confirm()).
  - "Saving…" while the request runs, then the toast "Notes saved." No seal, no coins, no AI call.
-->
<script lang="ts">
  import type { KbInsightsJson, KbProfileJson } from '../../../../server/src/api-types';
  import { tick } from 'svelte';
  import { api, ApiError } from '../api';
  import { COPY } from '../copy';
  import { failureCopy } from '../http';
  import { setEconomy } from '../economy.svelte';
  import { showToast } from '../toast.svelte';

  type Name = 'profile' | 'insights';
  interface Props {
    name: Name;
    label: string;
    content: string;
    etag: string;
    onsaved: (json: KbProfileJson | KbInsightsJson) => void;
    oncancel: () => void;
  }
  let { name, label, content, etag, onsaved, oncancel }: Props = $props();

  // The draft starts from the loaded text once; later prop changes don't overwrite what the user typed.
  const initial = (() => content)();
  let text = $state(initial);
  let base = $state((() => etag)());
  let saving = $state(false);
  let stale = $state(false);
  let note = $state<string | null>(null);
  let asking = $state(false);
  const dirty = $derived(text !== initial);
  let staleHeading = $state<HTMLElement | null>(null);
  let stalePanel = $state<HTMLElement | null>(null);

  // A reload or a closed tab would drop the draft: ask first while there's unsaved text.
  $effect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  });
  const MAX = 20_000;

  const put = (c: string, e: string) => (name === 'profile' ? api.saveProfile(c, e) : api.saveInsights(c, e));

  async function save(overwrite = false) {
    if (saving) return;
    saving = true;
    note = null;
    try {
      let tag = base;
      if (overwrite) {
        const fresh = name === 'profile' ? await api.profile() : await api.insights();
        tag = fresh.data.etag;
      }
      const res = await put(text, tag);
      if (res.data.economy) setEconomy(res.data.economy);
      stale = false;
      showToast(COPY.notesSaved);
      onsaved(res.data);
    } catch (e) {
      if (e instanceof ApiError && e.status === 412) {
        stale = true;
        await tick();
        const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
        stalePanel?.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
        staleHeading?.focus({ preventScroll: true });
      } else if (e instanceof ApiError && e.code === 'too_large') note = COPY.notesTooLarge(MAX);
      else note = failureCopy(e);
    } finally {
      saving = false;
    }
  }

  async function reload() {
    try {
      const fresh = name === 'profile' ? await api.profile() : await api.insights();
      onsaved(fresh.data); // the parent shows the newer page; this draft is dropped by the user's choice
    } catch {
      note = COPY.saveRetry;
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      showToast(COPY.notesCopied);
    } catch {
      // No clipboard (insecure origin): select the text so the user can copy it by hand.
      const ta = document.getElementById(`editor-${name}`) as HTMLTextAreaElement | null;
      ta?.focus();
      ta?.select();
    }
  }

  function cancel() {
    if (dirty && !asking) {
      asking = true;
      return;
    }
    oncancel();
  }
</script>

<div class="editor">
  {#if stale}
    <!-- Above the textarea (H1 #316): at 390 px a panel below the sticky bar was off-screen. -->
    <div class="qj-banner qj-banner--info stale" role="status" bind:this={stalePanel}>
      <p class="stale-h" tabindex="-1" bind:this={staleHeading}><strong>{COPY.notesStale}</strong></p>
      <div class="row">
        <button type="button" class="qj-btn qj-btn--primary qj-btn--sm" onclick={() => void copy()}>{COPY.notesCopy}</button>
        <button type="button" class="qj-btn qj-btn--quiet qj-btn--sm" onclick={() => void reload()}>{COPY.notesReload}</button>
        <button type="button" class="qj-btn qj-btn--quiet qj-btn--sm" onclick={() => void save(true)}>{COPY.notesOverwrite}</button>
      </div>
    </div>
  {/if}
  <label class="qj-label" for="editor-{name}">{label}</label>
  <textarea id="editor-{name}" class="qj-textarea" bind:value={text} spellcheck="true" maxlength={MAX + 1000}></textarea>
  <p class="qj-hint count" aria-live="off">{text.length.toLocaleString('en-US')} / {MAX.toLocaleString('en-US')}</p>

  {#if note}<p class="qj-banner qj-banner--info" role="status">{note}</p>{/if}

  <div class="bar">
    {#if asking}
      <span class="ask" role="status">{COPY.notesDiscardAsk}</span>
      <button type="button" class="qj-btn qj-btn--quiet qj-btn--sm" onclick={oncancel}>{COPY.notesDiscardYes}</button>
      <button type="button" class="qj-btn qj-btn--sm" onclick={() => (asking = false)}>{COPY.notesDiscardNo}</button>
    {:else}
      <button type="button" class="qj-btn qj-btn--quiet" onclick={cancel}>{COPY.notesCancel}</button>
      <!-- While stale, the one Save path is the deliberate overwrite (never a second blind 412). -->
      <button type="button" class="qj-btn qj-btn--primary" aria-disabled={saving} onclick={() => void save(stale)}>
        {saving ? COPY.notesSaving : stale ? COPY.notesOverwrite : COPY.notesSave}
      </button>
    {/if}
  </div>
</div>

<style>
  .editor {
    display: grid;
    gap: var(--sp-2);
  }
  textarea {
    min-height: 60vh;
    font-size: max(16px, var(--fs-md, 1rem)); /* ≥16px: iOS doesn't zoom */
    line-height: 1.6;
    resize: vertical;
  }
  .count {
    margin: 0;
    text-align: right;
  }
  .stale .row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    margin-top: var(--sp-2);
  }
  .stale-h {
    margin: 0;
  }
  /* The whole panel lands in view, below the top safe area (H1 #316). `.qj-banner` is a row flexbox:
     the heading goes on top and the actions span the full width below it (H1 fix MED-1). */
  .stale {
    flex-direction: column;
    align-items: stretch;
    scroll-margin-top: calc(env(safe-area-inset-top, 0px) + var(--sp-3));
  }
  /* Narrow phones: full-width stacked actions, primary first (H1 #316). */
  @media (max-width: 400px) {
    .stale .row {
      flex-direction: column;
      align-items: stretch;
    }
    .stale .row :global(.qj-btn) {
      width: 100%;
    }
  }
  /* Sticky Save/Cancel with a paper backing, same rule as the Evening bar. */
  .bar {
    position: sticky;
    bottom: calc(var(--nav-height, 0px) + env(safe-area-inset-bottom, 0px));
    z-index: var(--z-sticky);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: var(--sp-2);
    padding: var(--sp-3) 0;
    background: var(--bg);
    box-shadow: 0 -1px 0 var(--line);
  }
  .ask {
    margin-right: auto;
  }
</style>

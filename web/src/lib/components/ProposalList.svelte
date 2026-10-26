<!--
  Insight suggestions for one ledger date (designer-AC10/11/14, psychologist-AC14/16).
  Nothing is pre-chosen. Keep/Skip per row (aria-pressed toggle pair), editable text for add/edit,
  one "Apply my choices" that writes once. All text is plain text: never {@html}, never linkified.
-->
<script lang="ts">
  import type { ProposalJson, ProposalOpJson } from '../../../../server/src/api-types';
  import { api, ApiError } from '../api';
  import { COPY } from '../copy';
  import { failureCopy } from '../http';
  import { refreshNotes } from '../notes.svelte';
  import { prettyDate } from '../questView';
  import { SealStamp } from '../theme';
  import { showToast } from '../toast.svelte';

  interface Props {
    proposal: ProposalJson;
    /** Show "From the ledger of …" (Profile lists several dates). */
    showDate?: boolean;
    onchange?: (p: ProposalJson) => void;
  }
  let { proposal: initial, showDate = false, onchange }: Props = $props();

  // svelte-ignore state_referenced_locally
  let proposal = $state<ProposalJson>(initial);
  let choice = $state<Record<string, 'keep' | 'skip' | null>>({});
  let texts = $state<Record<string, string>>({});
  let applying = $state(false);

  function reset(p: ProposalJson) {
    proposal = p;
    const c: Record<string, 'keep' | 'skip' | null> = {};
    const t: Record<string, string> = {};
    for (const o of p.ops) {
      c[o.op_id] = choice[o.op_id] ?? null;
      t[o.op_id] = texts[o.op_id] ?? o.text ?? '';
    }
    choice = c;
    texts = t;
  }
  // svelte-ignore state_referenced_locally
  reset(initial);

  const open = $derived(proposal.ops.filter((o) => o.decision === null));
  const chosen = $derived(open.filter((o) => choice[o.op_id] !== null && choice[o.op_id] !== undefined));

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function shortDate(d: string): string {
    const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(d);
    return m ? `${MONTHS[Number(m[1]) - 1]} ${Number(m[2])}` : d;
  }

  function eyebrow(o: ProposalOpJson): string {
    return o.op === 'add' ? COPY.proposalAdd : o.op === 'edit' ? COPY.proposalEdit : COPY.proposalRemove;
  }

  async function reload() {
    try {
      const r = await api.proposal(proposal.id);
      reset(r.data);
      onchange?.(r.data);
    } catch {
      /* keep what we have */
    }
  }

  async function apply(list: ProposalOpJson[] = chosen, all?: 'skip') {
    if (applying || list.length === 0) return;
    applying = true;
    const decisions = list.map((o) => {
      const keep = all ? false : choice[o.op_id] === 'keep';
      const d: { op_id: string; accept: boolean; text?: string } = { op_id: o.op_id, accept: keep };
      const t = texts[o.op_id];
      if (keep && o.op !== 'remove' && t !== undefined && t.trim() !== (o.text ?? '')) d.text = t;
      return d;
    });
    try {
      const r = await api.decide(proposal.id, decisions, proposal.etag);
      reset(r.data.proposal);
      onchange?.(r.data.proposal);
      const kept = decisions.filter((d) => d.accept).length;
      showToast(kept > 0 ? COPY.proposalApplied : COPY.proposalAppliedNone);
      void refreshNotes();
    } catch (e) {
      if (e instanceof ApiError && (e.status === 412 || e.status === 409)) {
        showToast(COPY.proposalChanged);
        await reload();
      } else {
        showToast(failureCopy(e));
      }
    } finally {
      applying = false;
    }
  }
</script>

<div class="plist">
  {#if showDate}<p class="from small muted">{COPY.proposalFrom(prettyDate(proposal.date))}</p>{/if}
  <ul>
    {#each proposal.ops as o (o.op_id)}
      <li class="row" class:skipped={o.decision === null && choice[o.op_id] === 'skip'} data-op={o.op} data-decision={o.decision ?? 'open'}>
        <div class="top">
          <span class="eyebrow">{eyebrow(o)}</span>
          {#if o.decision === 'accepted'}
            <SealStamp stamped kind="done" size={36} label={COPY.proposalKeep} />
          {/if}
        </div>

        {#if o.op !== 'add' && o.base_text}
          <p class="old"><s>{o.base_text}</s></p>
        {/if}

        {#if o.op === 'remove'}
          {#if o.reason}<p class="why">{COPY.proposalWhy(o.reason)}</p>{/if}
        {:else if o.decision === null}
          <label class="qj-sr-only" for={`t-${o.op_id}`}>{COPY.proposalTextLabel}</label>
          <!-- A wrapping field so a 200-char note is never cut mid-word (designer-AC14). -->
          <textarea id={`t-${o.op_id}`} class="qj-textarea note" rows="2" maxlength="200" bind:value={texts[o.op_id]}></textarea>
          <span class="counter small muted" aria-live="off">{COPY.proposalCounter((texts[o.op_id] ?? '').length)}</span>
        {:else}
          <p class="text">{o.text}</p>
        {/if}

        {#if o.flag === 'suspicious' && o.decision === null}
          <p class="flag small">{COPY.proposalFlag}</p>
        {/if}

        {#if o.evidence.length}
          <p class="ev small muted">
            <span>{COPY.proposalEvidence}</span>
            {#each o.evidence as d (d)}<span class="chip" aria-label={prettyDate(d)}>{shortDate(d)}</span>{/each}
          </p>
        {/if}

        {#if o.decision === 'stale'}
          <p class="small muted">{COPY.proposalStale}</p>
        {:else if o.decision === null}
          <div class="toggle" role="group" aria-label={eyebrow(o)}>
            <button
              type="button"
              class="qj-btn qj-btn--sm"
              aria-pressed={choice[o.op_id] === 'keep'}
              onclick={() => (choice[o.op_id] = choice[o.op_id] === 'keep' ? null : 'keep')}>{COPY.proposalKeep}</button
            >
            <button
              type="button"
              class="qj-btn qj-btn--quiet qj-btn--sm"
              aria-pressed={choice[o.op_id] === 'skip'}
              onclick={() => (choice[o.op_id] = choice[o.op_id] === 'skip' ? null : 'skip')}>{COPY.proposalSkip}</button
            >
          </div>
        {/if}
      </li>
    {/each}
  </ul>

  {#if open.length}
    <div class="actions">
      <button type="button" class="qj-btn" disabled={applying || chosen.length === 0} onclick={() => apply()}>
        {applying ? COPY.proposalApplying : COPY.proposalApply}
      </button>
      <button type="button" class="qj-btn qj-btn--quiet qj-btn--sm" disabled={applying} onclick={() => apply(open, 'skip')}>
        {COPY.proposalSkipAll}
      </button>
    </div>
  {/if}
</div>

<style>
  .plist {
    display: grid;
    gap: var(--sp-3);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: var(--sp-3);
  }
  .row {
    display: grid;
    gap: var(--sp-2);
    padding: var(--sp-3);
    border-left: 3px solid var(--ink-muted);
    background: var(--surface);
    border-radius: var(--r-sm);
    overflow-wrap: anywhere;
    min-width: 0;
  }
  .row[data-op='add'] {
    border-left-color: var(--jade);
  }
  .row[data-decision='rejected'] {
    opacity: 0.6;
  }
  .row[data-decision='rejected'] .eyebrow,
  .row[data-decision='rejected'] .text {
    color: var(--ink-muted);
  }
  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-2);
  }
  .eyebrow {
    font-size: var(--fs-xs);
    font-weight: var(--fw-bold);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--accent-ink);
  }
  .old,
  .why,
  .text {
    margin: 0;
  }
  .old {
    color: var(--ink-muted);
  }
  .note {
    min-height: 0;
    resize: vertical;
  }
  .counter {
    justify-self: end;
  }
  .ev {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-1);
    margin: 0;
  }
  .chip {
    padding: 0 var(--sp-2);
    border-radius: var(--r-pill);
    background: var(--surface-sunk);
  }
  .flag {
    margin: 0;
    color: var(--ink-muted);
    font-style: italic;
  }
  .toggle,
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    align-items: center;
  }
  .toggle .qj-btn[aria-pressed='false'] {
    --_bg: transparent;
    --_fg: var(--accent-ink);
  }
  /* Skipped rows go quiet right away, before Apply (designer M4 review MUST). */
  .skipped > :not(.toggle) {
    color: var(--ink-muted);
  }
  .from {
    margin: 0;
  }
  .small {
    font-size: var(--fs-sm);
  }
  .muted {
    color: var(--ink-muted);
  }
</style>

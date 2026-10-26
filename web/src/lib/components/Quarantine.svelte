<!--
  Calm notice for a day/week file the app can't read (BACKLOG MUST, psychologist-AC23).
  Shows the line number and the raw text read-only. Never "error", "invalid" or "broken" in visible copy.
-->
<script lang="ts">
  import type { FileProblem } from '../../../../server/src/api-types';
  import { COPY } from '../copy';
  import { Icon } from '../theme';

  interface Props {
    problem: FileProblem;
    /** Show the raw text (default true). */
    showRaw?: boolean;
  }
  let { problem, showRaw = true }: Props = $props();

  const message = $derived(problem.code === 'newer_schema' ? COPY.quarantineNewer : COPY.quarantine(problem.line));
</script>

<section class="qj-banner qj-banner--info quarantine" aria-live="polite">
  <Icon name="scroll" size="1.4em" />
  <div class="body">
    <p><strong>{message}</strong></p>
    {#if problem.field}<p>{COPY.quarantineField(problem.field)}</p>{/if}
    {#if problem.file}<p class="file">{COPY.quarantineFile('')}<code>{problem.file}</code></p>{/if}
    {#if showRaw && problem.raw !== undefined}
      <pre class="raw" aria-label="Your page as written">{#each problem.raw.split('\n') as line, i (i)}<span
            class="ln"
            class:hit={problem.line === i + 1}><span class="no" aria-hidden="true">{i + 1}</span>{line}
</span>{/each}</pre>
    {/if}
  </div>
</section>

<style>
  .quarantine {
    align-items: flex-start;
  }
  .body {
    display: grid;
    gap: var(--sp-2);
    min-width: 0;
    flex: 1;
  }
  .file {
    color: var(--ink-muted);
  }
  .raw {
    margin: 0;
    max-height: 18rem;
    overflow: auto;
    padding: var(--sp-2) var(--sp-3);
    border-radius: var(--r-sm);
    background: var(--surface);
    border: var(--bw-hair) solid var(--line);
    font-size: var(--fs-xs);
    line-height: 1.5;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .ln {
    display: block;
  }
  .ln.hit {
    background: var(--coin-soft);
    outline: 1px solid var(--coin);
  }
  .no {
    display: inline-block;
    min-width: 2.5em;
    color: var(--ink-muted);
    user-select: none;
  }
</style>

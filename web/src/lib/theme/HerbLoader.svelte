<!--
  HerbLoader: the wait while a claude -p job runs (10–125 s worst case).
  A round silk fan (團扇, the fan Tang court ladies carry) framing a detail of 搗練圖: court women
  working with long pestles. The detail bobs with the rhythm of the pestle while the work goes on.
  Messages change after 15 s and 45 s so a slow job never looks frozen. role="status": only the
  message text is announced. Reduced motion: a still fan and the same text.
-->
<script lang="ts">
  import Photo from './Photo.svelte';
  import { LOADING } from './vocab';

  interface Props {
    message?: string;
    /** Escalating reassurance; set [] to disable */
    phases?: { afterMs: number; text: string }[];
    size?: 'sm' | 'md' | 'lg';
    /** Show elapsed seconds (useful for long jobs) */
    showElapsed?: boolean;
    /** Epoch ms the wait really started (e.g. from the job), so phases survive remounts. Default: mount time. */
    startedAt?: number;
    class?: string;
  }

  let {
    message = LOADING.generate,
    phases = [
      { afterMs: 15_000, text: LOADING.slow },
      { afterMs: 45_000, text: LOADING.verySlow }
    ],
    size = 'md',
    showElapsed = false,
    startedAt,
    class: className = ''
  }: Props = $props();

  let elapsed = $state(0);

  $effect(() => {
    const started = startedAt ?? Date.now();
    elapsed = Math.max(0, Date.now() - started);
    const t = setInterval(() => (elapsed = Math.max(0, Date.now() - started)), 1000);
    return () => clearInterval(t);
  });

  /** The dots animate after the text, so a trailing "…"/"..." would read "herbs……". */
  const shown = $derived(message.replace(/(?:…|\.\.\.)\s*$/, ''));
  const detail = $derived(
    [...phases].sort((a, b) => b.afterMs - a.afterMs).find((p) => elapsed >= p.afterMs)?.text ?? ''
  );
</script>

<div class={['qj-loader', className]} data-size={size} role="status">
  <div class="fan" aria-hidden="true">
    <div class="silk">
      <Photo name="loader-pestle" position="40% 30%" loading="eager" />
    </div>
    <span class="handle"></span>
  </div>
  <div class="copy">
    <p class="msg">{shown}<span class="dots" aria-hidden="true"></span></p>
    {#if detail}<p class="detail">{detail}</p>{/if}
    {#if showElapsed && elapsed >= 5000}
      <p class="elapsed" aria-hidden="true">{Math.floor(elapsed / 1000)} s</p>
    {/if}
  </div>
</div>

<style>
  .qj-loader {
    --_m: 84px;
    display: grid;
    grid-template-columns: var(--_m) 1fr;
    align-items: center;
    gap: var(--sp-4);
    padding: var(--sp-3) 0;
  }
  .qj-loader[data-size='sm'] {
    --_m: 44px;
    gap: var(--sp-3);
    padding: var(--sp-2) 0;
  }
  .qj-loader[data-size='lg'] {
    --_m: 132px;
    grid-template-columns: 1fr;
    justify-items: center;
    text-align: center;
  }
  .fan {
    position: relative;
    width: var(--_m);
    padding-bottom: calc(var(--_m) * 0.32);
  }
  .silk {
    width: var(--_m);
    aspect-ratio: 1;
    border-radius: 50%;
    overflow: hidden;
    border: max(2px, calc(var(--_m) * 0.04)) solid var(--rod);
    box-shadow: inset 0 0 0 1px var(--surface), var(--shadow-2);
    background: var(--surface-sunk);
  }
  .silk :global(.qj-photo) {
    object-fit: cover;
    animation: pound 1.1s var(--ease-in-out) infinite;
    scale: 1.12;
  }
  .handle {
    position: absolute;
    left: 50%;
    bottom: 0;
    width: max(3px, calc(var(--_m) * 0.06));
    height: calc(var(--_m) * 0.36);
    translate: -50% 0;
    border-radius: 0 0 3px 3px;
    background: linear-gradient(to right, color-mix(in srgb, var(--rod) 60%, #fff), var(--rod));
  }
  @keyframes pound {
    0%, 100% { translate: 0 0; }
    45% { translate: 0 -3%; }
    55% { translate: 0 2%; }
  }
  .msg {
    margin: 0;
    font-family: var(--font-display);
    font-weight: var(--fw-display);
    font-size: var(--fs-md);
    color: var(--ink);
  }
  .qj-loader[data-size='sm'] .msg {
    font-size: var(--fs-sm);
  }
  .detail,
  .elapsed {
    margin: var(--sp-1) 0 0;
    font-size: var(--fs-sm);
    color: var(--ink-muted);
  }
  .dots::after {
    content: '';
    animation: dots 1.2s steps(4, end) infinite;
  }
  @keyframes dots {
    0% { content: ''; }
    25% { content: '·'; }
    50% { content: '··'; }
    75% { content: '···'; }
  }
  @media (prefers-reduced-motion: reduce) {
    .silk :global(.qj-photo),
    .dots::after {
      animation: none;
    }
  }
  /* The in-app motion switch behaves exactly like the media query. */
  :global(:root[data-motion='reduce']) .silk :global(.qj-photo),
  :global(:root[data-motion='reduce']) .dots::after {
    animation: none;
  }
</style>

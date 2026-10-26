<!--
  Sticker: a character reaction for an app event (quest_done, boss, reroll…).
  Files come from /stickers/manifest.json (gitignored personal-use images).
  The pick is deterministic per `seed` (e.g. the quest id), so it doesn't
  flicker on re-render. If a file fails to load, the next candidate is tried,
  then the event's SVG fallback. The images are rectangular screenshots/art,
  so they're presented as a die-cut paper sticker (white border, slight tilt).
  Always decorative (aria-hidden); announce the event itself elsewhere.
-->
<script lang="ts">
  import { stickerUrl } from './assets';
  import Icon from './Icon.svelte';
  import { DEFAULT_MANIFEST, loadStickerManifest, orderStickerFiles } from './stickers';
  import type { StickerEvent, StickerManifest } from './types';
  import { STICKER_FALLBACK } from './vocab';

  interface Props {
    event: StickerEvent;
    /** Deterministic pick: same seed → same sticker (quest id, date…) */
    seed?: string | number;
    /** Width in px (height follows 3:4) */
    size?: number;
    /** true = manifest caption, string = custom caption, false = none */
    caption?: boolean | string;
    /** Tilt in degrees; 'auto' derives a small tilt from the seed */
    tilt?: number | 'auto';
    /** diecut = white-bordered paper sticker, round = medallion */
    frame?: 'diecut' | 'round';
    /** Pop-in animation on mount */
    pop?: boolean;
    manifestUrl?: string;
    class?: string;
  }

  let {
    event,
    seed = 'default',
    size = 112,
    caption = false,
    tilt = 'auto',
    frame = 'diecut',
    pop = true,
    manifestUrl,
    class: className = ''
  }: Props = $props();

  let manifest = $state<StickerManifest>(DEFAULT_MANIFEST);
  let attempt = $state(0);

  $effect(() => {
    let alive = true;
    loadStickerManifest(manifestUrl).then((m) => {
      if (alive) manifest = m;
    });
    return () => {
      alive = false;
    };
  });

  const entry = $derived(manifest.events[event] ?? { files: [], fallback: STICKER_FALLBACK[event] });
  const files = $derived(orderStickerFiles(entry.files, `${event}:${seed}`, manifest.pick));
  const key = $derived(`${event}|${seed}|${files.join(',')}`);

  // reset the fallback chain whenever the candidate list changes
  let lastKey = '';
  $effect(() => {
    if (key !== lastKey) {
      lastKey = key;
      attempt = 0;
    }
  });

  const src = $derived(attempt < files.length ? stickerUrl(files[attempt], manifest.base) : null);
  const captionText = $derived(caption === true ? (entry.caption ?? '') : caption || '');
  const tiltDeg = $derived(
    tilt === 'auto' ? (([...String(seed)].reduce((a, c) => a + c.charCodeAt(0), 0) % 9) - 4) : tilt
  );
</script>

<figure
  class={['qj-sticker', className]}
  data-frame={frame}
  data-pop={pop ? '' : undefined}
  style:--size="{size}px"
  style:--tilt="{tiltDeg}deg"
  aria-hidden="true"
>
  <span class="card">
    {#if src}
      {#key src}
        <img
          {src}
          alt=""
          width={size}
          height={Math.round((size * 4) / 3)}
          decoding="async"
          draggable="false"
          onerror={() => attempt++}
        />
      {/key}
    {:else}
      <span class="fallback"><Icon name={entry.fallback} size="62%" /></span>
    {/if}
  </span>
  {#if captionText}<figcaption>{captionText}</figcaption>{/if}
</figure>

<style>
  .qj-sticker {
    --size: 112px;
    --tilt: -3deg;
    display: inline-grid;
    justify-items: center;
    gap: var(--sp-2);
    margin: 0;
    width: max-content;
    max-width: 100%;
  }
  .card {
    display: block;
    width: var(--size);
    aspect-ratio: 3 / 4;
    box-sizing: border-box;
    padding: 5px;
    border-radius: 14px;
    background: #fffdf6;
    rotate: var(--tilt);
    box-shadow:
      0 0 0 1px rgb(0 0 0 / 0.06),
      var(--shadow-2);
    overflow: hidden;
  }
  .qj-sticker[data-frame='round'] .card {
    aspect-ratio: 1;
    border-radius: 50%;
    padding: 4px;
    background: var(--boss);
  }
  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: 50% 20%;
    border-radius: 10px;
  }
  .qj-sticker[data-frame='round'] img {
    border-radius: 50%;
  }
  .fallback {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    border-radius: 10px;
    color: var(--jade);
    background:
      radial-gradient(circle at 50% 40%, var(--accent-soft), transparent 75%),
      var(--paper);
  }
  figcaption {
    max-width: calc(var(--size) * 1.8);
    padding: 2px var(--sp-2);
    border-radius: var(--r-sm);
    background: var(--surface);
    border: 1px solid var(--line);
    color: var(--ink-muted);
    font-size: var(--fs-xs);
    line-height: var(--lh-snug);
    text-align: center;
    rotate: calc(var(--tilt) * -0.5);
  }

  .qj-sticker[data-pop] .card {
    animation: pop var(--dur-sticker) var(--ease-stamp) both;
  }
  @keyframes pop {
    from { opacity: 0; transform: scale(0.6) rotate(-10deg); }
    to { opacity: 1; transform: none; }
  }
  @media (prefers-reduced-motion: reduce) {
    .qj-sticker[data-pop] .card {
      animation-name: qj-fade-in;
    }
  }
</style>

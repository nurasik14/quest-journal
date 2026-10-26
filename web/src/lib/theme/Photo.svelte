<!--
  Photo: a real decoration image from /decor/img (gitignored, see
  IMAGE_SOURCES.md). If the file is missing or fails to load, it swaps to the
  matching single-colour SVG fallback. Decorative by default.
-->
<script lang="ts">
  import { PHOTO_FALLBACK, photoUrl } from './assets';
  import Icon from './Icon.svelte';
  import type { DecorPhoto, DecorSvg } from './types';

  interface Props {
    name: DecorPhoto;
    /** SVG to show if the photo fails (defaults to a sensible match) */
    fallback?: DecorSvg;
    /** Alt text. Empty string = decorative (aria-hidden). */
    alt?: string;
    fit?: 'cover' | 'contain';
    /** object-position, e.g. "50% 30%" */
    position?: string;
    loading?: 'lazy' | 'eager';
    /** Dim/desaturate in dark theme (uses --photo-filter). Default true. */
    themed?: boolean;
    class?: string;
  }

  let {
    name,
    fallback,
    alt = '',
    fit = 'cover',
    position = '50% 50%',
    loading = 'lazy',
    themed = true,
    class: className = ''
  }: Props = $props();

  let failedFor = $state<string | null>(null);
  const src = $derived(photoUrl(name));
  const failed = $derived(failedFor === src);
</script>

{#if failed}
  <span class={['qj-photo', 'qj-photo--fallback', className]} aria-hidden="true">
    <Icon name={fallback ?? PHOTO_FALLBACK[name]} size="60%" />
  </span>
{:else}
  <img
    class={['qj-photo', className]}
    class:themed
    {src}
    {alt}
    aria-hidden={alt === '' ? 'true' : undefined}
    {loading}
    decoding="async"
    draggable="false"
    style:object-fit={fit}
    style:object-position={position}
    onerror={() => (failedFor = src)}
  />
{/if}

<style>
  .qj-photo {
    display: block;
    width: 100%;
    height: 100%;
    max-width: 100%;
  }
  img.themed {
    filter: var(--photo-filter);
  }
  .qj-photo--fallback {
    display: grid;
    place-items: center;
    color: var(--accent);
    background:
      radial-gradient(circle at 50% 40%, var(--accent-soft), transparent 70%),
      var(--surface-sunk);
  }
</style>

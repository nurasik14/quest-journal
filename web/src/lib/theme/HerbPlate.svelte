<!--
  HerbPlate: one woodblock plate from Wu Qijun's 植物名實圖考 (1848), printed in the theme's ink.
  The scan was reduced to an ink-only alpha mask, so the drawing takes `currentColor` and sits on the
  paper like a real impression (light and dark theme alike). It is real content, not ornament: the
  figure carries the herb's name, and the label is announced once.
  If the file is missing, a small herb-sprig icon stands in and the caption still names the herb.
-->
<script lang="ts">
  import { herbPlateUrl } from './assets';
  import type { HerbPlate } from './folio';
  import Icon from './Icon.svelte';

  interface Props {
    plate: HerbPlate;
    /** Drawing height (CSS length) */
    height?: string;
    /** full = brush name + pinyin + English, name = brush name only, none = drawing only */
    caption?: 'full' | 'name' | 'none';
    class?: string;
  }

  let { plate, height = '7rem', caption = 'full', class: className = '' }: Props = $props();

  const url = $derived(herbPlateUrl(plate.slug));
  let failedFor = $state<string | null>(null);
  const failed = $derived(failedFor === url);
  const label = $derived(`Woodblock drawing of ${plate.english.toLowerCase()} (${plate.han}, ${plate.pinyin})`);
</script>

<figure class={['qj-plate', className]} style:--_h={height}>
  {#if failed}
    <span class="ink fallback" role="img" aria-label={label}><Icon name="herb-sprig" size="60%" /></span>
  {:else}
    <span class="ink" role="img" aria-label={label} style:--_src="url('{url}')"></span>
    <!-- load probe: the mask itself can't report a failed fetch -->
    <img class="probe" src={url} alt="" aria-hidden="true" onerror={() => (failedFor = url)} />
  {/if}
  {#if caption !== 'none'}
    <figcaption>
      <span class="han" lang="zh-Hant">{plate.han}</span>
      {#if caption === 'full'}
        <span class="romaji"><i lang="zh-Latn-pinyin">{plate.pinyin}</i></span>
        <span class="romaji">{plate.english}</span>
      {/if}
    </figcaption>
  {/if}
</figure>

<style>
  .qj-plate {
    margin: 0;
    display: grid;
    justify-items: center;
    gap: var(--sp-1);
    color: var(--ink);
  }
  .ink {
    display: block;
    height: var(--_h);
    aspect-ratio: 5 / 8;
    background: currentColor;
    -webkit-mask: var(--_src) center / contain no-repeat;
    mask: var(--_src) center / contain no-repeat;
    opacity: 0.88;
  }
  .fallback {
    display: grid;
    place-items: center;
    background: none;
    -webkit-mask: none;
    mask: none;
    color: var(--jade);
  }
  .probe {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }
  figcaption {
    display: grid;
    justify-items: center;
    gap: 2px;
    text-align: center;
    line-height: 1.2;
  }
  .han {
    font-family: var(--font-brush);
    font-size: 1.25rem;
    letter-spacing: 0.1em;
    color: var(--ink);
  }
  .romaji {
    font-size: var(--fs-xs);
    color: var(--ink-muted);
  }
</style>

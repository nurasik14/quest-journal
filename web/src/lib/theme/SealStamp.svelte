<!--
  SealStamp: the vermilion chop pressed onto a quest when it's completed.
  It animates only when `stamped` flips false → true while mounted, so it
  doesn't re-animate on page load. Reduced motion: a 160ms fade.
  The seal itself is a UI status mark (role="img" + label), not decoration.
-->
<script lang="ts">
  import type { SealKind } from './types';
  import { SEAL } from './vocab';

  interface Props {
    stamped?: boolean;
    kind?: SealKind;
    /** Override the glyph (one CJK character reads best) */
    glyph?: string;
    /** Accessible label; defaults per kind ("Done", …) */
    label?: string;
    /** Edge length in px */
    size?: number;
    /** Animate on false → true (default true) */
    animate?: boolean;
    /** Show a faint dashed placeholder while not stamped */
    ghost?: boolean;
    /** Short vibration on stamp where supported (default false) */
    haptic?: boolean;
    onstamped?: () => void;
    class?: string;
  }

  let {
    stamped = false,
    kind = 'done',
    glyph,
    label,
    size = 56,
    animate = true,
    ghost = false,
    haptic = false,
    onstamped,
    class: className = ''
  }: Props = $props();

  let stamping = $state(false);
  let prev: boolean | undefined;

  $effect(() => {
    const now = stamped;
    if (prev === false && now && animate) {
      stamping = true;
      if (haptic && typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate?.(12);
    }
    if (!now) stamping = false;
    prev = now;
  });

  function onEnd(e: AnimationEvent) {
    if (e.target === e.currentTarget && e.animationName.endsWith('stamp-in')) {
      stamping = false;
      onstamped?.();
    }
  }
</script>

{#if stamped}
  <span
    class={['qj-seal', className]}
    class:stamping
    data-kind={kind}
    style:--size="{size}px"
    role="img"
    aria-label={label ?? SEAL[kind].label}
    onanimationend={onEnd}
  >
    <span class="ink" aria-hidden="true">
      <span class="glyph">{glyph ?? SEAL[kind].glyph}</span>
    </span>
  </span>
{:else if ghost}
  <span class={['qj-seal', 'ghost', className]} data-kind={kind} style:--size="{size}px" aria-hidden="true"></span>
{/if}

<style>
  .qj-seal {
    --size: 56px;
    position: relative;
    display: inline-grid;
    place-items: center;
    width: var(--size);
    height: var(--size);
    color: var(--seal);
    rotate: -7deg;
    flex: none;
    user-select: none;
  }
  .ink {
    position: relative;
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    border: calc(var(--size) * 0.07) solid currentColor;
    border-radius: var(--r-seal);
    outline: calc(var(--size) * 0.025) solid currentColor;
    outline-offset: calc(var(--size) * -0.17);
    background: color-mix(in srgb, currentColor 9%, transparent);
    box-shadow: var(--glow-seal);
    overflow: hidden;
  }
  /* hand-pressed speckle: paper-coloured noise knocked out of the ink */
  .ink::after {
    content: '';
    position: absolute;
    inset: 0;
    background: var(--surface);
    -webkit-mask: var(--qj-decor-seal-grain) 0 0 / 48px 48px;
    mask: var(--qj-decor-seal-grain) 0 0 / 48px 48px;
    opacity: 0.55;
    pointer-events: none;
  }
  .glyph {
    font-family: var(--font-seal);
    font-weight: var(--fw-display-heavy);
    font-size: calc(var(--size) * 0.5);
    line-height: 1;
    color: currentColor;
  }

  .qj-seal[data-kind='partial'] .ink {
    border-radius: 50%;
    outline-offset: calc(var(--size) * -0.19);
  }
  .qj-seal[data-kind='boss'] {
    rotate: -10deg;
  }
  .qj-seal[data-kind='boss'] .ink {
    box-shadow:
      0 0 0 calc(var(--size) * 0.05) var(--surface),
      0 0 0 calc(var(--size) * 0.09) var(--boss),
      var(--glow-lantern);
  }
  .qj-seal[data-kind='bought'] {
    rotate: 5deg;
  }

  .ghost {
    border: 2px dashed var(--line);
    border-radius: var(--r-seal);
    box-sizing: border-box;
    rotate: -7deg;
  }

  /* Stamp animation */
  .stamping {
    animation: stamp-in var(--dur-stamp) var(--ease-stamp) both;
  }
  .stamping::before {
    content: '';
    position: absolute;
    inset: -22%;
    border-radius: 50%;
    border: 2px solid currentColor;
    opacity: 0;
    animation: ring var(--dur-stamp) var(--ease-out) both;
    pointer-events: none;
  }
  @keyframes stamp-in {
    0% { opacity: 0; transform: scale(1.9) rotate(-14deg); filter: blur(1.5px); }
    50% { opacity: 1; transform: scale(0.9) rotate(2deg); filter: none; }
    72% { transform: scale(1.05) rotate(-1deg); }
    100% { opacity: 1; transform: none; }
  }
  @keyframes ring {
    0%, 40% { opacity: 0; transform: scale(0.55); }
    55% { opacity: 0.45; }
    100% { opacity: 0; transform: scale(1.25); }
  }
  @media (prefers-reduced-motion: reduce) {
    .stamping {
      animation-name: qj-fade-in;
      animation-timing-function: linear;
    }
    .stamping::before {
      display: none;
    }
  }
</style>

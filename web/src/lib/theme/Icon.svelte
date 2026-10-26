<!--
  Icon: single-colour SVG from /decor rendered as a CSS mask so it takes
  `currentColor`. Used for UI icons (nav, categories) and as the fallback for
  missing photos. Decorative by default (aria-hidden); pass `label` to make it
  an image with an accessible name.
-->
<script lang="ts">
  import type { DecorSvg } from './types';

  interface Props {
    name: DecorSvg;
    /** CSS length; defaults to 1.25em so it scales with text */
    size?: string;
    /** Accessible name. Omit for decorative icons. */
    label?: string;
    class?: string;
  }

  let { name, size = '1.25em', label, class: className = '' }: Props = $props();
</script>

<span
  class={['qj-icon', className]}
  style:--qj-icon-src="var(--qj-decor-{name})"
  style:--qj-icon-size={size}
  role={label ? 'img' : undefined}
  aria-label={label}
  aria-hidden={label ? undefined : 'true'}
></span>

<style>
  .qj-icon {
    display: inline-block;
    flex: none;
    width: var(--qj-icon-size);
    height: var(--qj-icon-size);
    background-color: currentColor;
    -webkit-mask: var(--qj-icon-src) center / contain no-repeat;
    mask: var(--qj-icon-src) center / contain no-repeat;
    vertical-align: -0.2em;
  }
</style>

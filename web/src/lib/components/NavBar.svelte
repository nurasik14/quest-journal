<!-- Bottom index tabs (designer §0): the paper tabs glued to the fore-edge of the notebook, one brush
     character each (方 録 市 苑 記) over the English label. The current tab is the page you're on: it joins
     the paper and carries a vermilion edge; aria-current says so. No counts: the only badge is a jade dot
     on Notes when insight suggestions wait (designer-AC12). -->
<script lang="ts">
  import { NAV, NAV_KANJI } from '../theme';
  import { NAV_PATHS, type NavId } from '../router.svelte';

  import { COPY } from '../copy';

  interface Props {
    active: NavId | null;
    /** Jade dot on the Notes tab (pending suggestions). Never a number. */
    dot?: boolean;
  }
  let { active, dot = false }: Props = $props();
</script>

<nav class="tabbar" aria-label="Main">
  <ul>
    {#each NAV as item (item.id)}
      <li>
        <a
          href={NAV_PATHS[item.id]}
          aria-current={active === item.id ? 'page' : undefined}
          aria-label={item.id === 'profile' && dot ? COPY.notesTabLabel : undefined}
        >
          <span class="k" aria-hidden="true">{NAV_KANJI[item.id]}</span>
          <span class="l">{item.label}</span>
          {#if item.id === 'profile' && dot}<span class="dot" aria-hidden="true"></span>{/if}
        </a>
      </li>
    {/each}
  </ul>
</nav>

<style>
  .tabbar {
    position: fixed;
    inset: auto 0 0 0;
    z-index: var(--z-nav);
    background: var(--desk);
    border-top: 2px solid var(--rule);
    box-shadow: var(--shadow-3);
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }
  ul {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 3px;
    max-width: var(--content-max);
    margin: 0 auto;
    padding: 0 6px;
    list-style: none;
  }
  a {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1px;
    min-height: var(--nav-height);
    min-width: var(--tap);
    color: var(--ink-muted);
    text-decoration: none;
    -webkit-tap-highlight-color: transparent;
  }
  .k {
    font-family: var(--font-brush);
    font-size: 1.35rem;
    line-height: 1.1;
    color: var(--ink);
  }
  .l {
    font-size: var(--fs-xs);
    letter-spacing: 0.02em;
  }
  /* the current tab is part of the page: paper-coloured, hanging from the vermilion edge */
  a[aria-current='page'] {
    margin-top: -2px;
    background: var(--bg);
    color: var(--ink);
    font-weight: var(--fw-bold);
    border-inline: 1px solid var(--rule);
    border-bottom: 1px solid var(--rule);
    border-radius: 0 0 var(--r-lg) var(--r-lg);
  }
  a[aria-current='page'] .k {
    color: var(--seal);
  }
  a:hover .k {
    color: var(--seal);
  }
  .dot {
    position: absolute;
    top: 8px;
    right: calc(50% - 20px);
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--jade);
    box-shadow: 0 0 0 2px var(--desk);
  }
</style>

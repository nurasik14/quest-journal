<!-- App shell (designer screens.md §0): page container, offline banner, toast, bottom tab bar. -->
<script lang="ts">
  import { tick } from 'svelte';
  import NavBar from './lib/components/NavBar.svelte';
  import { COPY } from './lib/copy';
  import { net } from './lib/net.svelte';
  import { linkHandler, navIdOf, router } from './lib/router.svelte';
  import { dismissToast, holdToast, toast } from './lib/toast.svelte';
  import Archive from './routes/Archive.svelte';
  import Evening from './routes/Evening.svelte';
  import Market from './routes/Market.svelte';
  import NotFound from './routes/NotFound.svelte';
  import Onboarding from './routes/Onboarding.svelte';
  import Profile from './routes/Profile.svelte';
  import { notes, refreshNotes } from './lib/notes.svelte';
  import { ledger, refreshEconomy } from './lib/economy.svelte';
  import Today from './routes/Today.svelte';

  let main = $state<HTMLElement | null>(null);
  const fullScreen = $derived(router.route.name === 'onboarding');

  // The Notes dot (designer-AC12): refreshed on every navigation (cheap: one small GET).
  $effect(() => {
    void router.seq;
    void refreshNotes();
    // Header balance on screens that don't load it themselves (Evening, Garden, Notes). Today and the
    // Market feed the same store from their own responses.
    if (ledger.economy === null && router.route.name !== 'today' && router.route.name !== 'market') void refreshEconomy();
  });

  // Move focus to the page h1 on route change (designer a11y checklist), not on first load.
  $effect(() => {
    if (router.seq === 0) return;
    void tick().then(() => {
      const h1 = main?.querySelector('h1');
      if (h1) {
        if (!h1.hasAttribute('tabindex')) h1.setAttribute('tabindex', '-1');
        h1.focus({ preventScroll: true });
      }
    });
  });
</script>

<svelte:document onclick={linkHandler} />

{#if net.offline}
  <p class="qj-banner qj-banner--info offline" role="status">{COPY.offline}</p>
{/if}

<main class="qj-page" class:full={fullScreen} bind:this={main} id="main">
  {#key router.route.name === 'evening' ? `evening:${router.route.date ?? ''}` : router.route.name}
    {#if router.route.name === 'today'}
      <Today />
    {:else if router.route.name === 'evening'}
      <Evening date={router.route.date} />
    {:else if router.route.name === 'market'}
      <Market />
    {:else if router.route.name === 'archive'}
      <Archive />
    {:else if router.route.name === 'profile'}
      <Profile />
    {:else if router.route.name === 'onboarding'}
      <Onboarding />
    {:else}
      <NotFound />
    {/if}
  {/key}
</main>

<div class="toast" class:below-offline={net.offline} role="status" aria-live="polite">
  {#if toast.text}
    {#if toast.action}
      {@const action = toast.action}
      <!-- An action toast stays while focused or hovered (designer-AC14). -->
      <p
        class="has-action"
        onmouseenter={() => holdToast(true)}
        onmouseleave={() => holdToast(false)}
        onfocusin={() => holdToast(true)}
        onfocusout={() => holdToast(false)}
      >
        <span>{toast.text}</span>
        <button
          type="button"
          class="qj-btn qj-btn--quiet qj-btn--sm toast-action"
          onclick={() => {
            const run = action.run; // read before dismissing: {@const} is derived from toast.action
            dismissToast();
            run();
          }}>{action.label}</button
        >
      </p>
    {:else}
      <p>{toast.text}</p>
    {/if}
  {/if}
</div>

{#if !fullScreen}<NavBar active={navIdOf(router.route)} dot={notes.pending > 0} />{/if}

<style>
  .offline {
    position: sticky;
    top: 0;
    z-index: var(--z-sticky);
    margin: 0;
    border-radius: 0;
  }
  /* Toasts sit at the TOP so they never cover Done, Seal or Apply (designer M3 review, backlog #492b). */
  /* Centred without shrink-wrapping to 50vw (designer M5 review): ≤2 lines at 390 px. */
  .toast {
    position: fixed;
    left: 0;
    right: 0;
    margin-inline: auto;
    width: fit-content;
    top: calc(env(safe-area-inset-top, 0px) + var(--sp-3));
    z-index: var(--z-toast);
    max-width: min(32rem, calc(100vw - 2 * var(--sp-4)));
    pointer-events: none;
  }
  /* Settings → Stickers: Off removes all character art (designer-AC16). */
  :global(:root[data-stickers='off'] .qj-sticker) {
    display: none !important;
  }
  .toast.below-offline {
    top: calc(env(safe-area-inset-top, 0px) + var(--sp-3) + 3rem);
  }
  /* Onboarding is full screen: no tab bar, so no room reserved for it. */
  :global(.qj-page.full) {
    padding-bottom: var(--sp-4);
  }
  .toast p.has-action {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    pointer-events: auto;
    padding-block: var(--sp-1);
  }
  .toast .toast-action {
    --_fg: var(--bg);
    text-decoration: underline;
  }
  .toast p {
    margin: 0;
    padding: var(--sp-3) var(--sp-4);
    border-radius: var(--r-md);
    background: var(--ink);
    color: var(--bg);
    box-shadow: var(--shadow-3);
    font-size: var(--fs-sm);
  }
</style>

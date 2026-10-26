<!--
  Palace Market (designer screens.md §3, sprint M5 goal 20). Spending is celebrated, never questioned:
  no confirm dialog, no red, rows are never hidden or disabled. The balance comes from the one ledger store.
  A purchase uses one request_id per tap, kept across a network retry, replaced only after a definite answer.
-->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { FileProblem, PurchaseJson, ShopItemJson, ShopResponse } from '../../../server/src/api-types';
  import { api, ApiError, NetworkError } from '../lib/api';
  import BalanceBadge from '../lib/components/BalanceBadge.svelte';
  import OfflineCard from '../lib/components/OfflineCard.svelte';
  import Quarantine from '../lib/components/Quarantine.svelte';
  import { COPY, whenLabel } from '../lib/copy';
  import { fmtTaels, ledger, setEconomy } from '../lib/economy.svelte';
  import { balanceAfterText, sheetMode } from '../lib/ledgerRules';
  import { buyWithRetry } from '../lib/purchase';
  import { failureCopy } from '../lib/http';
  import { FOCUSABLE_SELECTOR, focusables, trapTarget } from '../lib/focusTrap';
  import { newRequestId } from '../lib/requestId';
  import { prettyDate } from '../lib/questView';
  import { CoinBadge, Photo, ScrollCard, SealStamp, Sticker } from '../lib/theme';
  import { showToast } from '../lib/toast.svelte';

  const TIERS = ['free', 'small', 'medium', 'large', 'grand'] as const;

  let shop = $state<ShopResponse | null>(null);
  let purchases = $state<PurchaseJson[]>([]);
  let loading = $state(true);
  let rewardsProblem = $state<FileProblem | null>(null);
  /** First load couldn't reach the laptop (H1, backlog 299). */
  let unreachable = $state(false);

  let sheet = $state<ShopItemJson | null>(null);
  let sheetNote = $state<string | null>(null);
  /**
   * Fixed when the sheet opens (H1, backlog 225): 'save' when the item can't be bought now, so no Buy seal that can only
   * 409. A sheet opened as 'buy' stays 'buy' after a race 409 (current behaviour, PROVISIONAL).
   */
  let mode = $state<'buy' | 'save'>('buy');
  let buying = $state(false);
  let wishing = $state(false);
  /** One idempotency key per tap, reused on retry until the server answers definitively (architect risk 5). */
  let pending: { itemId: string; requestId: string } | null = null;
  let lastFocus: HTMLElement | null = null;
  let sheetEl = $state<HTMLElement | null>(null);

  let boughtId = $state<string | null>(null);
  let stickerFor = $state<string | null>(null);
  let stickerTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * One live sentence per coin event (sprint AC17, designer-AC4): the toast (role=status) is the only voice for
   * buy and undo, so the hero badge is silent and the sticker is decorative.
   */
  let buyBtn = $state<HTMLButtonElement | null>(null);

  const balance = $derived(ledger.economy?.balance ?? null);
  const today = $derived(shop?.date ?? '');
  const hasTiers = $derived(shop?.items.some((i) => i.tier !== undefined) ?? false);
  const groups = $derived.by(() => {
    const items = shop?.items ?? [];
    if (!hasTiers) return [{ tier: null as string | null, items }];
    const out: { tier: string | null; items: ShopItemJson[] }[] = TIERS.map((t) => ({ tier: t, items: items.filter((i) => i.tier === t) }));
    out.push({ tier: null, items: items.filter((i) => i.tier === undefined) });
    return out.filter((g) => g.items.length > 0);
  });
  const wish = $derived(shop?.wishlist ?? null);

  async function load() {
    try {
      const res = await api.shop();
      shop = res.data;
      rewardsProblem = null;
      unreachable = false;
      setEconomy(res.data.economy);
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) rewardsProblem = problemOf(e);
      else if (e instanceof NetworkError) unreachable = shop === null;
      else console.warn('[market] load', e);
    } finally {
      loading = false;
    }
    try {
      purchases = (await api.purchases(20)).data.purchases;
    } catch {
      /* a broken purchases.yaml shows its own notice via shop.purchases_error */
    }
  }

  function problemOf(e: ApiError): FileProblem {
    const d = e.details as Record<string, unknown>;
    return {
      code: e.code,
      file: typeof d.file === 'string' ? d.file : 'rewards.yaml',
      ...(typeof d.line === 'number' ? { line: d.line } : {}),
      ...(typeof d.raw === 'string' ? { raw: d.raw } : {})
    };
  }

  onMount(() => {
    void load();
    return () => {
      if (stickerTimer) clearTimeout(stickerTimer);
    };
  });

  /** Sub-line under a row (never red, never a countdown timer). */
  function subline(i: ShopItemJson): string | null {
    if (i.available_on) return COPY.availableAgain(whenLabel(i.available_on, today));
    if (balance !== null && balance < i.price) return COPY.needsMore(fmtTaels(i.price - balance));
    return i.note ?? null;
  }

  function explain(i: ShopItemJson): string | null {
    if (i.available_on) return COPY.sheetCooldown(whenLabel(i.available_on, today));
    if (balance !== null && balance < i.price) return COPY.sheetHave(fmtTaels(balance), fmtTaels(i.price));
    return null;
  }

  async function openSheet(i: ShopItemJson, ev: MouseEvent) {
    lastFocus = ev.currentTarget as HTMLElement;
    sheet = i;
    mode = sheetMode(balance, i.price, i.available_on, today);
    sheetNote = explain(i);
    if (pending && pending.itemId !== i.id) pending = null;
    await tick();
    sheetEl?.querySelector<HTMLElement>('h2')?.focus();
  }

  function closeSheet() {
    if (buying) return;
    sheet = null;
    sheetNote = null;
    const f = lastFocus;
    void tick().then(() => f?.focus());
  }

  function trap(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeSheet();
      return;
    }
    if (e.key !== 'Tab' || !sheetEl) return;
    // Same filter as the shared BottomSheet (M6 fix 1, MED-1).
    const nodes = focusables(sheetEl.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    if (nodes.length === 0) return;
    const active = document.activeElement;
    const target = trapTarget(nodes, active, sheetEl.contains(active), e.shiftKey, (a, b) =>
      a instanceof Node ? (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 : false
    );
    if (target === null || target === 'stay') return;
    e.preventDefault();
    target.focus();
  }

  async function buy() {
    const item = sheet;
    if (!item || buying) return;
    buying = true;
    sheetNote = null;
    try {
      // Inside the try (architect-AC14): a failure to make a key can never leave the button dead and silent.
      if (!pending || pending.itemId !== item.id) pending = { itemId: item.id, requestId: newRequestId() };
      const { requestId } = pending;
      // One retry with the SAME request_id (psychologist-AC19, tested in h1-web.test.ts).
      const res = await buyWithRetry(api.buy, item.id, requestId);
      pending = null;
      const p = res.data.purchase;
      setEconomy(res.data.economy);
      buying = false;
      sheet = null;
      const row = document.getElementById(`row-${item.id}`);
      void tick().then(() => row?.focus());
      boughtId = null;
      await tick();
      boughtId = item.id;
      stickerFor = item.id;
      if (stickerTimer) clearTimeout(stickerTimer);
      stickerTimer = setTimeout(() => (stickerFor = null), 4000);
      showToast(COPY.boughtToast(p.title), 8000, { label: COPY.undo, run: () => void undo(p) });
      await load();
    } catch (e) {
      buying = false;
      if (e instanceof NetworkError) {
        showToast(COPY.unknownResult); // the key is kept: tapping again can never charge twice
        return;
      }
      pending = null;
      if (e instanceof ApiError) {
        if (e.code === 'insufficient_funds') {
          const d = e.details as { balance?: number; price?: number };
          sheetNote = COPY.sheetHave(fmtTaels(d.balance ?? 0), fmtTaels(d.price ?? item.price));
        } else if (e.code === 'cooldown') {
          const d = e.details as { available_on?: string };
          sheetNote = d.available_on ? COPY.sheetCooldown(whenLabel(d.available_on, today)) : null;
        } else {
          sheet = null;
        }
        await load();
        if (sheet) {
          const fresh = shop?.items.find((i) => i.id === item.id);
          if (fresh) sheet = fresh;
          // Keep focus inside the dialog after a refusal (LOW-1): the note is linked via aria-describedby.
          await tick();
          buyBtn?.focus();
        }
      } else {
        // Anything unexpected still gets one honest sentence, never a silent dead button (architect-AC14).
        console.warn('[market] buy', e);
        showToast(COPY.unknownResult);
      }
    }
  }

  async function undo(p: PurchaseJson) {
    try {
      const res = await api.voidPurchase(p.id);
      setEconomy(res.data.economy);
      if (boughtId === p.item_id) boughtId = null;
      showToast(COPY.voided(p.price));
      await load();
    } catch (e) {
      if (e instanceof ApiError) await load();
      else showToast(COPY.unknownResult);
    }
  }

  async function toggleWish(i: ShopItemJson) {
    if (wishing) return;
    wishing = true;
    try {
      const res = i.wished ? await api.unwish(i.id) : await api.wish(i.id);
      shop = res.data;
      setEconomy(res.data.economy);
      sheet = res.data.items.find((x) => x.id === i.id) ?? sheet;
    } catch (e) {
      if (e instanceof NetworkError) showToast(failureCopy(e));
      else await load();
    } finally {
      wishing = false;
    }
  }

  const priceMuted = (i: ShopItemJson) => i.available_on !== null || balance === null || balance < i.price;
</script>

<svelte:head><title>Palace market · Quest Journal</title></svelte:head>
<!-- Esc and the Tab trap work wherever focus is while the sheet is open (designer-AC12). -->
<svelte:window onkeydown={(e) => sheet && trap(e)} />

<header class="hero">
  <Photo name="drawers" position="50% 40%" loading="eager" />
  <div class="scrim" aria-hidden="true"></div>
  <div class="hero-in">
    <h1 tabindex="-1">{COPY.marketTitle}</h1>
    <BalanceBadge size="lg" announce={null} />
  </div>
</header>

{#if loading && !shop}
  <div class="rows" aria-hidden="true">
    {#each [1, 2, 3, 4] as i (i)}<div class="row skeleton"><span class="bar"></span><span class="bar short"></span></div>{/each}
  </div>
{:else if unreachable && !shop}
  <OfflineCard
    busy={loading}
    onretry={() => {
      loading = true;
      void load();
    }}
  />
{:else if rewardsProblem}
  <Quarantine problem={rewardsProblem} />
{:else if shop}
  {#if shop.purchases_error}
    <p class="small muted">{COPY.marketBalanceUnknown}</p>
    <Quarantine problem={shop.purchases_error} />
  {/if}

  {#if wish && wish.have !== null}
    {@const have = Math.max(0, Math.min(wish.have, wish.price))}
    <ScrollCard>
      {#snippet heading()}<h2>{COPY.wishlistHeading}</h2>{/snippet}
      <p class="wish-title">{wish.title}</p>
      <div
        class="progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={wish.price}
        aria-valuenow={have}
        aria-label={COPY.wishProgress(fmtTaels(wish.have), wish.price)}
      >
        <span class="fill" style:width="{(have / wish.price) * 100}%"></span>
      </div>
      <p class="small tabular">
        {COPY.wishProgress(fmtTaels(wish.have), wish.price)}
        {#if (wish.need ?? 1) === 0}· {COPY.wishReady}{:else if wish.est_days !== null}· {COPY.wishPace(wish.est_days)}{/if}
      </p>
    </ScrollCard>
  {/if}

  {#if shop.items.length === 0}
    <ScrollCard variant="quiet">
      <p>{COPY.marketEmpty} <code>{COPY.marketEmptyFile}</code>.</p>
    </ScrollCard>
  {:else}
    {#each groups as g (g.tier ?? '_')}
      <section class="group" aria-labelledby={g.tier ? `tier-${g.tier}` : undefined}>
        {#if g.tier && hasTiers}
          <h2 id={`tier-${g.tier}`} class="tier">
            {COPY.tierHeading[g.tier] ?? g.tier}
            {#if g.tier === 'free'}<span class="small muted"> · {COPY.tierFreeNote}</span>{/if}
          </h2>
        {/if}
        <ul class="rows">
          {#each g.items as i (i.id)}
            {@const sub = stickerFor === i.id ? COPY.bought : subline(i)}
            <li class="row-wrap">
              <button type="button" class="row" id={`row-${i.id}`} aria-haspopup="dialog" onclick={(e) => openSheet(i, e)}>
                <span class="text">
                  <span class="title">{i.title}</span>
                  {#if sub}<span class="sub">{sub}</span>{/if}
                </span>
                <span class="end">
                  <SealStamp stamped={boughtId === i.id} kind="bought" size={40} />
                  <CoinBadge amount={i.price} kind="price" size="sm" showDelta={false} muted={priceMuted(i)} />
                </span>
              </button>
              {#if stickerFor === i.id}
                <div class="sticker" aria-hidden="true">
                  <Sticker event="shop_buy" seed={i.id} size={44} />
                </div>
              {/if}
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  {/if}

  <details class="recent">
    <summary><h2>{COPY.recentPurchases}</h2></summary>
    {#if purchases.length === 0}
      <p class="small muted">{COPY.noPurchases}</p>
    {:else}
      <ul class="log">
        {#each purchases as p (p.id)}
          <li class:voided={p.voided_at !== null}>
            <span class="when small">{prettyDate(p.date)}</span>
            <span class="what">{p.title}</span>
            <CoinBadge amount={p.price} kind="price" size="sm" showDelta={false} muted={p.voided_at !== null} />
            {#if p.voided_at}
              <span class="small">{COPY.returned}</span>
            {:else if p.voidable}
              <button type="button" class="qj-btn qj-btn--quiet qj-btn--sm" onclick={() => undo(p)}>{COPY.undo}</button>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </details>
{/if}

{#if sheet}
  {@const item = sheet}
  {@const after = balanceAfterText(balance, item.price)}
  <div class="scrim-sheet" aria-hidden="true" onclick={closeSheet}></div>
  <div
    class="sheet"
    role="dialog"
    aria-modal="true"
    aria-labelledby="sheet-title"
    tabindex="-1"
    bind:this={sheetEl}
  >
    <h2 id="sheet-title" tabindex="-1">{item.title}</h2>
    <p class="price-line">
      <CoinBadge amount={item.price} kind="price" showDelta={false} muted={priceMuted(item)} />
      <!-- Only when the purchase can happen now: a cooldown/unaffordable sheet promises no balance (H1 fix NIT-1). -->
      {#if after && mode === 'buy'}<span class="small muted tabular">{after}</span>{/if}
    </p>
    <!-- Always mounted so a 409 reason is announced when it appears (LOW-1). -->
    <div class="note-slot" role="status">{#if sheetNote}<p class="note" id="sheet-note">{sheetNote}</p>{/if}</div>
    {#if mode === 'buy'}
      <!-- aria-disabled (not disabled) while buying, so focus never falls out of the dialog (LOW-1). -->
      <button
        type="button"
        class="qj-btn qj-btn--seal qj-btn--block"
        aria-disabled={buying}
        aria-describedby={sheetNote ? 'sheet-note' : undefined}
        bind:this={buyBtn}
        onclick={buy}
      >
        {buying ? COPY.buying : COPY.buyFor(item.price)}
      </button>
      <div class="sheet-actions">
        <button type="button" class="qj-btn qj-btn--quiet qj-btn--sm" aria-pressed={item.wished} disabled={wishing} onclick={() => toggleWish(item)}>
          {COPY.saveToward}
        </button>
        <button type="button" class="qj-btn qj-btn--quiet qj-btn--sm" disabled={buying} onclick={closeSheet}>{COPY.close}</button>
      </div>
    {:else}
      <!-- Not buyable right now (H1, backlog 225): no Buy seal that can only refuse. Saving toward it is the way forward. -->
      <button
        type="button"
        class="qj-btn qj-btn--primary qj-btn--block"
        aria-pressed={item.wished}
        aria-disabled={wishing}
        aria-describedby={sheetNote ? 'sheet-note' : undefined}
        onclick={() => !wishing && toggleWish(item)}
      >
        {item.wished ? COPY.savingToward : COPY.saveToward}
      </button>
      <div class="sheet-actions">
        <button type="button" class="qj-btn qj-btn--quiet qj-btn--sm" onclick={closeSheet}>{COPY.close}</button>
      </div>
    {/if}
  </div>
{/if}

<style>
  /* the drawer cabinet, pasted into the notebook like a print inside a double rule */
  .hero {
    position: relative;
    height: 132px;
    overflow: hidden;
    border: 2px solid var(--rule);
    outline: 1px solid var(--rule);
    outline-offset: -6px;
    border-radius: var(--r-xs);
    background: var(--surface-sunk);
  }
  .hero :global(img),
  .hero :global(.qj-photo) {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  .scrim {
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, rgb(0 0 0 / 0.15), rgb(0 0 0 / 0.55));
  }
  .hero-in {
    position: absolute;
    inset: auto var(--sp-4) var(--sp-3);
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--sp-2);
  }
  .hero h1 {
    margin: 0;
    color: #fff;
    text-shadow: 0 1px 3px rgb(0 0 0 / 0.7);
  }
  .group {
    display: grid;
    gap: var(--sp-2);
  }
  .tier {
    margin: var(--sp-2) 0 0;
    font-size: var(--fs-md);
  }
  .rows {
    display: grid;
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  /* The purchase sticker is a flex sibling of the row inside its own li, so it never covers another row's
     text or price chip (LOW-2, designer-AC14). */
  .row-wrap {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }
  .row-wrap > .row {
    flex: 1 1 auto;
    min-width: 0;
  }
  /* each reward is a drawer of the apothecary's cabinet (百子櫃): a paper label pasted on a wooden front */
  .row {
    display: flex;
    width: 100%;
    min-height: 48px;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-3);
    padding: var(--sp-3);
    border: 5px solid var(--wood);
    outline: 1px solid var(--wood-edge);
    border-radius: var(--r-sm);
    background: var(--surface);
    box-shadow: inset 0 0 0 1px var(--line), var(--shadow-1);
    color: var(--ink);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .row:hover {
    box-shadow: inset 0 0 0 1px var(--rule), var(--shadow-2);
  }
  .row.skeleton {
    display: grid;
    gap: var(--sp-2);
    cursor: default;
  }
  .bar {
    display: block;
    height: 12px;
    border-radius: var(--r-sm);
    background: var(--surface-sunk);
  }
  .bar.short {
    width: 50%;
  }
  .text {
    display: grid;
    gap: 2px;
  }
  .title {
    font-weight: var(--fw-medium);
  }
  .sub {
    color: var(--ink-muted);
    font-size: var(--fs-sm);
  }
  .end {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    flex: none;
  }
  .sticker {
    flex: none;
    pointer-events: none;
  }
  .wish-title {
    margin: 0;
    font-weight: var(--fw-medium);
  }
  .progress {
    height: 10px;
    border-radius: var(--r-pill);
    background: var(--surface-sunk);
    overflow: hidden;
  }
  .fill {
    display: block;
    height: 100%;
    background: linear-gradient(90deg, var(--jade), #c9a24a);
  }
  .recent summary {
    display: flex;
    align-items: center;
    min-height: 44px;
    cursor: pointer;
  }
  .recent summary h2 {
    display: inline;
    margin: 0;
    font-size: var(--fs-md);
  }
  .log {
    display: grid;
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .log li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
  }
  .log .what {
    flex: 1 1 10rem;
  }
  .log .when {
    color: var(--ink-muted);
  }
  .log li.voided {
    color: var(--ink-muted);
  }
  .scrim-sheet {
    position: fixed;
    inset: 0;
    z-index: var(--z-overlay);
    background: rgb(0 0 0 / 0.35);
  }
  .sheet {
    position: fixed;
    left: 0;
    right: 0;
    bottom: calc(var(--nav-height, 0px) + env(safe-area-inset-bottom, 0px));
    z-index: calc(var(--z-overlay) + 1);
    display: grid;
    gap: var(--sp-3);
    max-width: 36rem;
    margin: 0 auto;
    padding: var(--sp-5) var(--sp-4) var(--sp-4);
    border-radius: var(--r-lg);
    background: var(--surface);
    color: var(--ink);
    box-shadow: var(--shadow-3);
    animation: sheet-in var(--dur-2, 200ms) var(--ease-out) both;
  }
  .sheet h2 {
    margin: 0;
  }
  @keyframes sheet-in {
    from {
      transform: translateY(24px);
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .sheet {
      animation: none;
    }
  }
  :global(:root[data-motion='reduce']) .sheet {
    animation: none;
  }
  .price-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-3);
    margin: 0;
  }
  /* Empty live region stays mounted (and in the a11y tree) but takes no space: cancel the grid gap. */
  .note-slot:empty {
    margin-top: calc(-1 * var(--sp-3));
  }
  .sheet .qj-btn[aria-disabled='true'] {
    cursor: progress;
  }
  .note {
    margin: 0;
    padding: var(--sp-2) var(--sp-3);
    border-radius: var(--r-md);
    background: var(--surface-sunk);
    color: var(--ink);
  }
  .sheet-actions {
    display: flex;
    justify-content: space-between;
    gap: var(--sp-2);
  }
  .small {
    font-size: var(--fs-sm);
  }
  .muted {
    color: var(--ink-muted);
  }
</style>

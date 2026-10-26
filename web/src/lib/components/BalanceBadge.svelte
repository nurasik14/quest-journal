<!--
  The header balance (designer-AC1): one CoinBadge kind="balance" per tab screen, fed by the single ledger store.
  It mounts with the current value, so no delta floats on mount or on a route change (designer-AC3); it floats
  only when the number changes while this screen is open. Hidden until the first economy arrives.
-->
<script lang="ts">
  import { COPY } from '../copy';
  import { ledger } from '../economy.svelte';
  import { CoinBadge } from '../theme';

  interface Props {
    size?: 'sm' | 'md' | 'lg';
    /** null = silent (the screen announces the event itself); string = that sentence; omitted = default */
    announce?: string | null;
  }
  let { size = 'md', announce }: Props = $props();
  const balance = $derived(ledger.economy?.balance ?? null);
</script>

{#if balance !== null}
  {#if announce === undefined}
    <CoinBadge amount={balance} {size} kind="balance" label={COPY.balanceLabel} />
  {:else}
    <CoinBadge amount={balance} {size} kind="balance" label={COPY.balanceLabel} {announce} />
  {/if}
{/if}

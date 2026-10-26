<!-- Calm placeholder for screens that arrive in later milestones (copy table, psychologist R10). -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { ScrollCard, Sticker } from '../theme';
  import BalanceBadge from './BalanceBadge.svelte';

  interface Props {
    title: string;
    text: string;
    band?: string;
    children?: Snippet;
  }
  let { title, text, band, children }: Props = $props();
</script>

<ScrollCard unroll {band}>
  {#snippet heading()}
    <div class="head">
      <h1 tabindex="-1">{title}</h1>
      <BalanceBadge />
    </div>
  {/snippet}
  <div class="row">
    <p>{text}</p>
    <Sticker event="idle" seed={title} size={88} />
  </div>
  {@render children?.()}
</ScrollCard>

<style>
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-2) var(--sp-3);
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-4);
  }
</style>

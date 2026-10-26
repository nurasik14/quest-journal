<!--
  The one offline state (hardening H1, backlog #299, designer M6 review §3.1). When a route's first load can't
  reach the laptop (network failure or timeout), the route keeps its header and shows this single quiet card.
  The global banner in App.svelte stays the only top message. Info styling (jade rule), never `--danger`:
  being away from the laptop is a normal condition, not an error. No API data is cached (architect decision).
-->
<script lang="ts">
  import { COPY } from '../copy';
  import { ScrollCard } from '../theme';

  interface Props {
    onretry: () => void;
    busy?: boolean;
  }
  let { onretry, busy = false }: Props = $props();
</script>

<ScrollCard variant="quiet" rods={false}>
  <div class="qj-banner qj-banner--info offline-card">
    <p>{COPY.offlineCard}</p>
    <button type="button" class="qj-btn qj-btn--sm" aria-disabled={busy} onclick={() => !busy && onretry()}>{COPY.tryAgain}</button>
  </div>
</ScrollCard>

<style>
  .offline-card {
    display: grid;
    gap: var(--sp-2);
    justify-items: start;
    margin: 0;
  }
  .offline-card p {
    margin: 0;
  }
</style>

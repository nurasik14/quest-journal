<script lang="ts">
  import Placeholder from '../lib/components/Placeholder.svelte';
  import { COPY } from '../lib/copy';
</script>

<Placeholder title="Nothing here" text={COPY.notFoundPage}>
  <p><a href="/">{COPY.backToday}</a></p>
</Placeholder>

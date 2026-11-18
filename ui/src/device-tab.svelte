<script lang="ts">
  import { heldHost } from './host';

  interface Props {
    /** The device this tab is about. It is the only prop a tab receives. */
    deviceId: string;
  }

  let { deviceId }: Props = $props();

  const host = heldHost();
  const fleet = host.fleet;
  const t = host.t;

  const device = $derived(fleet.device(deviceId));
</script>

<div class="flex flex-col gap-4">
  {#if device === undefined}
    <p class="text-sm text-muted-foreground">
      {t('printer-keys.deviceTab.absent')}
    </p>
  {:else}
    <p class="text-sm text-muted-foreground">
      {t('printer-keys.deviceTab.body')}
    </p>
  {/if}
</div>

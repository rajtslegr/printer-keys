// The bundle's entry: the app calls the default export with the host.
import { defineModule } from '@prusa/connect-ui/slots';

import DeviceTab from './device-tab.svelte';
import { holdHost } from './host';
import './styles.css';

export default defineModule((host) => {
  holdHost(host);
  // Must match `contributes.device_tab` in module.yaml, or the app drops the bundle.
  host.register.deviceTab('printer-keys', DeviceTab);
});

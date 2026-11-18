// The host object the app hands this bundle, held for the components. The
// setup runs before any component mounts, so Svelte context is not available.
import type { ModuleHost } from '@prusa/connect-ui/slots';

let held: ModuleHost | undefined;

/** Holds the host until its signal fires, which is when the person signs out. */
export const holdHost = (host: ModuleHost): void => {
  if (host.signal.aborted) return;
  held = host;
  host.signal.addEventListener(
    'abort',
    () => {
      if (held === host) held = undefined;
    },
    { once: true },
  );
};

/** The held host. It throws rather than drawing an empty view. */
export const heldHost = (): ModuleHost => {
  if (!held) throw new Error('printer-keys drew before its setup ran');
  return held;
};

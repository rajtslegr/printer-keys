import { copyFileSync, cpSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { moduleBuild, moduleDev } from '@prusa/connect-ui/build';

// The release layout: module.yaml at the root of dist/, the bundle under
// dist/ui/, the catalogues beside it in dist/ui/locales/.
const BUNDLE_ROOT = fileURLToPath(new URL('./dist/', import.meta.url));
const MANIFEST = fileURLToPath(new URL('../module.yaml', import.meta.url));
const LOCALES = fileURLToPath(new URL('./src/locales/', import.meta.url));

// dist/ is emptied first: the install digests every file in it, so a leftover
// from an earlier build would ship too.
const releaseLayout = () => ({
  name: 'printer-keys:release-layout',
  buildStart: {
    order: 'pre' as const,
    handler: () => {
      rmSync(BUNDLE_ROOT, { recursive: true, force: true });
      mkdirSync(BUNDLE_ROOT, { recursive: true });
    },
  },
  closeBundle: {
    order: 'post' as const,
    handler: () => {
      copyFileSync(MANIFEST, `${BUNDLE_ROOT}module.yaml`);
      cpSync(LOCALES, `${BUNDLE_ROOT}ui/locales`, { recursive: true });
    },
  },
});

const bundle = moduleBuild({ entry: 'src/index.ts', outDir: 'dist/ui' });

// A plain function rather than defineConfig, so this project's own copy of
// vite never meets the library's in a type. `pnpm dev` serves the bundle in
// front of a running core (PCL_CORE_URL, default http://localhost:8080).
export default ({ command }: { command: 'build' | 'serve' }) =>
  command === 'serve'
    ? moduleDev()
    : { ...bundle, plugins: [...(bundle.plugins ?? []), releaseLayout()] };

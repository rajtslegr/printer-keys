# Printer Keys

A [Prusa Connect](https://github.com/prusa3d/prusa-connect) extension that
turns a printer's buzzer into an instrument. It adds a **Keys** tab to every
printer's page: two octaves of keys you play with the mouse, the computer
keyboard or a MIDI keyboard. Each key is one `M300` sent to that printer.

- **Only `M300`.** The tab sends nothing else. Pitch is held to 50–10000 Hz
  and length to 20–2000 ms.
- **Only while idle.** The keys lock while the printer is offline, printing,
  paused, busy or reporting an error, and notes waiting to play are dropped.
- **One note at a time.** The buzzer plays one tone at once, so notes go out
  in order. Past four waiting notes, new ones are dropped rather than played
  late.
- **Computer keys:** `A W S E D F T G Y H U J K` play an octave and a note,
  `Z` and `X` move the octave down and up.
- **MIDI** works where the browser offers Web MIDI, which is only on a page
  served over HTTPS or from `localhost`. Opened as `http://<address>` on your
  network, the tab offers the on-screen and computer keys alone and says so.

It is a browser bundle alone: no process runs on the server. It sends each
note as the person who opened the tab, so it can do only what that person may
already do from the printer's page.

## Install

In Prusa Connect, open **Settings → Extensions**, find **Printer Keys** and
install it. The extension id is `com.github.aux.rajtslegr.printer-keys`.

## Develop

Needs Node.js 22.12 or newer and pnpm (the version in `ui/package.json`
is picked up through Corepack).

```sh
cd ui
pnpm install
pnpm check   # lint, format, svelte-check, unit tests
pnpm build   # writes the release layout to ui/dist
```

`pnpm dev` serves the bundle from source in front of a running core, which
it finds at `PCL_CORE_URL` (default `http://localhost:8080`). A change to
`module.yaml` needs a new build and install, because the core reads the
manifest when the extension is installed.

To install a build into a core by hand:

```sh
prusa-connect module add github.com/rajtslegr/printer-keys@0.1.0 -from ui/dist -approve
```

`scripts/install-check.sh <core binary>` does the same into a throwaway
configuration, which is what CI runs.

| path | what it is |
| --- | --- |
| `module.yaml` | the manifest: version, licence, the core it needs and the tab it adds |
| `ui/src/index.ts` | the bundle's entry, which registers the tab |
| `ui/src/device-tab.svelte` | the Keys tab |
| `ui/src/keys.ts` | pitch, `M300`, key map, MIDI parsing, lock and note queue |
| `ui/src/locales/` | every text the tab shows, in English and Czech |

## Release

`.github/workflows/release.yml` publishes to the Prusa Plugin Marketplace
through the marketplace's builder, which builds the bundle from the tagged
commit, signs it and uploads it with its source for review.

Once, in the repository settings:

1. Register a signing key as an author in the marketplace's author console.
2. Create the environment `release`, give it required reviewers, and add the
   private key (PEM) as its secret `PRUSA_CONNECT_EXTENSION_SIGNING_KEY`.

For each release:

1. Raise `version` in `module.yaml` and `ui/package.json`, and add the
   heading to `CHANGELOG.md`.
2. Publish a GitHub release tagged `v<version>`. A pre-release goes to the
   beta channel, any other release to stable.

The **Release** workflow can also be started by hand with `dry_run`, which
builds, checks and signs but uploads nothing.

## License

[MIT](LICENSE)

# sg-onset

On-set VFX data capture for Flow Production Tracking: slates, takes, camera setups, lenses,
reference photos. A PWA that looks and feels like an iOS app, iPad first, also web. It works with
no network and syncs to the studio's Flow PT site when a connection returns. Built on
[sg-widgets](https://github.com/ksallee/sg-widgets).

## Status

Alpha. Live at [sg-onset.vercel.app](https://sg-onset.vercel.app). Before you connect a real site,
try it on a sandbox Flow PT site. On an iPad, open it in Safari and Add to Home Screen.

What it does today:

- Shoot: log a take in one press. Record and photo sit under the thumb, for the left or right hand.
- Slates by shoot day, live templates, bulk edit across takes.
- Gear: built-in cameras with their sensor modes and lenses, CSV import, camera setups. A prime
  gives each take its focal length.
- Photos and videos on a take, with drawings, notes and dimension lines. Audio notes. A setup
  diagram and a reference log per slate.
- Take types: clean plate, balls and chart, shadow plate, element.
- The DIT's ALE or CSV fills clip name, roll and timecode.
- Wrap: a day summary, the camera report (VES CSV), CSV, ALE, JSON, a printable day report, and a
  wrap package with one folder per slate.
- Backup to a zip, and automatic snapshots on the device.
- Flow PT: an admin sets up the fields. Slates sync as Set Shots, linked to the real Shots later.
  Each Shot gets a Note listing what was captured. Two iPads on one show share their lists. An
  Action Menu Item sends the set data to artists.

Everything works with no network. Sync waits for a connection and a session. Bugs and requests go
to [GitHub issues](https://github.com/ksallee/sg-onset/issues).

## Run it

    pnpm install
    pnpm dev

Open the URL Vite prints. The rest:

    pnpm check
    pnpm test
    pnpm build
    pnpm preview

The service worker caches nothing under `pnpm dev`. Try offline and Add to Home Screen on
`pnpm build && pnpm preview`.

`pnpm demo -- --out <folder>` records the feature video for posts. See
[`tools/demo/README.md`](tools/demo/README.md).

## Sign in

Settings, then Sign In. You type your Flow PT site and approve sg-onset on it. This app never sees your password.
Capture works signed in or not; only sync needs a session.

By default the app's server forwards the two sign-in calls to Autodesk-hosted sites only
(`*.shotgrid.autodesk.com`, `*.shotgunstudio.com`). A deploy of your own can allow its own site
only with `FPT_HOSTS`, or add sites with `FPT_EXTRA_HOSTS`. See `.env.example`. To run the app and
its sign-in proxy on your own host, see [`docs/sign-in-proxy.md`](docs/sign-in-proxy.md).

## License

MIT. See `LICENSE`.

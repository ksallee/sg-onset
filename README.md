# sg-onset

On-set VFX data capture for Flow Production Tracking: slates, takes, camera setups, lenses,
reference photos. A PWA that looks and feels like an iOS app, iPad first, also web. It works with
no network and syncs to the studio's Flow PT site when a connection returns. Built on
[sg-widgets](https://github.com/ksallee/sg-widgets).

## Status

Scaffold. One placeholder screen, the iOS kit and the installable shell. No data layer, no Flow PT
yet.

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

## Sign in

`/sign-in`. You type your Flow PT site and approve sg-onset on it. This app never sees your password.
Capture works signed in or not; only sync needs a session.

The app's server forwards the two sign-in calls to Autodesk-hosted sites only
(`*.shotgrid.autodesk.com`, `*.shotgunstudio.com`). A self-hosted deploy allows its own site with
`FPT_EXTRA_HOSTS`. See `.env.example`.

## License

MIT. See `LICENSE`.

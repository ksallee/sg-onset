# `$lib/pwa`: the app on the home screen

Platform glue for the home-screen app, from holosession (#57 there). Pure modules are unit
tested; the rest are thin wrappers over browser APIs, safe to import on the server (they check for
`window` / `navigator`).

## Pure

- `platform.ts`
  - `isStandalone({ displayMode, navigatorStandalone? }): boolean`
  - `installHint(ua, standalone, touchPoints = 0): 'none' | 'ios-share' | 'ios-open-in-safari' | 'browser'`:
    what an install banner says. iOS has no install prompt: `ios-share` means "Share, then Add to
    Home Screen"; `ios-open-in-safari` is an in-app browser (Instagram…) that cannot install.
  - Readers: `readStandalone()`, `readInstallHint()` (call in the browser, e.g. in `onMount`).
- `share.ts`: `shareMode({ share, canShareFiles }): 'share' | 'download'`.
- `cache.ts`: the service worker's rules. `cacheRule(url, { origin, precached }, method)` →
  `precache | media | network | bypass`; `precacheable(path)`; `parseRange(header, size)`;
  `MEDIA_CACHE`, `appCacheName(version)`, `isAppCache(name)`.

## Wrappers

- `wakelock.svelte.ts`: `new WakeLock()`; `on` (wanted, `$state`), `held` (`$state`), `supported`,
  `toggle()`, `set(on)`, `destroy()`. Re-acquired on `visibilitychange` while `on`. Make one per
  screen and `destroy()` it on unmount:

  ```svelte
  <script lang="ts">
  	import { WakeLock } from '$lib/pwa/wakelock.svelte';
  	const keepOn = new WakeLock();
  	$effect(() => () => keepOn.destroy());
  </script>
  <Toggle checked={keepOn.on} onchange={() => keepOn.toggle()} disabled={!keepOn.supported} />
  ```

- `files.ts`: `shareOrDownload(blob, name): Promise<'shared' | 'downloaded' | 'cancelled'>`, the
  share sheet with the file when it takes files, else `<a download>` (`download(blob, name)`).
  Sharing needs a recent tap; after a long export it may fall back to a download: offer a
  "Share" button once the file is ready rather than sharing at the end of the export.
- `persist.ts`: `persistStorage(): Promise<boolean>`, asks to keep storage (call after a tap, e.g.
  on first save or first Run).

## Elsewhere

- `src/service-worker.ts`: precaches the build, small static files and the `/` shell
  (`app-<version>`, old ones deleted on activate); everything else of ours network first, the
  cached copy offline; `/api/**` never. Does nothing in `pnpm dev`. holosession's audio cache
  (`media` rule, range requests) is left out: `cache.ts` still names `/sounds/**` and `/music/**`,
  and the worker treats a `media` answer as network first.
- `static/manifest.webmanifest`, `static/icons/*`, the meta in
  `src/app.html`. `manifest.test.ts` checks them.

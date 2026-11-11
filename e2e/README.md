# e2e

Playwright against a production build served by `vite preview`. The service worker only caches
in a real build, so the suite never runs on `vite dev`.

## Run

    pnpm e2e:install                    # once: WebKit and Chromium for Playwright
    pnpm qa                             # build, serve, run everything, write .qa/report.md
    pnpm qa -- e2e/take.spec.ts         # one spec, still on a fresh build
    pnpm e2e e2e/take.spec.ts           # one spec on the build already there (pnpm build first)

`pnpm qa` exits 1 on a failure. It writes to `.qa/`, gitignored: `report.md`, `shots/<target>/`
(one per page), `results/` (per test: a screenshot, a trace on failure), `html/`. No secrets, no
network beyond localhost: every test fails if a request leaves 127.0.0.1.

## Targets

`targets.mjs`, shared with `tools/shots.mjs`. All have touch.

| project | engine | viewport |
|---|---|---|
| `ipad-landscape` | WebKit | 1180×820, the primary target |
| `ipad-portrait` | WebKit | 820×1180 |
| `phone` | Chromium | 390×844 |

## Writing tests

- Import `test`, `expect` and `open` from `./fixtures`, not from `@playwright/test`. A test then
  fails on a console error, an uncaught exception, or a request off localhost.
  `test.use({ allowConsoleErrors: true })` or `{ ignoreConsole: [/.../] }` opts out.
- A page in the shell needs a project: `openApp(page, path)` loads the sample project first.
  `open(page, path)` is for pages that stand alone (`/welcome`, `/proto/take`).
- Find things by role and accessible name, never by class: the markup moves.
- `auditLayout(page, testInfo)` (`audit.ts`) on any page: fails on sideways overflow and elements
  wider than the viewport; reports buttons and links with no name or under 44×44 px.
- To take the network away, `startPreview()` (`server.ts`) and stop it: `context.setOffline`
  breaks service-worker pages in WebKit.
- A test that finds an app bug: `test.fixme` with the reason above it. The report lists it.

## Screenshots

    pnpm shots -- --out /tmp/shots
    pnpm shots -- --routes /proto/take --viewports ipad-landscape,phone --themes day,night --hands right,left --out /tmp/shots

Routes × viewports × themes × hands, one PNG each, named `<route>_<viewport>_<theme>_<hand>.png`;
prints the paths. Starts `vite dev` on a free port, so it shows the code as it is now. `--url`
uses a server already running, `--preview` builds and uses the real build, `--full` takes the
full page. Viewports: the targets above or `WIDTHxHEIGHT`. Themes: `day`, `dark`, `night`. Hands:
`right`, `left`.

## What WebKit on macOS does not tell us

It is the Safari engine, not iPadOS. Not covered: the home-screen app (standalone mode, safe
areas, the status bar), the on-screen keyboard and how it moves the viewport, the real camera
behind the Photo input, iPadOS's storage eviction and service worker lifetime, Stage Manager and
Split View widths, Pencil and real multi-touch, and performance on the device. Those need an iPad.

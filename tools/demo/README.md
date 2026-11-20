# Demo video

`pnpm demo` makes the feature video for posts: square 1080, dark, about 49 s. The app runs on the
sample project at the iPad landscape size, each part with a caption above it, between a title card
and an end card with the URL.

    pnpm demo -- --out ~/Desktop/clips
    pnpm demo -- --out /tmp/demo --photo set.jpg
    pnpm demo -- --out /tmp/demo --url http://127.0.0.1:4791

It builds, serves the build on a free port, records, and writes `sg-onset-demo.mp4` into `--out`,
with `frames/` and `art/` beside it. `--url` skips the build and uses a production build already
served. `--photo` gives the markup part a real reference photo; without it the app gets a drawn one,
a road with a grey ball and a chrome ball, and the ring is drawn around the grey ball.

Needs ffmpeg on the path, and Playwright's Chromium (`pnpm e2e:install`).

## Parts

`record.mjs` holds the script, one block per part, each starting with its caption:

1. Log a take in one press: Start, End, Circled, a focus distance on the keypad.
2. Draw, write and measure on photos.
3. Bulk edit many takes at once.
4. Live templates. A value typed by hand stays.
5. Built-in cameras and lenses.
6. Wrap the day: reports and a package for VFX.

Before the screencast starts, off camera, it loads the sample project and makes a "Rain plate"
template with three slates, one changed by hand, so the live template part has something to show.

To change a part, find the elements by role and name as in `e2e/`. Waits are the pacing: about
half a second between taps reads as a person.

## Files

| file | what |
|---|---|
| `demo.mjs` | the command: build, serve, record, compose |
| `record.mjs` | Chromium at the iPad size, dark. A CDP screencast at 2x, sharper than Playwright's video. Chromium because Playwright's WebKit session stores no photos. |
| `compose.mjs` | the cards, captions, background and frame mask drawn by the browser, then ffmpeg |
| `plan.mjs` | pure: frame timing, caption spans, the ffmpeg filter graph, the layout. Tested in `plan.test.ts`. |

The layout is in `plan.mjs`: a square, because the app's 1.44:1 shape fills a square better than
16:9 in the LinkedIn feed. The caption sits in the band above the app, never over the app's own
notices.

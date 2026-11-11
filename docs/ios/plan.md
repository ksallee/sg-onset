> From holosession (`~/dev/holosession/docs/ios/plan.md`), copied as is: the spec the iOS kit in
> `src/lib/components/ios/`, `src/lib/ios/` and `src/lib/pwa/` was built to. Its screens, routes
> and work packages are holosession's, not sg-onset's.

# #57: the phone app as an iOS app

The working spec Jeremy redesigns and later ports to iOS. Every screen and behaviour present;
what #49–#52 will need is mocked (`src/lib/mock/`). Decisions in §4 are taken with the
recommendation for now; Kevin or Jeremy may change them.

Konsta UI v5.5 (MIT, Svelte 5 runes, iOS 26 theme) is the reference for class values: read
`src/shared/classes/*Classes.js` and `src/shared/colors/` at github.com/konstaui/konsta. Not a
dependency. Its Sheet has no detents or drag: ours does.

## 1. Off from iOS today

- `app.html` lacks `viewport-fit=cover`, so safe areas are 0; paddings are guesses.
- No manifest, icons, theme-color, Apple meta, service worker.
- IBM Plex + Geist Mono at ad-hoc sizes; tokens from the Console scoped in `Phone.svelte`;
  always dark.
- shadcn Buttons, ToggleGroup chips, Switch, Slider: web controls. No materials, no press states,
  no push/pop motion. `confirm()` for destructive actions. Inputs under 16 px (iOS zooms).
- Home: bordered cards, tap saves a copy at once, trash + confirm, small Import link.
- Builder: dim 14 px back link, obscure −/+ on the last stretch, Run is a plain push.
- Sheets: one long panel, decorative grip, Done at the foot, chips, number inputs, sheets stacked
  on sheets (`position:fixed` hack) for pickers.
- Music picker: no iOS search field, disclosure plus chips.
- Run: pushed, inline export and credits, no completion, no keep-awake, no artwork, no
  `audioSession` (the silent switch can mute Web Audio).

## 2. Target

### Navigation

- Tab bar, three tabs: Explore (`/`), My Sessions (`/sessions`), Settings (`/settings`); a
  standard full-width bottom bar (classic iOS 17, no Liquid Glass). Pushed details keep it: template `/t/[key]`, course `/course/[id]`.
- Builder `/s/[id]`: push, tab bar hidden; nav bar (back, inline title, "…" menu), bottom toolbar.
- Run `/s/[id]/run`: full-screen cover, slides up, chevron-down closes, always dark.
- Editing in sheets with detents (medium, large; drag between, drag down to dismiss). Lists in a
  sheet drill in (push within the sheet). Music picker: its own large sheet.
- Push/pop via View Transitions (`onNavigate` + `document.startViewTransition`); direction from
  route depth.
- Routes: `src/routes/(tabs)/+layout.svelte` holds the tab bar; `(tabs)/+page.svelte` Explore,
  `(tabs)/sessions/`, `(tabs)/settings/`, `(tabs)/t/[key]/`, `(tabs)/course/[id]/`. `s/[id]` and
  `s/[id]/run` outside the group. All pages `ssr = false`.

### Screens (★ new, M mocked for #49–#52)

1. ★ First-run safety sheet: the health warning, "I understand". `holosession.ack`.
2. Explore: large title; ★M Beginner Path hero card with a progress ring; template sections by
   group as inset rows (name, line, Arc, length, ★M difficulty badge); "Blank session" row; ★
   install banner when not standalone on iOS; one-line health warning footer.
3. ★ Template detail `/t/[key]`: Arc and facts header (length, difficulty, music); M length
   segmented 10/15/25/45; stretches as a read-only list; "Start" (copy, open Run), "Customize"
   (copy, open builder).
4. ★M Course `/course/[id]`: large title "Beginner Path", ring "3 of 6", day rows (done / next /
   locked), "Start Day 4".
5. My Sessions: large title; rows (name, length · stretches, Arc, relative date); swipe to delete
   with an action sheet, Edit mode; "+" menu: Blank session, Import file; empty state.
6. Builder: nav bar (back, name opens the session sheet, "…" menu: Session Sounds, ★M
   Variations…, Share File, Duplicate, Delete); Ribbon restyled; bottom toolbar: Listen, + Add
   Stretch, Start (filled); mini player above the toolbar.
7. Stretch sheet (medium → large): header ▶ Hear, "Build · 2 of 5", Done. Inset sections:
   Purpose (segmented, 5); Length (stepper row, ±1, long press ±5); Music (track row › picker,
   "On the beat" toggle, volume); Breath (toggle, big rhythm + glyph, Rhythm ›, Steps ›, Inhale
   › / Exhale ›, Breaths heard segmented + stepper rows); Nature (loop rows, toggle + volume, Find
   More ›); Cues (rows, swipe to delete, Add Sound ›). Footer rows: Move Up, Move Down, red Delete
   Stretch. Inherited values: secondary detail + "Session" caption; "Use Session's" row at the
   end of a section.
8. Session sheet (large): Name field row, Breath sounds, Cues (every stretch / whole session),
   Nature, Music (volume, synth bed checkmark list).
9. Drill-ins in sheets: Rhythm (checkmarks, your rhythms swipe to delete, fit icons), Sound
   (families, expand to takes with ▶ and ✓), Cue library, Steps editor, Find More (FreeSearch
   kind=sound).
10. Music picker (large sheet): search field with Cancel; sections Quick (No Music, Continue
    Previous), Your Tracks (+ Upload row), Drums › (drill-in: style, BPM stepper, intensity,
    Drone toggle, Hear, "Use These Drums"), Synth Beds; results replace sections while searching.
11. ★M Variations sheet (medium): Length segmented 10/15/25/45 or custom stepper; Intensity
    Gentler / As Is / Stronger; Swap Music › (three close-BPM candidates); Arc before and after;
    "Save as New Session", "Apply".
12. Run (cover, dark): top chevron-down, name small, "…" menu (Export WAV, Credits, Keep Screen
    On). Centre: clock (rounded, tabular), purpose · name, rhythm, glyph, what's next; slow
    purpose-tinted gradient. Bottom: Arc progress with times; Dim / Play-Pause (72 px circle) /
    Skip; one status line. Export: sheet with progress and Cancel. Credits: medium sheet with
    Copy. Dim: overlay, "tap to wake".
13. ★M Session complete: Apple Fitness-style summary (time, stretches), "Mark Day 4 Done" when
    in the course, Done.
14. ★ Settings: Safety (full warning), Install the App (steps, standalone status), Storage
    (home-screen storage is separate from Safari's; export/import), Credits & Licences, About,
    Prototypes (dev only).

### Tokens (`src/app.css`, CSS variables, `@theme inline`)

Dark default, designed first; light via `prefers-color-scheme`; Run forces dark.

Colours, dark / light:
- `--bg` #000 / #F2F2F7; `--bg-elevated` #1C1C1E / #F2F2F7; `--cell` #1C1C1E / #FFF;
  `--cell-elevated` #2C2C2E / #FFF.
- `--label` #FFF / #000; `--label-2` rgba(235,235,245,.6) / rgba(60,60,67,.6); `--label-3`
  rgba(235,235,245,.3) / rgba(60,60,67,.3).
- `--separator` rgba(84,84,88,.65) / rgba(60,60,67,.29), 0.5 px hairlines. `--fill`
  rgba(120,120,128,.36) / .2; `--fill-2` .32 / .16; `--fill-3` .24 / .12.
- `--tint` #63C7B5 / #2E8C7E; `--destructive` #FF453A / #FF3B30.
- Purposes: settle #8F7EE0 / #6E5BD0, build #E06C75 / #C94A55, peak #F0B35E / #C98419, heart
  #E39AB3 / #C26A8A, rest #6F66A8 / #554C94.
- Difficulty 1–4: #30D158, #FFD60A, #FF9F0A, #FF453A.

Aliases: WP1 keeps the old names (`--lit`, `--text`, `--dim`, `--panel`, `--panel2`, `--line`,
`--bg`, `--breath`, purpose vars) mapped onto the new tokens, globally, so unmigrated components
work and packages run in parallel. WP7 removes them.

Type: `-apple-system, "SF Pro Text", system-ui, "Geist Variable", sans-serif`; clock
`ui-rounded, "SF Pro Rounded"`; `.num { font-variant-numeric: tabular-nums }`; Geist Mono leaves
the phone app. Utilities `text-large-title` … `text-caption-2` (size/leading, tracking):
large-title 34/41 bold +0.37; title-1 28/34 +0.36; title-2 22/28 −0.26; title-3 20/25 −0.45;
headline 17/22 semibold −0.43; body 17/22 −0.43; callout 16/21 −0.31; subhead 15/20 −0.23;
footnote 13/18 −0.08; caption-1 12/16 0; caption-2 11/13 +0.06. Section headers: footnote,
uppercase, `--label-2`. Inputs 17 px.

Spacing: 4 pt grid; screen margin 16; row padding 16 × 11; rows ≥ 44 (58 with subtitle);
sections 32 apart; separators inset 16 (60 after a leading icon); icon tiles 29×29 r7; hit areas
≥ 44.

Radii: grouped list 24; sheet top 32; cards 20; buttons capsule (filled large 50 tall);
segmented rounded rect r9 on `--fill-3` with a raised thumb, 32 tall (iOS 17).

Materials: `--mat-bar` (nav bar, toolbar, mini player) rgba(28,28,30,.72) / rgba(249,249,249,.78)
with `backdrop-filter: blur(20px) saturate(180%)`; nav bar transparent until content scrolls
under. No Liquid Glass anywhere (Kevin, 2026-10-29): bars use `--mat-bar` with a hairline;
toolbar buttons are plain tinted text or icons. Scrim rgba(0,0,0,.4); a sheet under a stacked
sheet scales to .94 and dims.

### Primitives (`src/lib/components/ios/`)

- `Screen {children, accessory?, class?}`: 430 px column, safe areas, scroll container, mini
  player slot. Replaces `Phone.svelte`.
- `NavBar {title, large?, back?: {href, label}, leading?, trailing?}`: large title collapses on
  scroll; material once scrolled.
- `TabBar {items: {href, label, icon}[], active}`: full-width bar, `--mat-bar`, top hairline,
  safe-area padding.
- `Section {header?, footer?, inset = true, children}`.
- `Row {title, subtitle?, detail?, href?, onclick?, chevron?, checked?, destructive?, leading?,
  trailing?, swipe?: {label, destructive?, run}[]}`: press highlight, swipe actions.
- `Sheet {open (bindable), detents = ['large'], detent (bindable), title?, leading?, trailing?,
  done?, children}`: drag to snap or dismiss, focus trap (`builder/keys.ts` `trapStep`), Escape,
  stacking with scale-back.
- `SheetPage {open (bindable), title, trailing?, children}`: drill-in inside the nearest Sheet.
- `ActionSheet {open, title?, message?, actions: {label, role?, run}[]}`: replaces `confirm()`.
- `Menu {items: {label, icon?, destructive?, run}[], trigger}`: bits-ui dropdown, restyled.
- `Button {variant: filled|tinted|gray|plain, size: small|medium|large, destructive?, href?}`.
- `Segmented {options, value, onchange, ghost?, label}`: iOS 17 segmented, sliding thumb; moved from
  `builder/Segmented.svelte`, keeps `radioStep` keys.
- `Stepper {value, min, max, step, onchange, format?, label}`: − | + pill, long press repeats.
- `Toggle {checked, onchange, disabled?, label}`: `<input type=checkbox switch>` with fallback.
- `Slider {value, min, max, step, onchange, leading?, trailing?, label}`: 28 px thumb, 44 px target.
- `SearchField {value (bindable), placeholder, oncancel?}`.
- `Toolbar {children}`, `EmptyState {icon, title, message?, action?}`,
  `ProgressRing {value, size, color?}`.
- Domain, `components/builder/`: `DifficultyBadge {level}` (dot + word + 1–4 bars, never colour
  alone). `Arc` and `Glyph` stay.

### Motion

- Easing `--ease-ios: cubic-bezier(.32,.72,0,1)`. Press: in at once, out 200 ms. Push/pop
  400 ms (in from 100 %, out to −30 % and dimmed). Sheet present 450, dismiss 300, snap 350.
  Segmented thumb, toggle 250. Inline reveals 200.
- Drag release follows velocity: dismiss past 1/3 of the height or on a fast flick.
- No bounce on content. Only ambient motion: Run's gradient, ≤ 4 % scale, slower than the
  breath (decoration, not a guide: sessions are eyes closed).
- `prefers-reduced-motion`: every move becomes a 150 ms fade. Large title follows scroll.

### PWA and iOS standalone

- `app.html`: `viewport-fit=cover`; `theme-color` dark #000 and light #F2F2F7 media variants;
  `apple-mobile-web-app-status-bar-style=black-translucent`; `mobile-web-app-capable`,
  `apple-mobile-web-app-capable`; `apple-mobile-web-app-title=holosession`; `apple-touch-icon`
  180; manifest link.
- `static/manifest.webmanifest`: name, short_name, `display: standalone`, `start_url /`,
  `scope /`, background and theme #000, portrait, icons 192/512 + maskable 512.
- Icons: placeholders from `src/lib/assets/favicon.svg`, committed PNG. Real icon: Jeremy's.
- `src/service-worker.ts`: precache build and small files; cache-first runtime for `/sounds/**`
  and `/music/**`; never `/api/**`; versioned by `$service-worker` `version`.
- Audio: `navigator.audioSession.type = 'playback'` in `unlockAudio`
  (`src/lib/audio/context.ts`); keep the silent `<audio>` keepalive; show paused on `interrupted`.
- Media Session: artwork from the 512 icon, title = session, album = stretch now, nexttrack =
  skip, update on stretch change.
- Wake lock: "Keep Screen On" on Run, re-acquired on `visibilitychange`.
- Every pushed screen has a back button. Files: `navigator.share({files})` when `canShare`, else
  `<a download>`. Home-screen localStorage is separate from Safari's: Settings says so.
  `navigator.storage.persist()`. `overscroll-behavior: none`, `touch-action: manipulation`,
  `-webkit-touch-callout: none` and `user-select: none` on controls. No `beforeinstallprompt` on
  iOS: an instruction banner.

## 3. Work packages

Wave 1: WP1 and WP2 in parallel. Wave 2: WP3–WP6 in parallel from `dev` after WP1 merges.
Wave 3: WP7.

Every package: branch `feat/57-<slug>` from `dev`, PR onto `dev` (the lead merges). TDD for pure
modules, tests in the same commit. `pnpm check && pnpm test && pnpm build` once at the end.
Screenshots at 390×844 (playwright-cli skill), dark, light where noted, attached to the PR or
listed. Touch only the package's files; "props API unchanged" means so.

### WP1 Foundation (`feat/57-ios-foundation`)

- Owns: `src/app.css`; `src/routes/+layout.svelte` (View Transition `onNavigate`, first-run ack
  hook); `src/lib/components/ios/*`; `src/lib/ios/*.ts`; `src/lib/mock/*`;
  `components/builder/DifficultyBadge.svelte`; `src/routes/proto/ios/+page.svelte` (kitchen
  sink). In `src/app.html` only the `viewport-fit=cover` line.
- Pure, tested: `ios/detent.ts` `snapDetent(offsetPx, velocity, detents, sheetH)`;
  `ios/swipe.ts` `swipeState(dx, rowW, actions)`; `ios/largeTitle.ts` `titleProgress(scrollY)`;
  `ios/direction.ts` `navDirection(from, to) → push|pop|cover|none`; `mock/course.ts` (`Course`,
  `BEGINNER`: 6 days, 10, 10, 15, 15, 25, 45 min over 14 days; `courseState(course, done)`);
  `mock/difficulty.ts` (`Level`, `LEVELS`, `mockDifficulty(templateKey)`); `mock/variants.ts`
  (`VariantRequest`, `mockVariant(plan, req)` scaling in proportion, `mockSwapCandidates`). Each
  mock file starts with a comment naming the issue that replaces it.
- Keeps old token names as aliases. `Phone.svelte` stays, wrapping `Screen` with `TransportBar`
  in the accessory slot.
- Accept: `/proto/ios` at 390 px, dark and light, shows every primitive and its states; `/`,
  `/s/[id]`, `/s/[id]/run` still render through the aliases; tests for the 7 pure modules.

### WP2 PWA and platform (`feat/57-pwa`)

- Owns: `src/app.html` (all but the viewport line), `static/manifest.webmanifest`,
  `static/icons/*`, the icon script, `src/service-worker.ts`, `src/lib/pwa/*`,
  `src/lib/audio/context.ts`.
- Pure, tested: `pwa/platform.ts` `isStandalone(...)`, `installHint(ua, standalone)`;
  `pwa/share.ts` `shareMode(caps)`; `pwa/cache.ts` `cacheRule(url)`; a manifest test (fields,
  icon files exist).
- Thin: `pwa/wakelock.svelte.ts` (`WakeLock`: `on`, `toggle()`, re-acquire), `pwa/files.ts`
  `shareOrDownload(blob, name)`, `pwa/persist.ts`; `audioSession` in `unlockAudio`.
- Accept: `pnpm build && pnpm preview`, manifest installable and SW active in Chrome devtools.

### WP3 Tabs, Explore, My Sessions, Settings, Template detail, Course (`feat/57-home`)

- Owns: `src/routes/+page.svelte` and `+page.ts` (moved), `src/routes/(tabs)/**`,
  `src/lib/home/*`, `src/lib/components/home/*` (`TemplateRow`, `SessionRow`, `CourseCard`,
  `InstallBanner`, `SafetySheet`), `src/lib/components/Warning.svelte` (restyle).
- Pure, tested: `home/tabs.ts` `activeTab(pathname)`; `home/explore.ts` `exploreSections(...)`;
  `home/when.ts` `relativeDay(ms, now)`; `home/ack.ts` `needsAck(stored)`.
- Behaviour: Start saves a copy and opens Run; Customize opens the builder; swipe + ActionSheet
  delete; Import in "+"; install banner from `pwa/platform` (local stub with the same signature
  if WP2 is not in); first-run sheet; Settings sections.
- Accept: 390 px dark and light screenshots of each screen and state listed in §2 items 1–5, 14.

### WP4 Builder, ribbon, mini player, Variations (`feat/57-builder`)

- Owns: `src/routes/s/[id]/+page.svelte`, `builder/Ribbon.svelte` (restyle; gestures and
  `builder/reorder*` untouched), `builder/TransportBar.svelte`, `builder/VariantSheet.svelte`,
  `builder/BuilderMenu.svelte`, `duplicateSession` in `src/lib/editor/library.ts` (+ test),
  `builder/Phone.svelte`.
- Behaviour: §2 item 6; drop the −/+ on the last stretch; VariantSheet on `mock/variants` with a
  "Preview" caption; no-plan state as EmptyState; `StretchSheet` and `SessionSheet` mounted with
  props unchanged.
- Accept: 390 px dark: five stretches, preview playing with the mini player, menu open,
  Variations at medium, delete action sheet; seam drag and reorder work; builder tests green.

### WP5a Stretch and session sheets, breath pickers (`feat/57-sheets`)

- Owns: `builder/StretchSheet.svelte`, `SessionSheet.svelte`, `Setting.svelte`, `RhythmPicker`,
  `SoundPicker`, `CueList`, `CueLibrary`, `AmbienceField`, `Steps`, `VolumeSlider`, `FitIcon`;
  deletes `builder/Segmented.svelte` once unused.
- Behaviour: §2 items 7–9. Pickers become `SheetPage` drill-ins, props unchanged. Steppers,
  segmented, checkmark lists past five options. SessionSheet drops Download (WP4's menu has
  Share File). `MusicCard`, `MusicPicker` used with props unchanged. Pure wording in
  `src/lib/builder/sheet.ts` with tests if any.
- Accept: 390 px dark screenshots of the states in §2 items 7–9; drag down dismisses; Escape and
  focus trap work.

### WP5b Music picker (`feat/57-music`)

- Owns: `src/lib/components/music/*` (logic in `search.svelte.ts`, `shelf.svelte.ts` kept).
- Behaviour: §2 item 10. `FreeSearch` must also render inside a `SheetPage` for WP5a.
  `MusicCard` becomes an inset row card with a play button. Props unchanged.
- Accept: 390 px dark: at rest, searching with results, drums drill-in, upload row;
  `/proto/music` works; music tests green.

### WP6 Run and completion (`feat/57-run`)

- Owns: `src/routes/s/[id]/run/+page.svelte`, `src/lib/builder/runner.svelte.ts`,
  `src/lib/builder/run.ts` (+ tests), `src/lib/components/run/*` (`ExportSheet`, `CreditsSheet`,
  `Complete`).
- Pure, tested: `completion(plan, position, duration)`, `mediaMeta(session, state)`.
- Behaviour: §2 items 12–13; cover transition; Keep Screen On via `pwa/wakelock` (stub if WP2 is
  not in); reduced motion makes the gradient static; keep Space and the dim overlay.
- Accept: 390 px dark: ready, playing in Peak, closing, export at 40 %, credits, dim, Complete;
  tests for `run.ts`.

### WP7 Cleanup and QA (`feat/57-cleanup`)

- Delete `Phone.svelte`, the token aliases (or scope them to `/proto`), unused `components/ui/*`
  and fonts not used by `/proto`. Update `CLAUDE.md` and `PLAN.md`.
- Accept: one screenshot set of every screen at 390 px dark (light for tab screens); clean check,
  test, build.

## 4. Decisions, taken with the recommendation

1. Three tabs (Jeremy may change).
2. Classic iOS 17 materials, no Liquid Glass (Kevin's call); flat content.
3. Follow the system appearance, designed dark first, Run always dark (Jeremy).
4. Teal tint, purpose palette kept, SF system type, rounded clock; IBM Plex and Geist Mono go
   (Jeremy).
5. Safety: first-run acknowledgement, one-line footer on Explore, full text in Settings, a line
   on Run before the first play of a Strong or Intense session (Kevin).
6. A template opens a detail screen with Start and Customize (Kevin).
7. Difficulty: four levels, Gentle / Moderate / Strong / Intense, word + bars (Kevin, Jeremy;
   #52 sets it for real).
8. Drop −/+ on the last stretch; service worker caches sounds and music; pickers drill in inside
   the sheet, music picker its own sheet.

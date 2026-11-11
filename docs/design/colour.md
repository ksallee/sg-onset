# Colour and materials

sg-onset is used in three kinds of light: outdoors in the sun, on a dim stage, and on a night set
where any white light ruins the crew's dark adaptation. The colour system serves those three. This
page holds what we learned, what we decided, every token and how the app switches over.

The tokens live in `src/lib/theme/palette.ts`. That file is the one source: `tokens.css` is
generated from it (`node scripts/theme-tokens.mjs`), and `palette.test.ts` measures every
text-on-surface pairing in all six schemes. The specimen page is `/proto/themes`.

## What we learned

### Apple

- Dark mode has two background sets: base (dimmer, so the background recedes) and elevated
  (brighter, for sheets and popovers). Dark is designed, never an inversion.
  [HIG: Dark Mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode)
- Test colours in sunlight and in dim light: in bright light colours look darker and more muted.
  Every custom colour needs four values: light, dark, and an Increase Contrast version of each.
  Never let colour alone carry state. [HIG: Color](https://developer.apple.com/design/human-interface-guidelines/color)
- Contrast at least 4.5:1, and strive for 7:1 for small text. Text at 18 pt or bold may go to 3:1.
  [HIG: Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)
- Labels and fills are one hue at falling alpha (label 100 %, secondary 60 %, tertiary 30 %,
  quaternary 18 %; fills 36/32/24/18 % in dark). Separators come translucent and opaque. Increase
  Contrast lightens the dark backgrounds (#000 / #242426 / #363638) and raises label alpha.
  Values as UIKit ships them: [Flutter's CupertinoColors](https://raw.githubusercontent.com/flutter/flutter/master/packages/flutter/lib/src/cupertino/colors.dart).
- Materials: thicker is more opaque and keeps fine text legible; Reduce Transparency must make
  them solid. [HIG: Materials](https://developer.apple.com/design/human-interface-guidelines/materials)
- Taken: the base and elevated split, alpha labels and fills, the four-value rule, solid fallbacks
  for every material, state never by colour alone.

### Capture tools and the set

- Blackmagic Camera turns the record button and timecode red while recording
  ([Blackmagic](https://www.blackmagicdesign.com/products/blackmagiccamera)). Kino adds a red ring
  round the screen edge while recording ([Lux](https://lux.camera/introducing-kino-pro-video-camera)).
- Halide found colour alone failed for on and off, and changed the button's shape per mode
  ([Apple Developer](https://developer.apple.com/news/?id=x6bv1a36)).
- Broadcast tally: red is live, green is preview, yellow is recording off air
  ([Tally light](https://en.wikipedia.org/wiki/Tally_light)). Cockpit guidance keeps red and
  yellow for warnings only ([FAA](https://www.faa.gov/sites/faa.gov/files/aircraft/air_cert/design_approvals/rotorcraft/ROT_NVISLightingNightUnaidedEvaluation_r1.pdf)).
- Taken: red belongs to Record and nothing else; rolling shows as a red bar on the rail edge as
  well as a square in the button; every state also has a shape or a word.

### Red night modes

- Rods barely respond above about 620 nm, so red light leaves dark adaptation mostly intact
  ([Purkinje effect](https://en.wikipedia.org/wiki/Purkinje_effect)). MIL-STD-1472F asks for red
  above 625 nm at 0.07 to 3.5 cd/m²; off-the-shelf red lights were 10 to 20 times too bright, and
  under red light small print needs about three times the intensity
  ([Practical Sailor](https://www.practical-sailor.com/safety-seamanship/are-chart-lights-steering-us-wrong)).
- SkySafari's red on black is still too bright for many users, so it adds a dimmer
  ([SkySafari](https://userguide.skysafariastronomy.com/app-specific/night-vision-help)). iPadOS
  has Color Tint and Reduce White Point ([Apple](https://support.apple.com/111773)).
- Pure sRGB red is relative luminance 0.2126: at most 5.25:1 on black. There is little room for
  hierarchy.
- Taken: night uses only the red channel (green and blue are zero, checked by the test), on true
  black, with levels made from red luminance, weight and size. Night fills nothing brightly:
  filled controls become a dim red slab with bright red text and an outline.

### Palettes people choose

- Radix gives each of its 12 steps one job (backgrounds, component states, borders, solids, two
  text steps) and guarantees text steps at APCA Lc 60 and 90
  ([Radix](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale)).
  Geist does the same in 10 steps and prefers solid greys, alpha only where the surface must show
  through ([Geist](https://vercel.com/geist/colors)).
- Linear generates its themes in LCH from three inputs (base, accent, contrast) and keeps accent
  out of the neutrals ([Linear](https://linear.app/now/how-we-redesigned-the-linear-ui)).
  Tailwind v4 moved its palette to OKLCH ([Tailwind](https://tailwindcss.com/blog/tailwindcss-v4)).
- Primer ships high-contrast themes aiming at 7:1 and checks contrast in CI
  ([Primer](https://primer.style/foundations/color/overview)).
- OKLCH keeps hue steady while lightness moves; each hue has its own chroma ceiling, and browsers
  clip out-of-gamut colour crudely ([Evil Martians](https://evilmartians.com/chronicles/oklch-in-css-why-quit-rgb-hsl)).
- Colour-blind safety: red and green confuse for about 8 % of men; a blue partner for a signal red
  is the safe pair ([Okabe and Ito](https://jfly.uni-koeln.de/color/)).
- Taken: one source in OKLCH, steps named by job, neutrals barely tinted (chroma under 0.016),
  one accent, contrast measured in a test.

### Light, screens and contrast

- WCAG 2.2: 4.5:1 for text, 7:1 enhanced, 3:1 for shapes that carry meaning
  ([WCAG 2.2](https://www.w3.org/TR/WCAG22/)). APCA: Lc 90 preferred body text, 75 minimum, 60
  other text, 45 headlines, 30 the floor for any text, 15 for dividers
  ([APCA in a nutshell](https://git.apcacontrast.com/documentation/APCA_in_a_Nutshell)). WCAG 2
  overstates contrast for dark colours, so APCA judges the dark and night modes.
- In sunlight reflections add the same light to black and white, so effective contrast collapses;
  a light theme must maximise luminance contrast and avoid mid greys
  ([Riverdi](https://riverdi.com/blog/what-makes-a-monitor-sunlight-readable)). Dark text on light
  reads better in bright light ([Piepenbrock et al.](https://informahealthcare.com/doi/abs/10.1080/00140139.2014.948496)).
- iPad Pro is OLED (true black is off); iPad Air and the base iPad are LCD, where black glows with
  the backlight ([iPad Pro](https://www.apple.com/ipad-pro/specs/), [iPad Air](https://www.apple.com/ipad-air/specs/)).
  On OLED, moving content between pure black and dark grey smears; developers use near-black to
  avoid it ([report](https://medium.com/lookup-design/designing-a-dark-theme-for-oled-iphones-e13cdfea7ffe), unmeasured).
- White text on pure black blurs for people with astigmatism
  ([Level Access](https://www.levelaccess.com/blog/accessibility-for-people-with-astigmatism/)).
- Taken: light at 7:1 for primary and secondary text; dark off-white text on near-black content;
  APCA beside WCAG in every test.

## Decisions

- **Accent: one blue**, OKLCH hue 262 (light #1043a8, dark #8cb9fe, filled #3d70d1). Blue sits
  opposite Record red in hue and in lightness, stays apart from it for red-green colour blindness,
  and is the colour iPadOS users read as "tap here". It is deeper and a touch more violet than the
  system blue so it holds 7:1 in the sun. Green (circled, synced), amber (warning, unsynced,
  changed) and violet (conflict) are status colours, never decoration.
- **Red is Record's.** `--record` is the vivid disc and bar. Red text (`--rolling`,
  `--destructive`) is a darker red in light and a softer one in dark so it reads as text. No-good
  is grey and struck through, never red.
- **Dark, for a dim stage, per surface:**
  - `--rail`: true black. It is still, never scrolls, and holds Record: on OLED those pixels are off.
  - `--bg` (the canvas behind lists): near-black #0a0a0b. Content scrolls over it, so OLED never
    switches pixels fully off and on (no smear), and on LCD it looks the same as black.
  - `--sidebar` #111213, `--cell` #1a1b1c, `--bg-elevated` #19191b, `--cell-elevated` #27282a,
    `--key` #343538: even OKLCH steps of about 0.05 L, so depth reads without borders.
  - Labels are off-white (#eff0f2), not #fff: less halation, Lc 88 to 99 against the surfaces.
  - Large slabs that light up when pressed (keys, rail buttons) invert to a soft grey (#c9cacd),
    not white.
- **Light, for the sun:** primary text #0d0e12 at 15:1 or more; secondary text 7:1 on every
  surface (iOS uses about 3.5:1); white cells on a #ecedf2 canvas so groups separate without
  hairlines; tint 7:1; Record red at 4:1 or more against every surface.
- **Night:** true black base, surfaces in dim pure red (#020000 to #100000), labels at #f50000
  (4.5:1), secondary #cc0000 (3:1), tertiary #950000. Every status colour maps to one of those
  reds. State moves to shape: a 2 px ring on anything on or pressed (`--state-ring`), outlined
  status chips (`--status-ring`, no fills), the square in Record, words. Brightness is for the
  device: Reduce White Point and the brightness slider. An in-app dimmer is a later question.
- **Increased contrast** (`prefers-contrast: more`, or `data-contrast="more"`): black or white
  labels, stronger secondary text and separators, black dark canvas, outlined groups
  (`--cell-ring`), near-solid materials.
- **Materials:** classic bars, no Liquid Glass. `--mat-bar` 84 % and `--mat-sheet` 90 % over the
  existing blur; `-solid` twins replace them under `prefers-reduced-transparency`. Night bars are
  black.
- **Gamut:** every colour is inside sRGB. `ok()` cuts chroma to the gamut, so screenshots,
  exports and the iPad's P3 screen agree.

## Contrast targets

Each cell is WCAG 2 ratio, then APCA |Lc|. A pairing passes only if it meets both, on every
surface it sits on (`palette.ts` `PAIRINGS` lists the surfaces, translucent layers included:
`cell>selection` is selection over a cell).

| What | Light | Dark | Night | Light + | Dark + | Night + |
|---|---|---|---|---|---|---|
| Primary text, digits, icons | 7 / 90 | 7 / 75 | 4.5 / 33 | 12 / 84 | 7 / 85 | 4.5 / 35 |
| Secondary text | 7 / 75 | 4.5 / 55 | 3 / 22 | 9 / 80 | 7 / 65 | 4.5 / 33 |
| Tertiary text, placeholders | 3.5 / 45 | 3 / 30 | 2 / 12 | 4.5 / 55 | 4.5 / 40 | 3 / 20 |
| Tint as text | 7 / 75 | 7 / 55 | 4.5 / 33 | 8 / 78 | 7 / 60 | 5 / 35 |
| Status text (rolling, circled, NG, warning, sync, conflict, delete) | 4.5 / 60 | 4.5 / 50 | 3 / 22 | 6 / 70 | 6 / 55 | 4.5 / 33 |
| Text on a solid (filled button, slab) | 4.5 / 60 | 4.5 / 45 | 4.5 / 30 | 6 / 70 | 4.5 / 55 | 4.5 / 30 |
| Shapes: Record, its ring, focus ring | 3 / 30 | 3 / 30 | 3 / 20 | same | same | same |
| Hairlines | 1.25 / 0 | 1.25 / 0 | 1.2 / 0 | 2 / 15 | 2 / 15 | 1.5 / 0 |

"+" is increased contrast. Night's ceiling is 5.25:1 (pure red on black), so its targets sit
under it; APCA was not built for red-only, low-light viewing, and is reported for reference.

Results, worst case per role (the test measures 123 or 124 pairings per scheme, all six schemes pass):

| Scheme | Primary | Secondary | Tint |
|---|---|---|---|
| Light | 15.6:1, Lc 92 | 7.2:1, Lc 77 | 7.4:1, Lc 78 |
| Dark | 9.1:1, Lc 88 | 5.6:1, Lc 57 | 7.2:1, Lc 60 |
| Night | 4.5:1, Lc 34 | 3.3:1, Lc 24 | 4.5:1, Lc 34 |
| Light + | 15.0:1, Lc 84 | 10.7:1, Lc 82 | 8.7:1, Lc 79 |
| Dark + | 8.3:1, Lc 93 | 7.2:1, Lc 70 | 7.1:1, Lc 66 |
| Night + | 4.5:1, Lc 36 | 4.6:1, Lc 35 | 5.0:1, Lc 37 |

The worst cases are text on a selection or a fill; on plain cells the figures are higher. Two
pairings are let down on purpose: a switch that is on against its row in dark with increased
contrast (2.5:1; the knob's side carries it), and night's pressed key (3:1; the ring carries it).

## Tokens

Names the kit already reads are kept: `bg`, `bg-elevated`, `cell`, `cell-elevated`, `label`,
`label-2`, `label-3`, `separator`, `fill`, `fill-2`, `fill-3`, `press`, `tint`, `on-tint`,
`destructive`, `mat-bar`, `thumb`, `segment-thumb`, `scrim`, `record`, `on-record`, `changed`.
`app.css` also derives `mat-blur`, `hairline`, the durations and the shadcn names from them; those
stay in `app.css`. Everything else below is new. Values are sRGB hex of the OKLCH in
`palette.ts`; with alpha, the share follows. Increased contrast values are in `palette.ts`
(`more`). `--<status>-fill` (good, no-good, warning, unsynced, synced, conflict, rolling) is
derived: the status colour at `--status-fill`.

| Token | For | Light | Dark | Night |
|---|---|---|---|---|
| `--bg` | The canvas: behind grouped lists and columns | #ecedf2 | #0a0a0b | #000000 |
| `--bg-elevated` | A sheet, popover or panel above the canvas | #f5f6f8 | #19191b | #070000 |
| `--sidebar` | The list column and sidebars | #f1f2f6 | #111213 | #020000 |
| `--cell` | A row or card on the canvas | #ffffff | #1a1b1c | #0a0000 |
| `--cell-ring` | An outline round grouped cells: on with Increase Contrast only | 0px | 0px | 0px |
| `--cell-elevated` | A row or card on an elevated surface | #ffffff | #27282a | #100000 |
| `--label` | Primary text and icons | #0d0e12 | #eff0f2 | #f50000 |
| `--label-2` | Secondary text: details, captions | #1e212a 79% | #e5e8ed 75% | #cc0000 |
| `--label-3` | Tertiary text: placeholders, disabled | #1e212a 60% | #e5e8ed 53% | #950000 |
| `--label-4` | Quaternary: watermarks, never text to read | #1e212a 22% | #e5e8ed 18% | #5d0000 |
| `--separator` | Hairlines between rows, over any surface | #2a2e36 30% | #7d8086 36% | #bc0000 36% |
| `--separator-opaque` | A hairline where nothing may show through | #c9cace | #37383b | #500000 |
| `--fill` | Thin controls: slider track, switch off, capture face | #71747c 22% | #7d8088 38% | #bc0000 30% |
| `--fill-2` | Medium controls: gray buttons, rail buttons | #71747c 17% | #7d8088 31% | #bc0000 16% |
| `--fill-3` | Large shapes: search field, chips, keypad alt keys | #71747c 12% | #7d8088 24% | #bc0000 13% |
| `--fill-4` | Very large shapes: table stripes, wells | #71747c 7% | #7d8088 16% | #bc0000 12% |
| `--press` | The flash on a pressed row | #000000 7% | #ffffff 10% | #bc0000 22% |
| `--tint` | The accent: links, selection, controls that are on | #1043a8 | #8cb9fe | #f50000 |
| `--tint-pressed` | The accent under a finger | #03328f | #6c9fef | #eb0000 |
| `--tint-disabled` | The accent on a control that is off | #1043a8 36% | #8cb9fe 36% | #f50000 40% |
| `--tint-fill` | Tinted button and selected chip background | #1043a8 10% | #8cb9fe 10% | #bc0000 15% |
| `--on-tint` | Text on a solid tint | #ffffff | #09152c | #000000 |
| `--tint-solid` | Large tint fills: filled buttons, a switch that is on, badges | #1043a8 | #3d70d1 | #320000 |
| `--on-tint-solid` | Text and knobs on a solid tint | #ffffff | #ffffff | #fe0000 |
| `--state-ring` | An outline on a control that is on or pressed: night fills nothing brightly, so shape carries it | 0px | 0px | 2px |
| `--selection` | A selected row or text selection | #1043a8 11% | #8cb9fe 24% | #bc0000 15% |
| `--record` | The Record disc and the rolling bar: owns red | #e41a22 | #fb4241 | #fe0000 |
| `--on-record` | Text on the record red | #ffffff | #ffffff | #000000 |
| `--rolling` | Rolling, as text: the clock, the word | #c7181d | #ff8781 | #f50000 |
| `--destructive` | Delete and other undoable losses, as text | #c7181d | #ff8781 | #f50000 |
| `--destructive-solid` | A filled destructive button or swipe action | #c7181d | #c52c2a | #230000 |
| `--on-destructive` | Text on a filled destructive button | #ffffff | #ffffff | #fe0000 |
| `--good` | A circled (good) take | #137738 | #5cd07c | #f50000 |
| `--no-good` | A no-good take: grey and struck, never red | #616369 | #a8abb0 | #cc0000 |
| `--warning` | Needs attention: storage low, a check failed | #9c5906 | #fcb442 | #f50000 |
| `--changed` | A field that differs from the last take | #9c5906 | #fcb442 | #f50000 |
| `--unsynced` | Saved on this iPad, not yet in Flow PT | #9c5906 | #fcb442 | #cc0000 |
| `--synced` | In Flow PT | #137738 | #5cd07c | #cc0000 |
| `--conflict` | Changed here and in Flow PT: needs a choice | #9b259b | #e99be2 | #f50000 |
| `--status-fill` | Behind a status chip: the status colour at this share | 12% | 18% | 0% |
| `--status-ring` | An outline round a status chip, in its colour: night has no fills, so shape carries it | 0px | 0px | 1.5px |
| `--focus` | The keyboard focus ring | #1043a8 | #8cb9fe | #f50000 |
| `--mat-bar` | Nav bar, toolbar, tab bar: translucent | #f6f7f9 84% | #131415 84% | #000000 90% |
| `--mat-bar-solid` | The bar with Reduce Transparency | #f6f7f9 | #131415 | #000000 |
| `--mat-sheet` | A sheet or menu: translucent | #f5f6f8 90% | #19191b 90% | #0d0000 94% |
| `--mat-sheet-solid` | The sheet with Reduce Transparency | #f5f6f8 | #19191b | #0d0000 |
| `--thumb` | Switch and slider knobs | #ffffff | #ffffff | #bc0000 |
| `--segment-thumb` | The selected segment | #ffffff | #4c4d50 | #500000 |
| `--scrim` | Dims what is under a sheet | #090b0f 30% | #000000 50% | #000000 70% |
| `--shadow-1` | Raised a little: keys, knobs, the segment thumb | shadow | shadow | none |
| `--shadow-2` | Floating: menus, popovers, the undo notice | shadow | shadow | ring |
| `--shadow-3` | Over everything: sheets | shadow | shadow | ring |
| `--key` | A digit key | #ffffff | #343538 | #100000 |
| `--key-alt` | The point and delete keys | #dcdee3 | #212224 | #030000 |
| `--key-pressed` | A key under a finger: it inverts | #0d0e12 | #c9cacd | #470000 |
| `--key-label` | Digits on a key | #0d0e12 | #eff0f2 | #f50000 |
| `--key-pressed-label` | The digit on a pressed key | #ffffff | #000000 | #fe0000 |
| `--rail` | The action rail: the darkest, stillest strip | #ffffff | #000000 | #000000 |
| `--rail-button` | A rail button face | #71747c 14% | #7d8088 27% | #bc0000 16% |
| `--rail-pressed` | A rail button that is pressed or on | #0d0e12 | #c9cacd | #320000 |
| `--rail-pressed-label` | The icon on a pressed rail button | #ffffff | #000000 | #fe0000 |
| `--record-ring` | The ring round Record while idle | #0d0e12 | #eff0f2 | #cc0000 |

## How to switch the app over

Done in #30, except the take prototype's part below: until it lands, `lib/theme/compat.css`
(generated, `renderCompatCss`) gives the old `ios-light`, `ios-dark`, `ios-night` classes the
tokens, and app.css's `dark` variant and derived block still list them. Remove those with it.
`e2e/night.spec.ts` checks that no page sends out green, blue or white in red night mode.

### `src/app.css`

1. Under the three `@import` lines, add `@import './lib/theme/tokens.css';`.
2. Delete the colour blocks: `:root, .ios-dark { … }` (`--bg` to `--scrim`), the
   `@media all { :root[data-theme='light'] … }` light block, both "Capture colours" blocks,
   `.ios-day { … }` and `.ios-night { … }`.
3. The derived block (`--mat-blur`, `--hairline`, durations, shadcn names): change its selector
   from `:root, .ios-dark, .ios-light` to `:root, [data-theme], [data-night]`, and set
   `--ring: var(--focus)`. shadcn's own `--sidebar` now comes from the tokens; add
   `--sidebar-foreground: var(--label)`, `--sidebar-border: var(--separator)`,
   `--sidebar-accent: var(--fill-3)`, `--sidebar-ring: var(--focus)` if a shadcn Sidebar is used.
4. `@custom-variant dark`: match `[data-theme='dark']` and `[data-night='true']` (and their
   descendants), plus `:root:not([data-theme])` descendants inside
   `@media (prefers-color-scheme: dark)`. Drop `.ios-dark` and `.ios-light`.
5. `@theme inline`: add `--color-` aliases for the new tokens the routes will use in classes:
   `sidebar`, `label-4`, `fill-4`, `separator-opaque`, `tint-solid`, `on-tint`, `on-tint-solid`,
   `tint-fill`, `selection`, `focus`, `record`, `rolling`, `good`, `no-good`, `warning`,
   `unsynced`, `synced`, `conflict`.
6. `.material-bar` stays; add `.material-sheet` with `background: var(--mat-sheet)` and the same
   blur. Reduced transparency is handled by the tokens.

### The take prototype's `day`, `dark`, `night`

- `src/lib/take/settings.ts`: replace `themeClass()` with the attributes it stands for: day is
  `data-theme="light"`, dark is `data-theme="dark"`, night is `data-theme="dark" data-night="true"`.
  Light is now the sunlight theme, so `ios-day` has no counterpart. Once the shell sets the root,
  the prototype's `?theme=` writes the root attributes instead of a Workspace class.
- `src/routes/proto/take/+page.svelte`: spread those attributes on the Workspace in place of
  `class={themeClass(…)}` (Workspace passes `class` only: give it a `rest` spread, or wrap it).
- `:global(.ios-night)` becomes `:global([data-night='true'])` in `TakeDetail.svelte` (three
  rules) and `NumberDock.svelte` (one). With `--state-ring` and `--status-ring` most of those
  night rules can go.
- Kit docs (`components/ios/README.md`, Workspace and Screen comments): `class="ios-dark"` to force
  a theme becomes `data-theme="dark"` on the element.

### Kit components

| Where | Now | Becomes |
|---|---|---|
| `Workspace` `.list[data-at='side']` | `--bg-elevated` | `--sidebar` |
| `Rail` background | `--bg-elevated` | `--rail` |
| `RailButton` face | `--fill-2` | `--rail-button` |
| `RailButton` pressed or on | `--label` / `--bg` | `--rail-pressed` / `--rail-pressed-label`, plus `box-shadow: inset 0 0 0 var(--state-ring) var(--rail-pressed-label)` |
| `RailButton` badge | `--label` / `--bg` | `--tint-solid` / `--on-tint-solid` |
| `RecordButton` idle ring | `--label` | `--record-ring` |
| `RecordButton` rolling detail | `--record` | `--rolling` |
| `Keypad` keys | `--cell-elevated`, hairline | `--key`, `--key-label`, `--shadow-1` |
| `Keypad` point, delete | `--fill-3` | `--key-alt` |
| `Keypad` pressed | `--label` / `--bg` | `--key-pressed` / `--key-pressed-label`, plus the state ring |
| `Toggle` knob | `#fff` | `--thumb`; on: track `--tint-solid`, knob `--on-tint-solid`, state ring |
| `Slider` knob, fill | `#fff`, `--tint` | `--thumb`, `--tint-solid` |
| `Button` filled | `--tint` / `--on-tint` | `--tint-solid` / `--on-tint-solid`, state ring |
| `Button` filled destructive | `--destructive` / `#fff` | `--destructive-solid` / `--on-destructive` |
| `Button` tinted, `CameraTable`, `NumberDock` | `color-mix(--tint 16 to 18 %)` | `--tint-fill` |
| `NumberDock` `.next` | `--tint` / `--on-tint` | `--tint-solid` / `--on-tint-solid` |
| `Chip` on | ring in `--tint` | also `--tint-fill` background, `--tint` text |
| `Tile` icon | `#fff` | `--on-tint` when the tile is the tint |
| `Row` swipe actions | `#8e8e93`, `#fff` | `--fill` over `--cell`, `--label`; red: `--destructive-solid`, `--on-destructive` |
| `Section` group | nothing | `box-shadow: inset 0 0 0 var(--cell-ring) var(--separator-opaque)` |
| `Segmented` thumb | own shadow | `--shadow-1`; night: `outline: var(--state-ring) solid var(--label-2)` |
| `Sheet` panel | `--bg-elevated`, own shadow | `--mat-sheet` with `--mat-blur`, `--shadow-3` |
| `Menu`, `SetupPanel`, `UndoNotice` | own shadows | `--shadow-2` |
| `SheetPage` | own shadow | `--shadow-3` |
| every focus outline | `--tint` | `--focus` |

## The specimen

`/proto/themes`: every token with its worst contrast figure, the take screen in the kit's
Workspace (list, main, keypad dock, rail), Record idle and rolling, a take table with every status,
the sync bar, and a lens sheet (`?sheet=1`). Controls at the top pick light, dark or red night and
normal or increased contrast; `?mode=dark|night&contrast=more` opens one. "Show all pairings"
lists every measured pair. Its strings are not in the message catalogue: it is a prototype page.

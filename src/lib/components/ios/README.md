# iOS primitives

From holosession (#57 there). Classic iOS 17 look: bar material (`--mat-bar`, `.material-bar`)
and hairlines, no Liquid Glass (Kevin, 2026-10-29). Colour tokens in `src/lib/theme/tokens.css`, type utilities in `src/app.css`.
The phone parts are from holosession; the iPad parts (Workspace, Rail, RailButton, RecordButton,
Keypad, Chip, #1; NavShell, Page, Columns, InputRow, Notice, #9) are sg-onset's own.

## Deviations from docs/ios/plan.md §2

- No `--glass` token, no glass styling: TabBar is a full-width bar, Toolbar a bar, toolbar buttons plain.
- `navDirection` also returns `uncover` (leaving Run slides it down).
- Additions, all optional: Sheet `dismissible`, `onclose`; Row `class`; Button `full`, `class`, any
  button attribute; Segmented `small` (kept from builder/Segmented); Stepper `bigStep` (what a
  long press repeats by); Slider `format`; SearchField `onsubmit`, `label`; Menu `open`, `align`,
  item `disabled`, `section`; NavBar `back.onclick` (href optional), `ontitle` (the inline title as a button, WP4); ProgressRing `stroke`,
  `label`, `children`; Screen `scroller` (bindable); new `Tile`.
- `data-theme="dark"` (or `light`, or `data-night="true"`) on a Screen forces that theme on it
  (tokens and aliases are redeclared there). Run follows the appearance; its dim cover is black in both.

## Primitives

One line each: props, then an example.

- `Screen {children, accessory?, class?, scroller?}`: 430 px column, one scroll, accessory below it.
  `<Screen>…{#snippet accessory()}<Toolbar>…</Toolbar>{/snippet}</Screen>`
- `NavBar {title, large?, back?: {href?, label, onclick?}, leading?, trailing?}`: sticky, first child of Screen.
  `<NavBar title="Explore" large />` · `<NavBar title="Box" back={{ href: '/sessions', label: 'Sessions' }} />`
- `TabBar {items: {href, label, icon}[], active}`: fixed at the foot; sets `--tabbar-space`.
  `<TabBar active={page.url.pathname} items={[{ href: '/', label: 'Explore', icon: Compass }]} />`
- `Section {header?, footer?, inset = true, children}`: header/footer a string or snippet.
  `<Section header="Music" footer="Plays under the breath.">…rows…</Section>`
- `Row {title, subtitle?, detail?, href?, onclick?, chevron?, checked?, destructive?, leading?, trailing?, swipe?}`.
  `checked={false}` keeps the checkmark's space. `swipe: {label, destructive?, run}[]`, first runs on a full swipe.
  `<Row title="Length" detail="8 min">{#snippet trailing()}<Stepper …/>{/snippet}</Row>`
- `Tile {icon, color?}`: 29 px icon tile for a Row's `leading`.
  `{#snippet leading()}<Tile icon={Camera} color="var(--tint)" />{/snippet}`
- `Sheet {open (bindable), detents = ['large'], detent (bindable), title?, leading?, trailing?, done?, dismissible = true, onclose?, children}`.
  Detents `'medium' | 'large' | number` (share of the height). Portals into the Screen.
  `<Sheet bind:open detents={['medium', 'large']} title="Build · 2 of 5" done>…</Sheet>`
- `SheetPage {open (bindable), title, trailing?, footer?, children}`: a drill-in, anywhere inside a Sheet;
  `footer` stays under the scroll (the drums page's Hear and Use). Back says "Back" past 10 characters (`ios/back.ts`).
  `<SheetPage bind:open={rhythm} title="Rhythm">…</SheetPage>`
- `ActionSheet {open (bindable), title?, message?, actions: {label, role?: 'destructive' | 'cancel', run}[]}`.
  `<ActionSheet bind:open title="Delete this session?" actions={[{ label: 'Delete', role: 'destructive', run }]} />`
- `Menu {items: {label, icon?, destructive?, disabled?, section?, run}[], trigger, open?, align?}`: trigger gets props to spread.
  `<Menu {items}>{#snippet trigger(props)}<button {...props} aria-label="More">…</button>{/snippet}</Menu>`
- `Button {variant: filled|tinted|gray|plain = gray, size: small|medium|large = medium, destructive?, href?, full?}`.
  `<Button variant="filled" size="large" full onclick={start}>Start</Button>`
- `Segmented {options, value, onchange, ghost?, small?, label}`: options are `ios/option.ts` `Option`.
  `<Segmented options={PURPOSES} value={p} onchange={(v) => (p = v)} label="Purpose" />`
- `Stepper {value, min?, max?, step = 1, bigStep?, onchange, format?, label}`: show the value elsewhere.
  `<Stepper value={min} min={1} max={60} bigStep={5} onchange={set} label="Length" />`
- `Toggle {checked, onchange, disabled?, label}`.
  `<Toggle checked={onBeat} onchange={(v) => (onBeat = v)} label="On the beat" />`
- `Slider {value, min = 0, max = 1, step = 0.01, onchange, leading?, trailing?, label, format?}`.
  `<Slider value={vol} onchange={setVol} label="Volume" />`
- `SearchField {value (bindable), placeholder = t('common.search'), oncancel?, onsubmit?, label?}`.
  `<SearchField bind:value={q} placeholder="Music" oncancel={back} />`
- `Toolbar {children, label?}`: put in Screen's `accessory`.
  `<Toolbar><Button variant="plain">Listen</Button><Button variant="filled">Start</Button></Toolbar>`
- `EmptyState {icon?, title, message?, action?}`.
  `<EmptyState icon={Folder} title="No Sessions" message="…">{#snippet action()}…{/snippet}</EmptyState>`
- `ProgressRing {value (0–1), size = 64, stroke?, color = tint, label?, children?}`.
  `<ProgressRing value={0.5} size={72}>3 of 6</ProgressRing>`

## iPad (#1)

- `Workspace {hand = 'right', target = 78, gap = 16, class?, list, main, dock, rail}`: list, main,
  dock and rail side by side; the rail on the holding hand's edge, the left hand mirrors every
  column. Under 1000 px wide the list is a strip on top; under 700 px one stack, the rail along
  the foot. Snippets get where they sit: `list(at, form)`, `main(form)`, `dock(form)`,
  `rail(edge)`. `data-theme` and `data-night` on an ancestor pick the theme (the old `ios-*`
  classes work for now).
  `target` and `gap` (px, from `ios/target.ts`) become `--target` and `--gap`. The dock is three
  targets wide, 304 px at least: 352 px at the large button size, so a key is 20 mm both ways.
  It never scrolls (`overflow: clip`). Its width is its own room, not the window's: beside the
  open sidebar an iPad in landscape gets the tall form.
- `Rail {edge, label, rolling?, top?, capture, more?}`: the action rail. `capture` sits a third to
  half way down a side edge, `more` under it, `top` in the corner.
- `RailButton {label, caption = label, capture?, badge?, disabled?, pressed?, lockout = 300, onclick, children}`:
  an icon in a square with a word under it. `capture`: the full target (15 mm, 20 mm for gloves).
  Fires on the release (a file input opens only from a real click); one press per `lockout` ms.
  Off: a dashed outline, no face.
- `RecordButton {rolling, phase?, label, caption = label, detail?, since?, shortcut = 'r', lockout = 500, onpress?, onclick?}`:
  the take's Start and End. Fires on the way down, `onpress(at)` with the instant the finger
  landed, then takes no press for `lockout` ms (`ios/press.ts`). Ready: a ring and a disc.
  Running: a square, the running time from `since`. Ended (`phase="filed"`): a tick on the corner.
- `Keypad {onkey, point = true, sign?, canBack = true, onstep?, canLess?, canMore?, onnext?, ondone?, labels}`:
  digits, point, delete; with `onstep` a row of less, plus or minus and more. A key answers on
  pointer down, once; delete and the stepper repeat while held. A palm does not type. A
  hardware keyboard types too: Enter is `onnext`, Escape `ondone`, but not while a layer opened
  after the keypad is on top. Sends `ios/keypad.ts` keys.
- `Chip {on?, label?, onclick, children}`: a value to pick with one tap, 44 px tall. Picks on
  release, so a drag along a row of chips scrolls. `on`: a ring, not colour alone.
- Motion on the capture path: nothing waits on an animation. The state lands on the first frame;
  motion follows as feedback. `data-motion="reduced"` on the root stills it all.
- Pure, tested: `ios/target.ts` `mmToPx`, `captureTarget`, `isPalm` (132 px to the inch on an
  iPad); `ios/handedness.ts` `formFor`, `workspaceLayout`, `gridAreas`; `ios/keypad.ts`
  `keypadPress`, `entryValue`, `stepValue`, `canStep`, `formatNumber`, `hardwareKey`,
  `repeatDelay`; `ios/press.ts` `press`, `pressInstant`, `isShortcut`.

## Tablet first (#9)

The app is built for an iPad. A page is never a centred phone column there.

- Every page outside the capture path is a `Page`, not a `Screen`. `Screen` stays for a
  phone-only view.
- Inside the shell a page fills what `NavShell` leaves. Pick the column by what the page holds:
  `form` (560 px) for a few fields, `readable` (720 px, the default) for a list or a detail,
  `columns` (1080 px) with `Columns` for many short sections, `full` for a table or a grid.
- From 700 px of room a Page has an iPad's margins (24 px) and its large title lines up with the
  text of the rows. Under 700 px it is the phone column: full width, 16 px margins. Your own
  blocks follow with `padding: 0 var(--page-margin, 16px)`.
- A full sheet is a form sheet from 700 px: a card in the middle. A sheet with a text field is a
  full sheet, so the keyboard never covers the field.
- The capture path is a `Workspace`, in the shell too: it fills the same space.
- Sizes come from the room an element has (container queries, `bind:clientWidth`), not from the
  window: the sidebar takes 80 or 248 px of it.
- Touch targets are `var(--touch, 44px)` tall at least; capture targets `var(--target)`. Both grow
  at the large button size.
- Motion: `data-motion="full|reduced"` on `<html>` is the setting, resolved. Style against it,
  not against the media query; `reducedMotion()` in `layer.svelte.ts` reads it. Reduced turns
  every transition and animation off (`theme/motion.css`). On the capture path nothing waits on an
  animation: the state lands on the first frame, motion follows as feedback. Elsewhere motion
  is transform and opacity only, and interruptible.
- Theme: `data-theme="light|dark"` and `data-night="true"` on `<html>`; `lib/theme/tokens.css`
  keys on them (`docs/design/colour.md`). Use the tokens, never a colour of your own: a `#fff`
  would light the set in red night mode. A control that is on or pressed adds `--state-ring`.
  Increase Contrast and Reduce Transparency come through the tokens.

- `NavShell {items: {id, href, label, icon}[], active?, hand, strip?, focus?, label, title?, ontoggle?, toggleLabel?, status?, children}`:
  the app's frame. Wide: a sidebar on the side edge away from the holding hand, 248 px with
  names or an 80 px strip of icons (`strip`). The collapse button shows on every page; the width
  eases only after it, never on a change of page, and never on a `focus` page. Under
  1000 px: a bar across the top, the tabs from the far corner; under 700 px an icon over a word.
  Never along the foot, never on the holding hand's edge: the action rail is there. `status(placement)`
  is a quiet control at the end (`side`, `strip`, `top`). The page gets the rest as `--app-height`.
  Sheets opened inside land on the shell. Pure: `ios/shell.ts` `shellLayout`.
- `Page {children, accessory?, width = 'readable', scroller?}`: one scroll, the content a centred
  column. First child a `NavBar`. Sets `--page-w`, `--page-margin`, `--title-inset`.
  `<Page width="columns"><NavBar title="Settings" large /><Columns>…</Columns></Page>`
- `Columns {children}`: each child element is a column; two side by side from 860 px of page.
  `<Columns><div><Section>…</Section></div><div><Section>…</Section></div></Columns>`
- `InputRow {label, value (bindable), onchange?, invalid?, error?, …input attributes}`: a typed
  row of a Section. `onchange(text)` on leaving the field or Return, trimmed, only when changed.
  `<InputRow label="Scene" bind:value={scene} onchange={save} error={problem} />`
- `Notice {text, action?, onaction?}`: what was just done, with one action. A pill at the foot of
  the page, in the middle, clear of both thumbs. The shell shows the last edit in one.
- Row classes (app.css): `class="tint"` for a row that does something, `class="quiet"` for a row
  that only says something.
- Changed for the above: Sheet and ActionSheet dim the whole window and keep their panel to a
  column (`--sheet-half`); Section and NavBar read `--page-margin`; NavBar keeps its bar to
  `--page-w`.
- Gone: `ios/appearance.ts` and its rune (System, Light, Dark by `data-theme` alone). The
  settings are `lib/app/settings.ts`.

## Shared

- `layer.svelte.ts`: Screen context, `portal`, the overlay stack (Escape and Tab go to the top one;
  a sheet under another scales to .94 and dims), focus trap and return, `reducedMotion()`. A
  panel that is not a Sheet joins the stack with `use:layer={onclose}`: Escape closes it alone.
- Pure, tested: `ios/detent.ts` `snapDetent`, `ios/swipe.ts` `swipeState`, `ios/largeTitle.ts`
  `titleProgress`, `ios/direction.ts` `navDirection` and `pageMotion` (moved by `pageStage.ts`).
- Pure, tested: `ios/keys.ts` `trapStep` (Sheet's focus trap) and `radioStep` (Segmented's
  arrows), from holosession's `builder/keys.ts`.
- `ios/direction.ts` holds sg-onset's tab roots: `/` and the five destinations. A page under one
  pushes and pops; a change of destination fades; the shell's navigation stays put meanwhile
  (outside NavShell's `data-page-stage`). The `/run` cover is still holosession's.
- A Toggle or Stepper in a Row overhangs its padding: rows stay 44 tall.
- No English in the kit: a default word (Search, Cancel, Back, Close…) is a `t()` key of
  `i18n/en/common.ts` (`common.*`, `kit.*`); a prop still overrides it.

## Motion

The rules, tokens and what each part does: `docs/design/motion.md`. Transform and opacity only,
interruptible, never blocking a tap, nothing on the capture path. What a feature area uses:

- **Tokens.** CSS: `var(--spring-snappy|smooth|page)` with `var(--dur-snappy|smooth|page)` as a
  transition or animation easing and duration; `--ease-out`; `--dur-press|fade|exit`. Code:
  `SPRINGS`, `EASINGS`, `DURATIONS`, `springCss(name)` from `$lib/theme/motion`.
- **Reduced motion.** Style against `html[data-motion='reduced']`, never the media query; in code,
  `reducedMotion()` from `layer.svelte.ts`. Every helper below already does nothing (or fades)
  when it is reduced.
- **A list whose entries come, go and change place** (Gear, Slates): `listMotion()` from
  `components/ios/motion.ts` on the element whose children are a keyed `{#each}`:
  `<div {@attach listMotion()}>`. A new entry fades in, a removed one fades out where it was while
  the others close the gap, a moved one glides to its place. `listMotion({ disabled: () => busy })`
  turns it off for a moment. Pure part: `ios/flip.ts` (`flipDelta`, `listDiff`).
- **One thing from where it was to where it is**: `boxOf(node)` before the change, `flipFrom(node,
  box, { spring, scale })` after it (`flushSync()` between, in Svelte).
- **A tap-driven move**: `animateSpring(node, keyframes, 'smooth')`: a Web Animation on a spring
  that replaces the one it ran before on the node; `settle(node)` stops it.
- **Something that comes and goes**: `in:rise={{ y: 12 }} out:rise={{ y: 8, exit: true }}`. It
  leaves sooner than it came and takes no touch while it does.
- **A finger-driven move**: `springDriver('sheet', (y) => (el.style.transform = …), onrest)`:
  `jump(x)` while the finger drags, `to(target, velocity)` on release. Gesture maths in
  `ios/gesture.ts`: `rubberband`, `releaseVelocity`, `project`, `dimProgress`; the spring in
  `ios/spring.ts`.
- **A part that stays while its page pushes** (a list beside a detail): `data-page-pin` on it, in
  both pages.
- **Never** animate width, height, top or left; never put motion in `Rail`, `RailButton`,
  `RecordButton`, `Keypad` or `Chip`.

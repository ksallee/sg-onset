# iOS primitives

From holosession (#57 there). Classic iOS 17 look: bar material (`--mat-bar`, `.material-bar`)
and hairlines, no Liquid Glass (Kevin, 2026-10-29). Tokens and type utilities in `src/app.css`.
The phone parts are from holosession; the iPad parts (Workspace, Rail, RailButton, RecordButton,
Keypad, Chip) are sg-onset's own (#1).

## Deviations from docs/ios/plan.md §2

- No `--glass` token, no glass styling: TabBar is a full-width bar, Toolbar a bar, toolbar buttons plain.
- `navDirection` also returns `uncover` (leaving Run slides it down).
- Additions, all optional: Sheet `dismissible`, `onclose`; Row `class`; Button `full`, `class`, any
  button attribute; Segmented `small` (kept from builder/Segmented); Stepper `bigStep` (what a
  long press repeats by); Slider `format`; SearchField `onsubmit`, `label`; Menu `open`, `align`,
  item `disabled`, `section`; NavBar `back.onclick` (href optional), `ontitle` (the inline title as a button, WP4); ProgressRing `stroke`,
  `label`, `children`; Screen `scroller` (bindable); new `Tile`.
- `class="ios-dark"` (or `ios-light`) on a Screen forces that theme on it (tokens and aliases are
  redeclared there). Run follows the appearance; its dim cover is black in both.

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
- `SearchField {value (bindable), placeholder = 'Search', oncancel?, onsubmit?, label?}`.
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
  `rail(edge)`. `class="ios-light ios-day"`, `ios-dark`, `ios-dark ios-night` picks the theme.
  `target` and `gap` (px, from `ios/target.ts`) become `--target` and `--gap`.
- `Rail {edge, label, rolling?, top?, capture, more?}`: the action rail. `capture` sits a third to
  half way down a side edge, `more` under it, `top` in the corner.
- `RailButton {label, caption?, capture?, badge?, disabled?, pressed?, onclick, children}`: an icon
  in a square with a word under it. `capture`: the full target (15 mm, 20 mm for gloves).
- `RecordButton {rolling, label, caption?, detail?, onclick}`: a ring and a disc; a square while rolling.
- `Keypad {onkey, point = true, labels}`: digits, point, delete. Sends `ios/keypad.ts` keys.
- `Chip {on?, label?, onclick, children}`: a value to pick with one tap.
- No motion in any of these: they are the capture path.
- Pure, tested: `ios/target.ts` `mmToPx`, `captureTarget` (132 px to the inch on an iPad);
  `ios/handedness.ts` `formFor`, `workspaceLayout`, `gridAreas`; `ios/keypad.ts` `keypadPress`,
  `entryValue`, `stepValue`, `formatNumber`.

## Shared

- `layer.svelte.ts`: Screen context, `portal`, the overlay stack (Escape and Tab go to the top one;
  a sheet under another scales to .94 and dims), focus trap and return, `reducedMotion()`.
- Pure, tested: `ios/detent.ts` `snapDetent`, `ios/swipe.ts` `swipeState`, `ios/largeTitle.ts`
  `titleProgress`, `ios/direction.ts` `navDirection` (View Transitions in `+layout.svelte`).
- Pure, tested: `ios/keys.ts` `trapStep` (Sheet's focus trap) and `radioStep` (Segmented's
  arrows), from holosession's `builder/keys.ts`.
- `ios/direction.ts` still holds holosession's tab roots (`/`, `/sessions`, `/settings`) and its
  `/run` cover: set sg-onset's once it has routes.
- A Toggle or Stepper in a Row overhangs its padding: rows stay 44 tall.

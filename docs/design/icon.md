# Icon and install identity

What SG OnSet looks like before it opens: the Home Screen icon, the launch image, the tab icon and
the wordmark. One drawing, `static/brand/icon.svg`, is the source. `scripts/icons.mjs` writes
every other file from it. The specimen page is `/proto/icon`. `src/lib/pwa/manifest.test.ts`
checks the files.

## The concept: take marks

Four bars and a strike. It is the way a count is kept by hand, and the count kept on a set is
takes. The bars are the takes behind you. The strike is the take being logged, in the app's one
blue.

Why this one:

- It says what the app does (log takes), where a camera, a lens or a clapperboard says film in
  general.
- Five straight strokes hold at small sizes. The tab icon is the same drawing snapped to pixels.
- It stays itself in one colour: the strike is cut clear of the bars, so the tinted, clear and
  monochrome versions read as well as the coloured one.
- A light mark on a dark field is what iPadOS darkens and tints best. A Home Screen web app has no
  documented way to give the system its own dark, tinted or clear icon
  ([Apple forum thread](https://developer.apple.com/forums/thread/787919)), so the one image has
  to survive the system's own versions. Not yet checked on an iPad: see "To check on a device".
- Nothing near it in the trade. No clapperboard (an editor's icon already), no record disc (every
  camera app), no Autodesk or Flow Production Tracking mark or colour.

Eight concepts were drawn. All are on `/proto/icon` with the reason each was kept or set aside.

| Concept | From | Verdict |
|---|---|---|
| Take marks | The take count, kept by hand | Chosen |
| Tracking marker | The marker VFX tapes to the set | Runner-up. Sharpest at 16 px, but a checker to anyone outside VFX. |
| Floor mark | The tape T an actor stands on | Runner-up. Bold, but it is the letter T when small. |
| Sticks | The clapper on a slate | Set aside. Every film app has one; stripes are noise under 60 px. |
| Start disc | The button that starts a take | Set aside. A record button, and red is kept for that one control. |
| Iris | The lens the notes describe | Set aside. It promises pictures; the app takes none. |
| Slate sheet | A slate as rows of fields | Set aside. A calendar or a calculator at a glance. |
| Letters | The name | Set aside. SG is the family, not this app. |

## Construction

The canvas is 1024 square, full bleed, no corners: the system cuts them.

| Part | Geometry |
|---|---|
| Bars | Four. 88 wide, 488 tall, 56 apart, corner radius 18. x 252, 396, 540, 684; y 268 to 756. |
| Strike | 88 thick, 768 long, radius 18, turned 23.4° up to the right about the centre (512, 512). |
| Gap | The strike clears every bar by 30: the bars are masked by a band 148 thick. |
| Mark | 740 wide by 488 tall, centred. 72 % of the canvas. Its farthest corner is 387 from the centre. |
| Maskable | The same mark at 84 %, so it sits well inside the safe circle (radius 410 at this size). |

The unit is one bar (88). A bar and a gap are 144.

Small sizes are drawn again on the pixel grid, same count and same angle:

- 16 px (the tab icon, no field): bars 2 wide and 2 apart, 12 tall; strike 2 thick.
- 32 px (the PNG fallback, on the field): bars 3 wide and 2 apart, 16 tall; strike 3 thick.

## Colours

All from `src/lib/theme/palette.ts`, except the strike on dark, which sits between the palette's
two dark blues so it carries on a Home Screen.

| Part | On the dark field | On a light ground |
|---|---|---|
| Field or ground | #232427 at the top to #0a0a0b (`--bg`, dark) | #ecedf2 (`--bg`, light) |
| Bars | #eff0f2 (`--label`, dark) | #0d0e12 (`--label`, light) |
| Strike | #568ef9: OKLCH 0.66 0.17 262 | #3d70d1 (`--tint-solid`, dark) |

Red is not in the icon. Red is Record's (`docs/design/colour.md`).

## Clear space and size

- Keep one bar and one gap (144 of 1024, a fifth of the mark's width) clear on every side of the
  mark. The lockup's own box already includes nothing else: add the space around it.
- The mark alone: no smaller than 16 px wide. Under 24 px use `favicon.svg`, the pixel drawing.
- The lockup: no smaller than 20 px tall.

## Do

- Use the files as written. Change the source and run the script.
- Put the dark lockup on dark grounds and the light lockup on light ones.
- Let the system cut the icon's corners. Only `icon-192.png`, `icon-512.png` and `favicon-32.png`
  carry their own.

## Do not

- Recolour the bars or the strike, or make the strike red.
- Change the count, the angle or the gap. Do not round the bar ends into pills.
- Put the mark on a photograph or a mid-grey: light ground or dark field only.
- Set the name in another face beside the mark, or write it "SG Onset" or "sg-onset"
  (`docs/vocabulary.md`).
- Add a glow, a shadow or a gradient to the mark. The field has the only gradient.

## The files

| File | What | Used by |
|---|---|---|
| `static/brand/icon.svg` | The source, 1024, full bleed | The script; `/proto/icon` |
| `static/icons/apple-touch-icon.png`, `-167`, `-152` | Full bleed, opaque: 180, 167, 152 | `app.html`, the iPad Home Screen |
| `static/icons/icon-192.png`, `icon-512.png` | With corners, on nothing | The manifest, purpose `any`; the shortcuts |
| `static/icons/icon-maskable-512.png` | Full bleed, the mark at 84 % | The manifest, purpose `maskable` |
| `static/icons/icon-monochrome-512.png` | The mark alone in white, on nothing | The manifest, purpose `monochrome` |
| `static/favicon.svg` | The 16 px drawing; dark on light tabs, light on dark | `app.html` |
| `static/favicon-32.png` | The 32 px drawing on the field | `app.html`, browsers with no SVG icon |
| `static/splash/ipad-<w>x<h>-<way up>-<scheme>.png` | Launch images, 36 | `app.html` |
| `static/brand/mark-light.svg`, `mark-dark.svg` | The mark alone, for a light and a dark ground | Anywhere |
| `static/brand/lockup-light.svg`, `lockup-dark.svg` | The mark and the name | The README, the welcome screen |

"Light" and "dark" in a file name are the ground it goes on.

## Launch images

iPadOS does not make a launch screen from the manifest the way Android does. A Home Screen web app
with no `apple-touch-startup-image` that matches the device exactly opens on a blank screen
([web.dev](https://web.dev/learn/pwa/enhancements),
[firt.dev](https://firt.dev/notes/pwa-ios/)). On a dark set that is a white flash, so the images
are shipped: the mark, 144 pt wide, centred on the canvas of the scheme (`--bg`), for the nine
iPad screen sizes iPadOS 26 runs on, both ways up, light and dark. The link's media query picks
one by `device-width`, `device-height`, pixel ratio, orientation and `prefers-color-scheme`.

The scheme is the iPad's, not the app's own setting: iPadOS picks the image before any script
runs. Red night opens on the dark image.

## The wordmark

The lockup is the mark and "SG OnSet" in the system face (weight 650, tracking -0.025 em), the
cap height centred on the mark. The text is live text, so it draws in San Francisco on Apple
devices and in the system face elsewhere; the file's width is measured where the script runs.

In the README:

```html
<picture>
	<source media="(prefers-color-scheme: dark)" srcset="static/brand/lockup-dark.svg" />
	<img src="static/brand/lockup-light.svg" alt="SG OnSet" height="48" />
</picture>
```

On the welcome screen, one image per scheme (the app's `data-theme`, not the device's):

```svelte
<img class="lockup on-light" src="/brand/lockup-light.svg" alt="SG OnSet" height="40" />
<img class="lockup on-dark" src="/brand/lockup-dark.svg" alt="" aria-hidden="true" height="40" />
```

```css
:global([data-theme='dark']) .on-light,
:global([data-theme='light']) .on-dark {
	display: none;
}
```

Red night has no lockup of its own (blue and off-white are not red-only). There, show the name as
text in `--label`.

## Manifest and head

- Name and short name "SG OnSet". `display: standalone`, `orientation: any`, `id` and `start_url`
  `/`.
- `theme_color` and `background_color` are #0a0a0b, the dark canvas: a manifest holds one value,
  and the set is dark more often than not.
- `app.html` has a `theme-color` meta per scheme (#ecedf2 light, #0a0a0b dark). The script in the
  head then sets the stored theme.
- Shortcuts: Shoot (`/shoot`) and Slates (`/slates`). iPadOS ignores them today; other platforms
  show them on a long press.

## To regenerate

Edit `static/brand/icon.svg`, then:

```
node scripts/icons.mjs
pnpm test
```

The script draws with the Chromium that Playwright installs (`pnpm e2e:install`), so it adds no
dependency. It rewrites `static/icons/`, `static/splash/`, `static/favicon.*`, the mark and
lockup in `static/brand/`, and the launch image links in `src/app.html` between the two
`launch images` comments. To add an iPad, add its size in points to `IPADS` in the script.

## To check on a device

Not checked on hardware yet:

- The icon in the dark, tinted and clear Home Screen styles on iPadOS 26. The specimen draws what
  the system is expected to do.
- The launch image on a cold start, each way up, in light and dark.

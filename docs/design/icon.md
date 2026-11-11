# Icon and install identity

What SG OnSet looks like before it opens: the Home Screen icon, the launch image, the tab icon and
the wordmark. One drawing, `static/brand/icon.svg`, is the source. `scripts/icons.mjs` writes
every other file from it. The specimen page is `/proto/icon`. `src/lib/pwa/manifest.test.ts`
checks the files.

## The concept: tracking marker

The quartered square VFX tapes to a set so a shot can be tracked. Two quarters in gold, two in deep
gold, meeting at one point: the point a tracker locks to. Kevin picked it from the specimen (#53).

Why this one:

- It is this crew's own object. A camera, a lens or a clapperboard says film in general.
- It is the sharpest of the eight drawings at 16 px: four squares on the pixel grid.
- It is one object. The quarters touch, with no gap, and the square keeps its outer corners. With
  gaps it is a window logo. With two quarters left out it is a pair of steps. With more than four
  cells it is a flag.
- It stays itself in one colour: the deep quarters become the same colour at 35 %, so the tinted,
  clear and monochrome versions still show a quartered square.
- A light mark on a dark field is what iPadOS darkens and tints best. A Home Screen web app has no
  documented way to give the system its own dark, tinted or clear icon
  ([Apple forum thread](https://developer.apple.com/forums/thread/787919)), so the one image has
  to survive the system's own versions. Not yet checked on an iPad: see "To check on a device".
- No Autodesk or Flow Production Tracking mark or colour.

Eight concepts were drawn. All are on `/proto/icon` with the reason each was kept or set aside.

| Concept | From | Verdict |
|---|---|---|
| Tracking marker | The marker VFX tapes to the set | Chosen |
| Take marks | The take count, kept by hand | Runner-up. The first icon. Kevin preferred the marker. |
| Floor mark | The tape T an actor stands on | Runner-up. Bold, but it is the letter T when small. |
| Sticks | The clapper on a slate | Set aside. Every film app has one; stripes are noise under 60 px. |
| Start disc | The button that starts a take | Set aside. A record button, and red is kept for that one control. |
| Iris | The lens the notes describe | Set aside. It promises pictures; the app takes none. |
| Slate sheet | A slate as rows of fields | Set aside. A calendar or a calculator at a glance. |
| Letters | The name | Set aside. SG is the family, not this app. |

The gold was drawn six ways (`/proto/icon`, "The gold, six ways") and judged at 180, 60, 32 and 16
px on a pale and a dark wallpaper.

| Variant | Verdict |
|---|---|
| As first seen: the tint mock, gaps of 24, two quarters at 30 % | Set aside. A window logo. |
| Pair: two gold quarters, two left out | Set aside. Steps; the square is gone. |
| Framed pair: the pair inside a deep gold frame | Set aside. The frame is gone at 16 px. |
| One gold: off-white, charcoal and one gold quarter | Set aside. Three colours, and little gold. |
| Bronze, with gaps: gold and bronze, a cross between | Set aside. The bronze reads brown; the cross reads as a window. |
| Gold and deep gold, no gaps | Chosen |

## Construction

The canvas is 1024 square, full bleed, no corners: the system cuts them.

| Part | Geometry |
|---|---|
| Marker | A square of 544, centred: 240 to 784. 53 % of the canvas. Outer corners of radius 60. |
| Quarters | Four of 272. No gap. They meet at the centre (512, 512). |
| Gold | Top left and bottom right. Top right and bottom left are deep gold. |
| Reach | The marker's corner is 385 from the centre. |
| Maskable | The same marker at 84 %, so it sits well inside the safe circle (radius 410 at this size). |

The unit is one quarter (272).

Small sizes are drawn again on the pixel grid, with the centre on a pixel edge:

- 16 px (the tab icon, no field): a square of 14, quarters of 7, corner radius 2.
- 32 px (the PNG fallback, on the field): a square of 18, quarters of 9, corner radius 2.

## Colours

The gold is the icon's own. It is an identity colour, separate from the UI accent: the app's accent
stays the blue in `src/lib/theme/palette.ts`, and the gold is not a palette token. Do not use it
for a control, a status or text in the app.

| Part | OKLCH | On the dark field | On a light ground |
|---|---|---|---|
| Field or ground | | #232427 at the top to #0a0a0b (`--bg`, dark) | #ecedf2 (`--bg`, light) |
| Gold | 0.80 0.145 84 | #eab53b | #cf9b0f (0.72 0.145 84) |
| Deep gold | 0.41 0.065 88 | #59481c | #272114 (0.25 0.025 85) |
| Name, in the lockup | | #eff0f2 (`--label`, dark) | #0d0e12 (`--label`, light) |

- Gold on the field is 10.5:1 at the bottom and 8.2:1 at the top. Hue 84 sits between yellow (about
  100) and orange (about 60). Chroma 0.145 keeps it from mustard.
- Deep gold is 2.2:1 on the bottom of the field, enough to close the square at 16 px.
  Its hue is turned 4° toward yellow and its chroma is more than halved, so it reads as gold in
  shadow rather than brown.
- On a light ground the deep quarters go near black (13.7:1 on the canvas) and carry the shape.
  The gold beside them is a shade darker.
- In one colour (monochrome, clear), the deep quarters are that colour at 35 %.

Red is not in the icon. Red is Record's (`docs/design/colour.md`). The UI blue is not in it either.
`manifest.test.ts` checks both.

## Clear space and size

- Keep half a quarter (136 of 1024, a quarter of the mark's width) clear on every side of the
  mark. The lockup's own box already includes nothing else: add the space around it.
- The mark alone: no smaller than 16 px wide. Under 24 px use `favicon.svg`, the pixel drawing.
- The lockup: no smaller than 20 px tall.

## Do

- Use the files as written. Change the source and run the script.
- Put the dark lockup on dark grounds and the light lockup on light ones.
- Let the system cut the icon's corners. Only `icon-192.png`, `icon-512.png` and `favicon-32.png`
  carry their own.

## Do not

- Recolour the quarters, swap the golds, or use the UI blue or Record red in the mark.
- Open a gap between the quarters, drop two of them, or turn the marker.
- Use the gold in the app's UI. It is the icon's.
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
are shipped: the mark, 112 pt wide, centred on the canvas of the scheme (`--bg`), for the nine
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

Red night has no lockup of its own (gold and off-white are not red-only). There, show the name as
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

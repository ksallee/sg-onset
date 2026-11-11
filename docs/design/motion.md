# Motion

SG OnSet should move like an iPadOS app: things go where the finger sends them, a second tap
turns them around, and nothing ever makes the crew wait. This page holds the rules, every token,
and what each part of the shell does. The tokens live in `src/lib/theme/motion.css`, mirrored for
code in `src/lib/theme/motion.ts` (`motion.test.ts` fails when the two differ). The primitives a
feature area uses are in the kit README, under "Motion".

## Rules

1. **Motion says where something came from or went.** A push says "deeper", a fade says "elsewhere",
   a sheet says "on top, for a moment". Decoration does not move.
2. **Never blocks.** The new page is live on its first frame. A tap during any motion lands. A
   leaving sheet, action sheet, menu or notice takes no touch, so what is under it answers at once.
   No navigation waits on an animation.
3. **Interruptible.** Every motion starts from where the thing is drawn, at the speed it has. A
   second tap mid-flight turns it around; it never jumps to an end first. Taps start a Web
   Animation or a CSS transition (retargeted by the browser); a finger drives a spring in code.
4. **Transform and opacity only.** Layout changes once, at once; then transforms carry the eye
   from the old place to the new (FLIP). No frame asks for layout.
5. **Springs, critically damped.** Nothing overshoots. A spring is two numbers, `response`
   (seconds) and `damping`, as Apple gives them. Tap-driven motion uses the spring as a CSS
   `linear()` easing; finger-driven motion steps it per frame from the finger's release speed.
6. **The capture path never moves.** The take screen's rail, the start button, the keypad and the
   chips (`Rail`, `RailButton`, `RecordButton`, `Keypad`, `Chip`) have no motion beyond a press
   state. A change of page to or from Shoot is there on the first frame; the sidebar never eases
   beside it; the notice comes and goes with no motion there.
7. **The setting wins.** Motion is `data-motion="full|reduced"` on `<html>`, resolved before first
   paint (`app.html`): Settings ▸ Motion is System, Full or Reduced; System follows
   `prefers-reduced-motion`. Style against the attribute, never the media query.
   `reducedMotion()` (`components/ios/layer.svelte.ts`) is the one check in code.

## Tokens

| Token | Value | For |
|---|---|---|
| `snappy` spring | response 0.25 s, damping 1 → `--spring-snappy`, `--dur-snappy` 300 ms | A control answering a tap: Toggle knob, Segmented thumb, the selected item's mark, a menu. |
| `smooth` spring | response 0.35 s, damping 1 → `--spring-smooth`, `--dur-smooth` 410 ms | A surface moving a short way: the sidebar, the notice, a list closing a gap, a sheet stepping back. |
| `page` spring | response 0.4 s, damping 1 → `--spring-page`, `--dur-page` 470 ms | A page pushing or popping, a sheet page, an action sheet. |
| `sheet` spring | response 0.4 s, damping 1, in code only | A sheet: present, snap to a detent, dismiss. Carries the finger's speed. |
| `--ease-out` | `cubic-bezier(0.23, 1, 0.32, 1)` | Fades, exits. Never ease-in. |
| `--ease-ios` | `cubic-bezier(0.32, 0.72, 0, 1)` | The kit's first curve, kept for Row, NavBar, SearchField and Gear; and the fallback where `linear()` is missing. |
| `--dur-press` | 200 ms | A press letting go. The press itself lands at once. |
| `--dur-fade` | 150 ms | A fade: one destination over another, a label, every move under reduced motion. |
| `--dur-exit` | 200 ms | Something leaving. Shorter than it took to come. |
| `--dur-snap`, `--dur-reveal`, `--dur-control` | 350, 200, 250 ms | Older names still read by Row, NavBar, SearchField and Gear. |

The `linear()` curves are made by `springLinear` (`src/lib/ios/spring.ts`): 24 stops, the duration
being when the spring is within 0.5 % of its target.

## The shell

| Motion | What it says | How | Interruption | Reduced |
|---|---|---|---|---|
| **Push, pop** within a destination (a slate over the list, sign-in over Settings) | Deeper, back | The new page slides in from the right edge over the old; the old moves a third of the way left under a 12 % black veil. Pop is the reverse. `page` spring. | Back mid-push turns the push around from where the page is drawn. | 150 ms fade |
| **Change of destination** (sidebar, top bar, "Shoot This Slate") | Elsewhere | The new page fades in over a still picture of the old, 150 ms `--ease-out`. Never a slide: the sidebar may change width under the page in the same frame. | A new change drops the picture and fades from the page as drawn. | The same fade |
| **To or from Shoot** | | Nothing: the page is there on the first frame. A push still pushes. | | Nothing |
| **After the iPadOS edge swipe** | | Nothing: the system already moved the page. | | Nothing |
| **Sidebar** expand and collapse (the button only) | The navigation folds | The column takes its new width at once. The sidebar's panel slides under its own clip while its contents slide back by as much; icons glide to their new places; names cross-fade (the leaving one in 150 ms, the coming one after 90 ms); the page's column glides to where it now sits. `smooth` spring. | Each tap starts from where everything is drawn. | Instant |
| **Selected item** | Where you are | One mark, slid and scaled from the old item to the new. `snappy` spring. | Retargets from where it is. Not when the shape of the navigation changed, not to or from Shoot. | Instant |
| **Sheet** (detents on a phone, form sheet on an iPad) | On top, for a moment | Comes up from below the window and leaves the same way, on the `sheet` spring in code. Under a finger it follows 1:1; past its largest detent, and below its smallest when it cannot be dismissed, it resists (rubber band, constant 0.55). On release the speed of the last 80 ms picks the detent or a dismissal and carries on into the spring. The scrim's opacity goes with the sheet's way down from its lowest detent. A sheet under another steps back to 0.94 under a 30 % veil (`smooth`). | A finger catches it anywhere on its way; Escape or a tap mid-entry turns it around. | 150 ms fade, in place |
| **Sheet page** | Deeper, inside the sheet | Slides in from the right, `page` spring, as a transition. | Back mid-way turns it around. | Fade |
| **Action sheet** | A choice, from below | Comes up on the `page` spring; scrim fades with it. Leaves in 200 ms `--ease-out`. | A tap mid-way turns it around. | Fade |
| **Menu** | Out of its trigger | Grows from 0.9 at the trigger's corner (its transform origin) with a fade, `snappy`. Rows come with it: no stagger. Leaves in 150 ms to 0.96. | A CSS animation: reopened mid-exit it starts again from 0.9, a short way. | Fade |
| **Notice** (the last edit, with Undo) | It landed | Comes up 14 px with a fade (`smooth`), leaves 10 px down in 200 ms. One pill, never a pile: a new edit changes it in place, the words swap (6 px, a fade) and the pill takes its new width from the old (scaleX, its contents scaled back so nothing stretches). The same words again: a 4 % pulse (`snappy`). | A new edit retargets the pill as it is. | Fade; the words just change |
| **Toggle** | On, off | The knob slides, `snappy`; pressed it gives to 0.92. The track's colour follows in 300 ms. | A second tap turns it from where it is. | Instant |
| **Segmented** | The pick | The thumb slides, `snappy`; pressed on the picked option it gives to 0.96. | Retargets. | Instant |

## What never moves

- Width, height, top, left, margins, padding: layout changes once, at once.
- The capture path: the take screen's rail, start button, keypad and chips; any change of page to
  or from Shoot; the sidebar beside it.
- A change of page beside the sidebar's own motion: the sidebar eases only after its button.
- Focus rings, text, colour tokens, the large title (it follows the scroll, frame for frame).
- First paint: the app is there when it is drawn.

## How a page change works

`+layout.svelte` asks `navDirection` (`src/lib/ios/direction.ts`) which way the routes move and
`pageMotion` what that becomes now (reduced, the capture path, a system swipe). Before the page
changes, `leave` (`components/ios/pageStage.ts`) clones the page's stage (`data-page-stage`, in
NavShell) into a still, inert, `aria-hidden` picture beside it. Once the new page is in,
`arrive` moves the two with Web Animations. The navigation and the notice sit outside the stage
and stay put. A part both pages hold in the same place (`data-page-pin`: the Slates list beside
the slate on a wide screen) moves back by as much as its page, so it stays still while the rest
pushes or pops. `html[data-nav]` names the move while it is in flight (tests wait on it). The picture never outlives 1.5 s, whatever happens.

View Transitions were the first try: a new one cuts the one in flight short, the page is frozen
while one starts, and WebKit left one unfinished when the sidebar changed width under it.

## What only a real iPad proves

WebKit in Playwright checks end states, timings and that nothing blocks (`e2e/shell.spec.ts`,
"motion"). Only an iPad shows whether the sheet's drag feels 1:1 at 120 Hz, whether a flick
carries on believably, whether the edge-swipe guard catches iPadOS's own back gesture, and whether
anything stutters while a heavy page mounts.

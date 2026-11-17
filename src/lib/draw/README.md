# draw

The drawing canvas: drawing on a photo (#86) and a slate's setup diagram (#87). Pure modules with
their tests beside them, the flattener at the edge. The components are `src/lib/components/draw/`;
the strings `src/lib/i18n/en/draw.ts`.

## Modules

| module | pure | what it does |
|---|---|---|
| `drawing.ts` | yes | The model: strokes, text, dimension lines with a typed length, symbols placed and turned. Inks, sizes per drawing, every change as a new list. |
| `geometry.ts` | yes | Hit testing, handles, the parts of a dimension line and a symbol, the paint order, fitting a drawing to a box, the flatten size. |
| `gesture.ts` | yes | Pointer events to a gesture, and on the way up the change to save or the words to ask for. |
| `paint.ts` | yes | Paints the shapes on a 2D context, in paint order. The context is handed in. |
| `markup.ts` | yes | A photo's drawing (`markup` table), its key, which file is the photo and which the annotated copy, the flatten plan, the files to hand over. |
| `optics.ts` | yes | A lens's squeeze, the horizontal field of view from focal length and sensor width, the wedge in front of a camera symbol. |
| `diagram.ts` | yes | A slate's setup diagram (`diagram` table): the slate's cameras with lens and view, where they place themselves, their captions. |
| `flatten.ts` | no | Decodes the photo, paints the drawing over it, encodes a JPEG. Paints a setup diagram into a PNG. |
| `flattener.ts` | no | Keeps each photo's annotated copy in step with its drawing, through the store. |

## How a drawing is kept

- A photo's drawing is a row of the `markup` table, under its still, kept on the device (store
  README, Tables). The photo's file is never touched.
- Shapes are in the drawing's units: a photo's pixels. The screen fits them to the room it has;
  the flattened copy paints them at the photo's size.
- Each change is one edit through `app.edit`: saved, and one Undo. The drawing's own Undo and Redo
  only take back what was done in it.
- After a change, the flattener makes the annotated copy: a second file of the still, `variant:
  'annotated'`, with the key of the drawing it was made from. It goes to Flow PT as
  `onset_<still>_<blob>-annotated.jpg` (fpt README) and into the wrap package as
  `<slate>-<camera>-reference-<n>-annotated.jpg` beside the photo (`$lib/export/wrapPackage`).

## How a setup diagram is kept

- One per slate, a row of the `diagram` table under the slate, kept on the device. A sheet of 1600
  by 1200 units; not to scale: distances are measurements typed on it.
- When it opens, each camera setup of the slate (those on its takes, or every setup while it has
  none) is a camera symbol: its letter, its lens, its focal length and field of view. One not
  placed yet stands along the foot, facing up; the first change keeps it where it is. It cannot be
  deleted: it would place itself again.
- The lens and body are the latest take's, else the setup's. A prime gives its focal length; a
  zoom takes the focal length of the slate's latest take on that camera that has one. The field of
  view is 2 atan(w s / 2f): w the body's sensor width (gear library), s the lens's anamorphic
  squeeze (1 for spherical glass). With no width or no focal length, no wedge.
- The wrap package holds it as `diagrams/<slate>-setup-diagram.png`, drawn as the zip is written,
  whether the photos go or not. Flow PT gets nothing of it yet.

## Decisions

Made by Claude. Kevin can overrule any of them.

1. **The screen draws SVG, the copy draws canvas, from the same geometry.** One set of parts and
   one paint order (`paintOrder`): strokes, dimension lines, symbols, text on top, so words are
   never under a line.
2. **The copy is made when the drawing closes, not per stroke.** A photo whose drawing is open is
   held. After an undo from anywhere, the flattener makes it again.
3. **A copy no longer matching its drawing is dropped while unsent.** A sent one stays on Flow PT
   beside the new one (store decision 26).
4. **A measurement on the copy shows as typed,** whatever the units setting. On screen it follows
   the setting: metres stored, feet and inches shown.
5. **Lengths are typed, never measured.** Measuring with the device is #88, native only.
6. **Once the Pencil has drawn, a finger draws nothing** with a drawing tool on: it is a palm. Move
   still takes a finger. A second finger cancels the line under way.
7. **Five inks:** red, yellow, blue, white, black. Text has a ring of black, or white on black ink,
   so it reads on any photo.
8. **No zoom yet.** The photo fits the screen. Pinch to zoom is a later step.
9. **The copy is a JPEG at 90 %, at the photo's size,** smaller only past 16.7 million pixels, the
   largest canvas iPadOS Safari paints.
10. **A setup diagram's symbols are four:** camera, subject, light, marker, as the issue names them.
11. **A camera's field of view is a wedge 540 units long,** a third of the sheet: the angle is what
    it shows, not the reach.
12. **The diagram opens from its own section on the slate's page,** under the takes.
13. **The diagram image is made when the wrap package is written,** from the gear as it is then,
    so a lens fixed later shows. It is not kept as a file.

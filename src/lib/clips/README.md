# clips

The import of the DIT's clips (#109): the day's ALE or CSV from Silverstack, Pomfort or a camera
report app fills clip name, camera roll, timecode in and timecode out on the day's takes, and the
lens, a zoom's focal length, T-stop, ISO, white balance, shutter angle and frame rate where the
file has them. Read in the browser from a file, offline, no library. Reached from the Slates list (Import Clips), the page
is `/slates/import` (`components/clips/`). Pure modules, each with its test beside it.

## Modules

| module | what it does |
|---|---|
| `ale.ts` | `isAle`, `parseAle`: the Heading block, the column names and the Data rows. Any line end. |
| `sheet.ts` | `readSheet`: an ALE or a CSV (the model's `csv.ts`) as one table. A CSV's header is the first row with a known column, else the first of two cells or more. |
| `columns.ts` | `COLUMN_NAMES`, `autoMap`, `setColumn`: which column is the clip name, roll, camera letter, timecode in and out, duration and timecode rate. |
| `timecode.ts` | `readRate`, `guessRate`, `tidyTimecode`, `clockSeconds`, `lastFrame`, `localSeconds`. Builds on `$lib/export/timecode`. |
| `values.ts` | `readTakeValue`: a T-stop, ISO, white balance, shutter angle (or speed), frame rate or focal length cell as a take value. |
| `clips.ts` | `readClips`: the clips through the column map, with what could not be read. `clipNameOf`, `cameraOf`. |
| `lens.ts` | `lensKey`, `matchLens`: the lens a clip names, in the project's gear. |
| `match.ts` | `matchClips`, `withPicks`, `matchCounts`: the take of each clip. |
| `plan.ts` | `planFill`, `lastFilled`, `clipImportRecord`: what each match fills, updates or keeps, as one patch. |
| `preview.ts` | `previewClips`: all of the above from the file, the map, the picks and the day. The page shows it. |
| `text.ts` | The words the page shows. |
| `apply.ts` | Not pure: `applyClipImport` writes the patch and the `clipImport` entry as one undo entry. |
| `testFiles.ts` | Silverstack, ARRI and Avid shaped ALE files for the tests. |

## Decided (Kevin, 2026-11-17, #109)

- ALE and CSV. No XLSX.
- A clip matches a take by time of day timecode against the take's Start and End stamps, then by
  camera roll and order. Without time of day timecode, by camera roll, then by order against the
  takes on that camera. The preview shows each match and the clips left over; the person fixes
  any match before Fill.
- The first import fills only empty fields, never a typed value, in one undo.
- A re-import of the same day updates the fields an import filled and nobody edited since. A
  field a person typed or edited is never touched. The preview lists what changes.
- A field an import filled and a person then cleared counts as edited: a re-import leaves it
  empty. An empty field no import filled is filled.
- Besides clip name, roll and timecode, each only where empty: ISO, white balance, shutter angle,
  frame rate and T-stop when the file carries them; the lens, matched to the project's gear by
  model or name, trimmed and case-blind; a zoom's focal length when the file has it. A lens with
  no match is left empty and the preview says so, with the name read. Two lenses that match:
  left empty, both shown. A lens is never created.

Kevin's own answers on QA (2026-11-17): the entry on the Slates list, an import never clears, the
file extension stripped, the guessed rate shown, the takes' typed rolls ignored in the match.

## Decisions

Made by Claude where the issue is silent. Kevin can overrule any of them.

1. **Reached from the Slates list,** under All Takes. The gear import lives with the gear it fills
   (`/gear/import`); the takes live under Slates, and the import fills a day's takes. Wrap is the
   day's summary and its export.
2. **"Edited since" is a value test, as for live templates:** a field counts as filled by an import
   while it holds what the latest import of the day wrote there (`sameValue`). Retyping the same
   value is no edit (model decision 22). The record of what each import wrote is the
   `clipImport` table, kept on the device (store decision 28). A field that record names and the
   take holds empty was cleared by a person: kept empty. An undone import takes its record back,
   so what it filled reads as never filled.
3. **The lens key** is the name without case, accents, spaces or punctuation: "Cooke S4/i 32mm"
   and "cooke s4i 32 MM" are one lens. A lens answers to its model, and to its make and model.
   The serial number (ARRI's Lens_sn) is not used to tell two lenses apart.
4. **A focal length fills only on a zoom:** the take's lens once imported (the lens it holds, or
   the one the import fills) must be a zoom in the gear. A prime's focal length is the lens's
   (model decision 30); an unknown lens gets none.
5. **An import never clears.** A take an earlier import filled and the new file does not match
   keeps its values.
6. **One clip per take.** A take is one camera's take (model decision 1). Picking a take for a clip
   leaves over the clip that had it.
7. **Time of day:** the clip's timecode is read as wall clock time in the device's time zone. A take
   is widened by 15 s each side, for a camera that rolls before Start or runs past End. Where
   several clips overlap a take, the take goes to the clip that covers most of it; clips that
   know their camera are matched before those that do not. Across midnight, a clip moves by a day
   when that is nearer.
8. **Roll and order:** per camera, clips sort by roll, then timecode (or clip name when a clip has
   no timecode), and pair in order with the takes left over, in the order shot (by Start, takes
   never started last). The clips matched by time cut both lists into gaps; pairing stays inside a
   gap. A roll a take holds is not used: copy of last carries it, so it is often stale.
9. **The camera letter** comes from the Camera or Camera_index column, else from the letters the
   roll starts with (A001 is A), else from the clip name. A letter no take of the day has tells
   nothing. On a day with one camera or none, all clips and takes are one group.
10. **ALE End is the frame after the last** (ARRI, Avid and Silverstack all write it so); Timecode out
    is the last frame, as our ALE export reads it. When the duration says End is the last frame
    itself, it is read so. With no End, the duration gives it.
11. **The timecode rate** is the row's FPS, else the ALE heading's FPS. A file with neither is read at
    the smallest of 24, 25, 30, 50 and 60 above every frame number, and the preview says so.
12. **The clip name loses a camera file extension** (.mov, .mxf, .mp4, .r3d, .braw, .ari, .crm and
    a few more): Avid keeps it on the name, cameras and plates do not.
13. **Drop frame** is kept where the file writes `;` before the frames at 29.97 or 59.94.
14. **A camera value of 0, a dash or an empty cell is no value.** Cameras write 0 where they know
    nothing (Silverstack's F-Stop). A value that does not read, or that the catalogue refuses, is
    left out and listed under the matches.
15. **A shutter speed becomes an angle:** 360° × frame rate × the time the shutter is open, at the
    clip's frame rate, else its timecode rate, to a tenth of a degree. Silverstack writes "1/50s".
16. **A letter or unit around a number is dropped:** "T2.8", "f/4", "5600K", "32mm", "172.8°". A
    header may end with its unit too: "Focal length (mm)".

## What a real iPad must still prove

- That the Files picker offers `.ale` files with the input's `accept` list (`.ale,.csv,.tsv,.txt`
  and the text types). If it greys them out, drop `accept`.
- That a camera's time of day timecode and the iPad's clock agree within the 15 s slack on a real
  set.

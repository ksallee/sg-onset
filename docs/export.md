# Export

What a data wrangler hands over at wrap. Four files and the photos, from the records on the
device. The code is `src/lib/export/`. Every module is pure: records and options in, text out. The
caller passes the time, the time zone and the labels.

## Modules

| module | what it does |
|---|---|
| `selection.ts` | `flatten`: one row per take (one camera's take) with the slate, day, lighting setup, camera setup, camera and lens on it. Filters, order. |
| `format.ts` | Numbers, signed angles, feet and inches, metres, CRIF dates and times. |
| `timecode.ts` | Timecode to frames and back. Drop frame at 29.97 and 59.94. |
| `uuid.ts` | SHA-1 and name-based UUIDs (version 5), for CRIF's per-camera slate id. |
| `csvWrite.ts` | RFC 4180 cells, CRLF, byte order mark, formula guard. |
| `crif.ts` | VES camera report CSV, CRIF v1.1, and the check of its required columns. |
| `plainCsv.ts` | Every catalogue field as a column, for spreadsheets. |
| `ale.ts` | Avid Log Exchange for editorial. |
| `json.ts` | Versioned lossless JSON, and its reader. |
| `dayReport.ts` | The data of a printed camera report for one day. No rendering. |
| `naming.ts` | Safe file names. |
| `wrapPackage.ts` | What a wrap package holds and where, as data. No zipping. |

## Selection

`flatten(input, filters)` reads the records of one project as the store returns them.

- One row per take. A take is one camera's take (model decision 1), so take 3 on A and on B are two rows.
- The camera and lens are the ones the take holds (model decision 2). They are not filled from the
  camera setup: the setup may hold another lens by now.
- Focal length: a prime's own wins over the take's (model decision 30). A zoom gives what was
  typed, start and end.
- Order: shoot day (date, then number), slate, take number, camera letter. Slates and takes sort
  as a person counts: 9 before 10, 42A before 42B.
- Filters: shoot days, a slate range (inclusive, same order), circled only, leave out no good.
- A take whose slate or day is not in the input is left out.

## CRIF: VES camera report

`exportCrif(rows, { timeZone, now })`. One row per take. The spec is the VES Camera Report
Interchange Format, field table v1.1 (`research/ontologies/crif/spec.txt`). File:
`<project>_<day>_camera-report.csv`.

How it is written:

- Header: the spec's column names, in the spec's order, every one present. Our columns follow
  (option `extras`, on by default).
- Strings in quotes, a quote doubled. Numbers bare: CRIF Version, Unique Slate ID, Shoot Day.
- Lines end in CRLF. A line break inside a value is a vertical tab. Set Media values are split by
  vertical tabs.
- Dates and times are local, in the `timeZone` given: `YYYY/MM/DD HH:MM:SS`, 24 hour.
- Focus and lens height in feet and inches, inches to the hundredth: `6' 3.5"`. Infinity is
  `Infinity`. Option `lengths: 'metric'` writes `1.918 m`; the spec does not allow it.
- No end value means the value did not change (model README). The end column then repeats the start.
- Empty means we do not hold it. Nothing is made up.
- Camera Letter is a slate column in CRIF, so a CRIF slate is one slate on one camera. Rows are
  grouped by slate, then camera, then take. SlatesUUID is a version 5 UUID of our slate UUID and the
  camera setup UUID: the same on every export. Unique Slate ID counts those groups 1, 2, 3 in the
  file, unless the caller passes its own numbers.

| CRIF column | Req | From |
|---|---|---|
| Job | | `project.name` |
| CRIF Version | yes | `1.1` |
| Unique Slate ID | yes | count of slate and camera in the file, or `slateNumbers` |
| SlatesUUID | yes | UUID v5 of `slate.id` and `take.cameraSetupId` |
| Slate | yes | `slate.slateUID` |
| Camera Letter | yes | `cameraSetup.cameraLabel` |
| VFX Shot | | `slate.vfxShots`, joined with ", " |
| Scene Number | yes | `slate.sceneNumber` |
| Shoot Day | yes | `shootDay.shootDay` |
| Shoot Timestamp | yes | earliest `take.startedAt` of the slate on that camera, local |
| Shot Description | yes | `slate.description` |
| Unit | yes | `shootDay.cameraUnit` |
| Element Type | | `slate.elementType` |
| VFX Work | yes | none |
| Notes | | `slate.notes` |
| Set Media | yes | `lightingSetup.referenceBalls` Balls, `slate.cleanPlate` Clean Plate, `lightingSetup.hdri` HDRI, any photo Photos, `slate.witnessCamera` Witness Cam; ours: `slate.lidar` Lidar, `lightingSetup.colourChart` Colour Chart |
| Set Location | yes | `shootDay.location` |
| Set Location Position | | none |
| Script Location | yes | none |
| Script Time | | `slate.scriptTime`: Day, Night, Dusk, Dawn, Magic Hr |
| Interior Exterior | | `slate.interiorExterior`: Int, Ext |
| Wrangler | yes | `shootDay.wrangler` |
| Stereo Rig Orientation, Stereo Thru Cam Eye | stereo | none |
| Camera Head | yes | none |
| Camera Head Right | stereo | none |
| Camera Move Description | | none |
| Camera Body | yes | `camera.cameraMake` |
| Camera Body Right | stereo | none |
| Camera Mount, Characters, Props | | none |
| Film Stock | yes | none |
| ASA | yes | `take.isoSpeed` |
| HDRI Filename | | `lightingSetup.hdriFilename` |
| White Balance | | `take.whiteBalance` with K: `5600K` |
| Creation Date | | the export time, local |
| Modification Date | | none |
| Tk Take | yes | `take.take` |
| Tk TakesUUID | yes | `take.id` |
| Tk Filter | | `take.filter` |
| Tk Focal Length, End | yes | focal length in mm, prime's own first |
| Tk FPS | yes | `take.captureFrameRate`: 24, 23.976 |
| Tk Lens Focus, End | yes | `take.focusDistance`, `focusDistanceEnd`, feet and inches |
| Tk Lens Height, End | | `take.lensHeight`, `lensHeightEnd`, feet and inches |
| Tk Lens ID | | `lens.lensModel` |
| Tk Lens Serial Num | yes | `lens.lensSerialNumber` |
| Tk Lens Serial Num Right | stereo | none |
| Tk Notes | | `take.notes` |
| Tk Roll | yes | `take.cameraRoll` |
| Tk Shutter Angle | yes | `take.shutterAngle` |
| Tk Start Time Of Take | | `take.startedAt`, local `HH:MM:SS` |
| Tk Stereo Convergence, Tk Stereo IA | | none |
| Tk Stop | yes | `take.tStop` as `T2.8` |
| Tk Camera Tilt, End | | `take.tilt`, `tiltEnd`, signed: `+10` |
| Tk Camera Dutch, End | | `take.roll`, `rollEnd`, signed |
| Tk Clip Num | | `take.clipName` |
| Tk Timecode | | `take.timecodeStart` |
| Tk Creation Date, Tk Modification Date | | none |

Our columns, after the spec's: Shoot Date (`shootDay.shootDate`), Setup (`slate.setup`), Lighting
Setup (`lightingSetup.label`), Camera Model, Camera Serial Num, Tk End Time Of Take
(`take.endedAt`), Tk Circled, Tk No Good (`Yes` or empty), Tk Timecode End, Tk Lens Make, Tk
Anamorphic Squeeze, Tk Subject Distance and End, Tk Photos (the count).

`crifMissing(record)` lists the required columns a row leaves empty. `CRIF_NEVER_FILLED` names the
four we have no field for: VFX Work, Script Location, Camera Head, Film Stock. `exportCrif` leaves
those out of its per take list, so what remains is what the wrangler can still fill.

Lost in CRIF:

- Typed length text. Lengths are converted, inches to the hundredth.
- The exact frame rate: 24000/1001 is written 23.976.
- ISO, white balance and camera body are slate columns in CRIF but ours are per take. Each row
  carries its own take's value. A reader that keeps the first row of a slate keeps the first take's.
- Seconds are the finest time. Times are local, with no zone in the file.
- Sensor size and resolution, colour chart and lidar outside Set Media, template links, gear ids.
- Photos only as the Photos flag and a count.

## Plain CSV: every field

`plainCsv(rows, { labels, header, units, lengths, bom, guardFormulas })`. File:
`<project>_<day>_all-fields.csv`. For a spreadsheet.

- A column for every catalogue field, and an end column right after each field that has one.
  Scopes in the order project, shoot day, slate, lighting setup, camera setup, take, camera, lens.
- Headers: the app's long labels, the model keys (`take.focalLength`), or both rows. Labels are
  passed in from `$lib/i18n/modelText` (`fieldLabel`, `optionLabel`, `unitLabel`, scope names).
  A label two fields share gets its scope in front: "Lens: Focal length".
- Units: inline (`35 mm`, `12°`, `23.976 fps`, lengths as the app shows them, typed text kept), or
  bare numbers with a unit column after each field that has a unit. Lengths there are metres to
  the millimetre, or decimal feet to four places.
- Enums show their label, booleans yes or no, lists joined with ", ", refs as the UUID.
- RFC 4180 quoting, CRLF. Option `bom` for Excel. Formula guard on by default: a cell starting with
  `=`, `+`, `-`, `@`, tab or CR gets a `'` in front, unless it is a number with at most a short
  unit (`-5`, `-5°`).

Lost: the take's focal length column shows the focal length shot at, so a value left on a take
that ran a prime does not show. Record ids other than refs. Photos. Labels are in the app's
language.

## ALE: editorial

`exportAle(rows, { fps, videoFormat, dropFrame, withoutTimecode, lengths })`. File:
`<project>_<day>_editorial.ale`.

```
Heading
FIELD_DELIM	TABS
VIDEO_FORMAT	1080
FPS	23.976

Column
Name	Tracks	Start	End	…

Data
A001C003	V	14:39:39:09	14:39:59:11	…
```

- Tabs between values, LF line ends, as ARRI's camera ALE. A tab or line break inside a value
  becomes a space.
- FPS: the rate given, else the commonest take frame rate, else 24 with a warning. 1000/1001 rates
  are written 23.976, 29.97, 59.94. Timecode counts the whole base: 24 for 23.976.
- Drop frame: `dropFrame` at 29.97 or 59.94 writes `HH:MM:SS;FF`. At any other rate it is ignored
  with a warning.
- End is the frame after the last one, as in the ARRI, Avid and Silverstack files (Start +
  Duration). Our `timecodeEnd` is the last frame, so End adds one.
- Without timecode: Avid makes no clip from a row with no Start and End. Such takes are left out
  and listed (`skipped`, warning `noTimecode`). `withoutTimecode: 'keep'` writes them with Start,
  End and Duration empty, for a merge by name only. A timecode that does not read at the rate is
  left out too (`badTimecode`).

| ALE column | From |
|---|---|
| Name | `take.clipName`; without one `<slate>-<take>-<camera>` |
| Tracks | `V` |
| Start, End, Duration | `take.timecodeStart`, `timecodeEnd` + 1 frame |
| Tape | `take.clipName` |
| Scene | `slate.sceneNumber` |
| Take | `take.take` |
| Camera | camera letter |
| Camroll | `take.cameraRoll` |
| Shoot Date | `shootDay.shootDate` as YYYYMMDD |
| FPS | the heading rate |
| Circled Take | `Yes` or empty |
| Slate, Description, VFX Shots | `slate.slateUID`, `description`, `vfxShots` (ours) |
| Comments | `take.notes` |
| Lens, Lens_sn | `lens.lensModel`, `lensSerialNumber` |
| Focal Length, End | focal length in mm (ours) |
| T-Stop | `take.tStop` (ours) |
| Focus Distance, Lens Height, End | metres, or decimal feet (ours) |
| Tilt, Dutch, End | degrees (ours) |
| Sensor Fps | `take.captureFrameRate` |
| Shutter_angle | `take.shutterAngle` |
| ASA | `take.isoSpeed` |
| Whitepoint | `take.whiteBalance` |
| Filter | `take.filter` (ours) |

Lost: takes without timecode by default; lighting, flags, location, wrangler, gear make and serial
of the body, sensor; typed lengths; one FPS for the whole file.

## JSON: lossless

`exportJson(input, { now, filters })`, read back with `readExportJson(text)`. File:
`<project>_<day>_data.json`.

```json
{
	"format": "sg-onset-export",
	"formatVersion": 1,
	"exportedAt": "2026-11-11T02:00:00.000Z",
	"filters": {},
	"project": {},
	"shootDays": [], "lightingSetups": [], "cameraSetups": [], "cameras": [], "lenses": [],
	"slates": [], "takes": [], "stills": []
}
```

- Records exactly as stored: model keys (OMC and OpenTrackIO names), stored units, lengths with
  their typed text, frame rates as `{ num, denom }`, timestamps in UTC.
- Keys in a stable order: `id`, parent and template links, catalogue order (end key after its
  start), then the rest alphabetical. Lists in export order; gear by id. The same selection gives
  the same text.
- Slates: every slate of the picked days in the slate range, with or without takes. Takes: those
  the filters keep. Gear and lighting setups: those the kept records point at. Photos: their
  records, not their files.
- `readExportJson` refuses text that is not JSON, not ours, newer than the reader, or missing a
  list or an id. It does not check each value: run the model's `validateRecord` for that.
- `formatVersion` goes up when an old reader would misread the new file.

Not in it: gear no kept record points at, templates, the sync queue, Flow PT ids, file bytes.

## Day report

`dayReport(input, shootDayId, filters)` gives what a printed camera report shows, for a UI to
render:

- `header`: project, date, day number, unit, location, wrangler.
- `slates`: one block per slate in order, with its lighting setup, the camera setups its takes
  used (letter, body, lenses run), the takes and the block's totals.
- `totals`: slates, takes, circled, no good, photos.
- `warnings`, per take: `noEndTime`, `noFocalLength` (no prime and none typed),
  `zoomNoFocalLength` (a zoom and none typed).

## File names and the wrap package

- Names are `<project>_<day>_<kind>.<ext>`. Kinds: `camera-report.csv`, `all-fields.csv`,
  `editorial.ale`, `data.json`, `manifest.json`.
- Day part: `2026-11-10-day03`; several days `2026-11-10-to-2026-11-11`; none `all-days`.
- `slug`: accents dropped, case kept; anything but ASCII letters, digits, dot and hyphen becomes
  one hyphen, underscore included; no hyphen or dot at either end; 60 characters at most; CON,
  NUL, COM1 and the like get `-x`; nothing left gives a fallback.
- Photos follow CRIF: `<slate>-<camera>-reference-<n>.<ext>`, whitespace removed, numbered per
  slate and camera in take order, then the order taken. The extension comes from the file type.

`wrapPlan(rows, { project, shootDays, blobs })` lists every file of the package with its path:

```
<project>_<day>/
  <project>_<day>_camera-report.csv
  <project>_<day>_all-fields.csv
  <project>_<day>_editorial.ale
  <project>_<day>_data.json
  photos/<slate>/take-<take>/<slate>-<camera>-reference-<n>.<ext>
```

A photo entry holds the blob id to read with `store.blob(id)`. A photo whose bytes were freed after
Flow PT verified them is marked `pruned`. A photo with no file is listed in `missingPhotos`. The UI
zips with the backup's writer (`client-zip`).

## Proposed catalogue changes

The export holds these mappings itself, since the catalogue is shared:

- CRIF names for fields that have none: `shootDay.shootDate` Shoot Date, `slate.setup` Setup,
  `lightingSetup.label` Lighting Setup, `camera.cameraModel` Camera Model,
  `camera.cameraSerialNumber` Camera Serial Num, `take.endedAt` Tk End Time Of Take,
  `take.circleTake` Tk Circled, `take.noGood` Tk No Good, `take.timecodeEnd` Tk Timecode End,
  `lens.lensMake` Tk Lens Make, `lens.anamorphicSqueeze` Tk Anamorphic Squeeze,
  `take.distanceToSubject` Tk Subject Distance (and End). All ours, not the spec's.
- `slate.lidar` and `lightingSetup.colourChart`: `crif: 'Set Media'`, values Lidar and Colour Chart.
- `take.notes`: ALE Comments. `slate.description`: Silverstack ALE Description.
- `take.shutterAngle`: drop Silverstack `Shutter`. In the Silverstack sample it holds a shutter
  speed (`1/50s`), not an angle. ARRI `Shutter_angle` is right.
- `take.filter`: ARRI `Nd_filterdensity` is a density number, not free text. Mark it as lossy or drop it.
- `take.clipName` as CRIF Tk Clip Num: the spec means a clip number within a take, for continuous
  shooting, and marks it TODO. Kept, but worth a look.

## Open questions for a wrangler or a VFX editor

1. Which tool reads the CRIF file now? Does it want CRLF or CR, a quoted header, `T2.8` or `2.8`?
2. Feet and inches as `6' 3.5"`, or decimal feet, or metres?
3. Should Unique Slate ID stay the same across exports? That needs a number stored per slate.
4. A slate on two cameras: two CRIF slates, as written here, or one?
5. ALE: does editorial match on Name, Tape or Source File? We hold the clip name, not the file name
   with its extension.
6. Is our timecode out the last frame, as the model says, or one past? The ALE End depends on it.
7. What does Silverstack write in Circled Take for a circled take?
8. Is an ALE without timecode of any use, for a merge by name?
9. Which time zone: the iPad's, or the production's?
10. Photos: one folder per slate and take, or flat with the CRIF names?
11. Plain CSV: units in the cells or in columns by default? A byte order mark by default?

# model

The data model. Pure modules: no I/O, no storage, no clock, no id generator. The caller passes
ids and times in. Each module has its test beside it.

## Modules

| module | what it does |
|---|---|
| `catalogue.ts` | `FIELDS`: every field as data. Scope, key, value type, stored unit, label message key, start/end flag, range, and what CRIF, OMC, OpenTrackIO, ALE, USD and VES call it. |
| `types.ts` | Record types per scope, derived from the catalogue. |
| `rational.ts` | `{ num, denom }` for frame rates and squeeze. Parse and format. |
| `length.ts` | Metres stored, feet and inches typed and shown. Keeps what was typed. |
| `fieldText.ts` | Text to stored value and back, for any catalogue field. |
| `validate.ts` | Checks a value or a record against the catalogue. Returns message keys. |
| `value.ts` | `sameValue`: are two stored values the same value. |
| `patch.ts` | A patch is a list of field changes with before and after. `invertPatch` is undo. |
| `template.ts` | Create from a template, preview a template edit, apply it. |
| `bulkEdit.ts` | Set one field on many records, with the undo patch. |
| `take.ts` | Next take number, new take as a copy of the last, focal length of a take. |
| `csv.ts` | CSV text to rows. |
| `gearImport.ts` | Cameras and lenses from CSV, with a report per row. |

## How values are stored

- Units are OpenTrackIO's: metres, millimetres, degrees, hertz as a rational. The catalogue
  names the unit of each field.
- A length is `{ m, entered? }`. `m` is metres, rounded to the micrometre, or `'inf'`. `entered`
  is the text the user typed and the system it was typed in. Shown in that system, the text comes
  back as typed. Shown in the other, it is converted: nearest inch, or millimetre.
- A frame rate is `{ num, denom }` in lowest terms. 23.976 is 24000/1001.
- Other numbers are plain numbers in the catalogue's unit. They show in their shortest form.
- A value that changes over a take has a start under its key and an end under `<key>End`:
  `tilt`, `tiltEnd`. No end means it did not change.
- A timestamp is an ISO 8601 string in UTC. A date is `YYYY-MM-DD`. Timecode is `HH:MM:SS:FF`.
- A missing value is an absent key. `undefined` in a patch clears a field.

## Message keys

- Labels: `field.<scope>.<key>`. Enum options: `field.<scope>.<key>.<option>`.
- Validation: `validation.required`, `.type`, `.integer`, `.above`, `.min`, `.max`, `.infinity`,
  `.unit`, `.rational`, `.option`, `.date`, `.timestamp`, `.timecode`, `.endBeforeStart`,
  `.focalRange`. Parameters are listed in `validate.ts`.
- Import: `import.noHeader`, `.missingModel`, `.badValue`, `.incompleteSize`, `.noFocalLength`,
  `.focalConflict`.

No message file yet: the UI owns it.

## Decisions

Made by Claude where the brief and the crosswalk are silent. Kevin can overrule any of them.

### Shape

1. **A take is one camera's take.** Take 3 on A and take 3 on B are two records with the same
   slate and number. Reason: lens, height and focus differ per camera, and CRIF has one row per
   camera too.
2. **A take holds its own `cameraId` and `lensId`.** The camera setup is where a new take gets
   them. Reason: swapping the lens on camera A must not rewrite the takes already shot. A saved
   value never reverts.
3. **Camera setups, lighting setups, cameras and lenses belong to the project.** Slates belong to
   a shoot day. Reason: A camera and the gear list outlive a day.
4. **Records are flat.** Start and end are two keys, not a nested pair. Reason: templates, bulk
   edit and patches all work per key.
5. **Stills are their own records with a `takeId`.** Reason: a photo syncs alone, and a take with
   forty photos stays small.
6. **Sensor size and resolution sit on the camera body.** A body shot in two sensor modes is two
   body records for now. Reason: simplest thing that works; a mode list can come with the sensor
   database.
7. **Squeeze sits on the lens.** OpenTrackIO puts it under `static.camera`, OMC under the lens.
   Reason: it is a property of the glass.
8. **A lens has `focalLength` and, for a zoom, `focalLengthMax`.** One focal length, or a max equal
   to it, is a prime.
9. **`hdri`, `referenceBalls`, `colourChart` are flags on the lighting setup; `lidar`,
   `witnessCamera`, `cleanPlate` on the slate.** Reason: VES scopes the first three to the
   lighting setup; CRIF puts the rest on the slate.

### Names

10. **`captureFrameRate`, not `captureRate`.** OMC and OpenTrackIO differ here. The type is
    OpenTrackIO's, so its name won.
11. **`focalLength` and `focusDistance`** as the crosswalk recommends, though OpenTrackIO says
    `nominalFocalLength` and OMC says `focusPosition`.
12. **Where neither standard has a name, the CRIF name in camelCase:** `lensHeight`, `filter`,
    `interiorExterior`, `scriptTime`, `elementType`, `wrangler`. Ours alone: `distanceToSubject`,
    `noGood`, `clipName`, `startedAt`, `endedAt`, `setup`, `take`, `focalLengthMax`, `order`.
13. **One `tStop` field.** No separate `fStop`. Reason: CRIF has one stop column and cine lenses
    are marked in T.
14. **One `filter` text field** for ND and filters together, as CRIF does.
15. **ISO and white balance are per take,** though CRIF has them on the slate. Reason: they change
    between takes, and copy-of-last carries them anyway.

### Units and typing

16. **A bare number in a length field is feet in imperial, metres in metric.**
17. **Feet and inches show to the nearest inch** when converted. Typed text is never rounded.
18. **Infinity is the string `'inf'`.** Only `focusDistance` takes it. Reason: `Infinity` does not
    survive JSON.
19. **Only lengths keep the typed text.** mm, degrees, kelvin and stops are stored as typed
    already; "+10" shows as "10" and "2.80" as "2.8".
20. **A frame rate does not keep the typed text.** "23.98" is stored as 24000/1001 and shows as
    "23.976". Decimals near 24, 30, 48, 60, 96, 120 and 240 × 1000/1001 snap; all others stay exact.
21. **Tilt is −90 to 90, roll −180 to 180, shutter 0 to 360.** Plus is up and clockwise, as CRIF.

### Templates

22. **Two lengths are the same value when their metres match.** 6' and 6 ft are one value, so
    retyping the same height does not count as a hand change.
23. **Mode `all` updates the fields the edit changed,** on every linked record. It does not reset
    fields the edit left alone.
24. **A field dropped from a template is cleared only where it still holds the old value,** in both
    modes. Reason: dropping a field should never erase what someone typed.
25. **A field added to a template fills records that have nothing there.** A record that already
    has a value there counts as hand-typed.
26. **Only `templateId` links a record to a template.** A copy of the last take keeps the link.

### Takes

27. **Next take number,** first match wins: nothing gives "1"; a trailing number goes up by one
    and keeps leading zeros ("A7" → "A8", "007" → "008"); letters right after a number step
    ("12b" → "12c", "12z" → "12aa"); anything else gets a "2" ("PU" → "PU2").
28. **Known gap in rule 27:** UK crews write the camera letter on the take, "3C". The rule gives
    "3D", not "4C". Decision 1 keeps the camera off the take number, so it should not come up.
29. **A new take does not copy** the take number, times, circle, no good, notes, clip name or
    timecode. Everything else carries, end values included. The catalogue marks these
    `carry: false`.
30. **A prime's focal length wins over one left on the take.** Reason: after a swap from a zoom to
    a prime the copied value is stale.

### Import and validation

31. **Own CSV reader, no dependency.** One small module: quotes, any line end, comma, semicolon
    or tab. Reason: gear lists are small, and a library such as Papa Parse brings streaming,
    workers and type guessing we do not use.
32. **A CSV needs a header row with a model column,** within the first 20 rows. A file with no
    header imports nothing and says so.
33. **A row with no model is dropped. A bad cell drops only that value.** Both are reported.
34. **A lens with no focal length still imports,** with a warning. It can be fixed in the app.
35. **Validation returns at most one issue per value.**
36. **Nothing is required beyond a name:** project name, shoot date, setup labels, slate, take
    number, camera model, lens model.

### Sync (Kevin, 2026-11-11)

37. **`false` and a missing value are one value** in `sameValue`. FPT keeps an unticked checkbox as
    no value, so a stored `false` must not read as a conflict against it. Only a boolean field
    holds `false`, so no other value is touched.
38. **Two timestamps are one value when they name the same moment.** FPT answers
    `09:01:02Z` for `09:01:02.000Z`. The app stamps times to the second (`app.now()`), so a
    time read back equals the one sent.

### Gear (Claude, 2026-11-11)

39. **A lens CSV may give the focal length and the long end in two columns,** as the catalogue
    names them (`focalLength`, `focalLengthMax`), in any order. When the focal length cell already
    holds a range, a long end that agrees is fine; one that disagrees is left out with the warning
    `import.focalConflict`, and the range wins. Reason: the range is one cell written whole, so it
    is the likelier to be right, and a dropped value is reported, never silent.
40. **A camera setup has an `order`, set by hand.** Setups with an order come first, by it; the
    rest follow by the old rule: single letters, then names, each alphabetical. A move numbers
    every setup from 1, so a new setup lands at the end.

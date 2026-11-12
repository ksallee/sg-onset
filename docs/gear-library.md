# Gear library

The camera bodies and lenses the app ships with. Gear > Add from Library picks from them. Only what
is picked becomes a record of the project.

## Files

- `src/lib/gear/library/cameras.csv`: 102 bodies, 12 makers.
- `src/lib/gear/library/camera-modes.csv`: 1,495 recording modes of 77 of those bodies.
- `src/lib/gear/library/lenses.csv`: 629 lenses, 79 sets, 14 makers.
- `src/lib/gear/library.ts`: reads them, searches, makes the records. Pure.
- `src/lib/gear/libraryData.test.ts`: checks every row of both files.

## Where the values come from

Each row was read on the maker's page or PDF on 2026-11-11. `sourceUrl` is that page.
`confidence` is `maker`, or `secondary` when no maker page had the value and two other sources
agreed. Four rows are `secondary`: Pocket Cinema Camera 6K (2019), Z CAM E2-F6, Sony F55
(resolution from Sony, no sensor size), Angénieux Optimo 17-80.

A value no source confirmed is an empty cell. Canon gives no active area in mm for its cinema
bodies, so those rows have a resolution only. The Sony FX6 row has a name only.

No row comes from the EmberLight Camera-Sensor-Database or from vfxcamdb.com. EmberLight stores no
source for its values and looks derived from vfxcamdb, which has no licence.

## Cameras

One row per body, for its largest recording mode: open gate where the body has one. `sensorMode`
is the maker's name for it. Sensor size is the active area of that mode in mm. Stills bodies use
the full 3:2 stills frame.

`camera-modes.csv` holds the other recording modes of a body, same columns: the modes picked in
the camera menu that change the sensor area read or the photosites recorded. In the library a
body with several modes opens to them. Each picked mode becomes a camera of its own, named
"ALEXA 35, 4K 16:9" (model decision 6); the full sensor keeps the body's name alone.

`confidence` there is `maker`, or `derived`: pixels from the maker, mm computed from the
photosite pitch the maker states (99 rows). A scaled mode keeps the area it reads, so its mm
per pixel differs from the full sensor's. Ten rows had a sensor size that did not fit their
resolution or the full sensor (the maker's table repeats or rounds a value): their mm are empty.
RED lists every window of each sensor, so its bodies have 40 to 113 modes; the body has a filter.

Bodies with no mode list from the maker: Pocket Cinema Camera 6K (2019), Sony FX6, FX3, FX30,
F55, F65, FS7 II, and the stills bodies.

## Lenses

One row per lens. `series` is the set. A zoom has its short end in `focalLength` and its long end
in `focalLengthMax`. `anamorphicSqueeze` is empty for spherical glass.

`maxTStop` and `coverage` (`S35`, `FF`, `LF`, `65`) show in the library only. The project's lens
has no such fields yet.

Left out, for want of a maker page: Panavision T, C, E, G, H and B Series, Laowa, Sirui.

## Adding rows

Add the row with its source. Run `pnpm test`: the data test fails on a duplicate name, a missing
source, a mode of an unknown body, a mode larger than the full sensor, a size that does not match its resolution, or a lens whose name lacks its focal length.

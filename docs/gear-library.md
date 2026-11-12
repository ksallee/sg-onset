# Gear library

The camera bodies and lenses the app ships with. Gear > Add from Library picks from them. Only what
is picked becomes a record of the project.

## Files

- `src/lib/gear/library/cameras.csv`: 102 bodies, 12 makers.
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

A body shot in a smaller mode is edited after it is added, or added twice (model decision 6).

## Lenses

One row per lens. `series` is the set. A zoom has its short end in `focalLength` and its long end
in `focalLengthMax`. `anamorphicSqueeze` is empty for spherical glass.

`maxTStop` and `coverage` (`S35`, `FF`, `LF`, `65`) show in the library only. The project's lens
has no such fields yet.

Left out, for want of a maker page: Panavision T, C, E, G, H and B Series, Laowa, Sirui.

## Adding rows

Add the row with its source. Run `pnpm test`: the data test fails on a duplicate name, a missing
source, a size that does not match its resolution, or a lens whose name lacks its focal length.

# Vocabulary

The words SG OnSet shows. Every later string follows this page. `src/lib/i18n/vocabulary.test.ts`
enforces the parts a test can check.

## Rules

1. One term per concept, one concept per term, across the whole app. A synonym is a bug.
2. The term is the one a data wrangler already writes on a camera report. Where the VES Camera
   Report Interchange Format (CRIF) has a name that crews say, use it. Model keys follow OMC and
   OpenTrackIO and are never shown.
3. Sentence case for field labels, options, section headers, footers and messages. Title case for
   buttons and screen titles ("Export Backup", "Sign In", "No Slates"). FPT field names are Title
   Case, as FPT shows them.
4. British spelling: colour, metres. Units are lower case and abbreviated after a number: mm, m,
   ft, in, °, fps, K, px. A space before the unit, none before °: "35 mm", "12°".
5. Every take field shown in the take table has two labels: the long one for forms
   (`field.take.<key>`) and the short one for the table (`field.take.<key>.short`), at most 8
   characters. Both are in this page. Nothing else abbreviates a field.
6. An end value is "{label}, end" in forms and "{short} end" in the table: "Focus distance, end",
   "Focus end".
7. The product is **SG OnSet** in prose and UI. `sg-onset` only in code, package names, storage
   keys and URLs.
8. Say "Flow PT" for the studio's site in the UI. "Flow Production Tracking" in the tagline only.
   "FPT" in code and docs only. Never "the server".
9. A new field: pick the term from CRIF first, then the VES on-set guide, then OMC or OpenTrackIO
   in plain words. Write its long label, its short label if it is per take, a row here, and run the
   test. If the term needs a reason, add it to the hard cases.

## Product, places and things

| Term | Short | Definition | Model key | Standards | FPT |
|---|---|---|---|---|---|
| SG OnSet | | This app. | | | |
| Flow PT | | The studio's Flow Production Tracking site. | | | |
| Project | | One show. | `project` | CRIF Job; OMC CreativeWork | Project |
| Shoot day | Day {n} | One day of shooting for one unit, numbered. | `shootDay` | CRIF Shoot Day; VES 3.3 | Shoot Day |
| Lighting setup | | One lighting state, with its HDRI, balls and chart. | `lightingSetup` | VES scope Lighting setup | Lighting Setup |
| Camera setup | Cam | A camera with a lens, known by its letter: A, B, C. A take is one camera setup's take. | `cameraSetup` | CRIF Camera Letter; OMC cameraLabel | Camera Setup |
| Camera | | The camera body. | `camera` | CRIF Camera Body; OMC cameraMake/Model | Camera |
| Lens | | One lens, by serial number. | `lens` | CRIF Tk Lens ID | Lens |
| Slate | | The number on the clapperboard and the takes shot under it. | `slate` | CRIF Slate; OMC Slate.slateUID | Slate |
| Take | | One camera setup's run of one slate, from Start to End. | `take` | CRIF Tk Take; VES scope Take | Take |
| Photo | | A reference photo taken from the take screen, kept on the take. | `still` | VES 1.1 reference | Photos |
| Entry | | One stored slate, take, camera, lens, camera setup, lighting setup or shoot day. | | | |
| Change | | One edit waiting to sync. | outbox entry | | |
| Template | | Values that fill a new slate or take. Entries made from it follow its later edits. | `template` | | Onset Template |
| Gear | | The cameras, lenses and camera setups of a project. | | | |

Note for code: the outbox calls a change an "entry" (`counts.entries`). The UI word for a queued
edit is **Change**; **Entry** is a stored record.

## Fields

Long label for forms, short label for the take table. The FPT column is what `src/lib/fpt/mapping.ts`
gives.

### Shoot day

| Label | Definition | Key | Standards | FPT |
|---|---|---|---|---|
| Date | The calendar date of the shoot day. | `shootDate` | OMC Slate.shootDate; ALE Shoot Date | Shoot Date |
| Day number | The shoot day's number for its unit. | `shootDay` | CRIF Shoot Day; OMC Slate.shootDay | Day Number |
| Unit | The shooting unit: Main, 2nd, Splinter. | `cameraUnit` | CRIF Unit; OMC Slate.cameraUnit | Unit |
| Location | Where the day shoots. | `location` | CRIF Set Location | Location |
| Wrangler | Who logs the data. | `wrangler` | CRIF Wrangler | Wrangler |

### Lighting setup

| Label | Definition | Key | Standards | FPT |
|---|---|---|---|---|
| Name | The lighting setup's name. | `label` | | Name (code) |
| HDRI | An HDRI was shot for this lighting. | `hdri` | CRIF Set Media "HDRI"; VES 4.2 | HDRI |
| HDRI filename | The file name of the HDRI. | `hdriFilename` | CRIF HDRI Filename | HDRI Filename |
| Grey and chrome balls | The balls were shot. | `referenceBalls` | CRIF Set Media "Balls"; VES 4.3 | Grey and Chrome Balls |
| Colour chart | A colour chart was shot. | `colourChart` | VES 4.1 | Colour Chart |
| Notes | Free text. | `notes` | | Set Notes |

### Camera setup

| Label | Definition | Key | Standards | FPT |
|---|---|---|---|---|
| Camera letter | A, B, C: the letter the crew calls the camera by. | `cameraLabel` | CRIF Camera Letter; OMC cameraLabel; OpenTrackIO static.camera.label; ALE Camera | Name (code) |
| Camera | The body on this setup. | `cameraId` | | Camera |
| Lens | The lens on this setup. | `lensId` | | Lens |
| Order | The setup's place in every list, set by moving it. Not a form field. | `order` | | Sort Order |

### Slate

| Label | Definition | Key | Standards | FPT |
|---|---|---|---|---|
| Slate | The slate as written on the board: 42A, 112. | `slateUID` | CRIF Slate; OMC Slate.slateUID | Name (code) |
| Scene | The script scene number. | `sceneNumber` | CRIF Scene Number; OMC ProductionScene.sceneNumber; ALE Scene | Scene Number |
| Setup | The setup letter or number within the scene. | `setup` | OMC SlateUID.hasSlateSetup; VES scope Setup | Setup |
| Lighting setup | The lighting setup in use. | `lightingSetupId` | | Lighting Setup |
| Description | What the shot is. | `description` | CRIF Shot Description | Description |
| VFX shots | The VFX shot codes this slate feeds. | `vfxShots` | CRIF VFX Shot | VFX Shots |
| Element type | Plate, clean plate, bluescreen, element. | `elementType` | CRIF Element Type | Element Type |
| Interior or exterior | Interior or Exterior. | `interiorExterior` | CRIF Interior Exterior (Int, Ext) | Interior Exterior |
| Script time | Day, Night, Dusk, Dawn, Magic hour. | `scriptTime` | CRIF Script Time | Script Time |
| Lidar scan | A lidar scan was made. | `lidar` | VES 5.1 | LiDAR |
| Witness camera | Witness cameras ran. | `witnessCamera` | CRIF Set Media "Witness Cam"; VES 2.1 | Witness Camera |
| Clean plate | A clean plate was shot. | `cleanPlate` | CRIF Set Media "Clean Plate" | Clean Plate |
| Notes | Free text. | `notes` | CRIF Notes | Set Notes |

### Take

| Label | Short | Definition | Key | Standards | FPT |
|---|---|---|---|---|---|
| Take | Take | The take as called: 1, 2, 3, PU. | `take` | CRIF Tk Take; OMC SlateUID.hasTake; ALE Take | Name (code) |
| Start time | Start | When Start was pressed. | `startedAt` | CRIF Tk Start Time Of Take | Start Time |
| End time | End | When End was pressed. | `endedAt` | | End Time |
| Circled | Circled | The take is circled: a keeper. | `circleTake` | OMC circleTake; ALE Circled Take | Circled |
| No good | NG | The take is no good. | `noGood` | | No Good |
| Notes | | Free text. | `notes` | CRIF Tk Notes | Set Notes |
| Camera setup | Cam | The camera setup this take belongs to. | `cameraSetupId` | | Camera Setup |
| Camera | | The body used on this take. A new take gets it from the camera setup. | `cameraId` | | Camera |
| Lens | | The lens used on this take. A new take gets it from the camera setup. | `lensId` | | Lens |
| Focal length | Focal | Focal length in mm. | `focalLength` | CRIF Tk Focal Length; OMC focalLength; OpenTrackIO static.lens.nominalFocalLength | Focal Length |
| T-stop | T-stop | The lens stop, in T. | `tStop` | CRIF Tk Stop; OMC tStop; OpenTrackIO lens.tStop; ALE F-Stop | T-Stop |
| Focus distance | Focus | Where the lens is focused, in m or ft in, or ∞. | `focusDistance` | CRIF Tk Lens Focus; OMC focusPosition; OpenTrackIO lens.focusDistance | Focus Distance m |
| Lens height | Height | Height of the lens above the ground. | `lensHeight` | CRIF Tk Lens Height; VES 1.1 camera height | Lens Height m |
| Tilt | Tilt | Camera angle up or down in degrees. Up is plus. | `tilt` | CRIF Tk Camera Tilt; OMC tilt; OpenTrackIO rotation.tilt | Tilt |
| Dutch angle | Dutch | Camera roll about the lens axis in degrees. Clockwise is plus. | `roll` | CRIF Tk Camera Dutch; OMC roll; OpenTrackIO rotation.roll | Dutch Angle |
| Subject distance | Subject | Distance from the camera to the subject. | `distanceToSubject` | VES 1.1 start and end distances | Subject Distance m |
| Frame rate | FPS | Capture frame rate, in fps. | `captureFrameRate` | CRIF Tk FPS; OMC captureRate; OpenTrackIO static.camera.captureFrameRate; ALE Sensor_fps | Frame Rate |
| Shutter angle | Shutter | Shutter angle in degrees. | `shutterAngle` | CRIF Tk Shutter Angle; OMC shutterAngle; OpenTrackIO static.camera.shutterAngle | Shutter Angle |
| ISO | ISO | The sensitivity set on the camera. | `isoSpeed` | CRIF ASA; OMC isoSpeed; OpenTrackIO static.camera.isoSpeed; ALE Exposure_index, ASA | ISO |
| White balance | WB | The white balance set on the camera, in K. | `whiteBalance` | CRIF White Balance; OMC whiteBalance; ALE White_balance | White Balance |
| Filter | Filter | Filters in front of the lens, ND included: "ND.6 Pola". | `filter` | CRIF Tk Filter; VES 1.1 ND, filter; ALE Nd_filterdensity | Filter |
| Camera roll | Roll | The camera roll or card the take is on: A001. | `cameraRoll` | CRIF Tk Roll; OMC Slate.cameraRoll; ALE Camroll, Reel_name | Camera Roll |
| Clip name | Clip | The clip name the camera wrote: A001C003. | `clipName` | ALE Name; CRIF Tk Clip Num | Clip Name |
| Timecode in | TC in | Timecode at the first frame. | `timecodeStart` | CRIF Tk Timecode; OMC timecodeStart; ALE Start | Timecode In |
| Timecode out | TC out | Timecode at the last frame. | `timecodeEnd` | OMC timecodeEnd; ALE End | Timecode Out |

### Camera

| Label | Definition | Key | Standards | FPT |
|---|---|---|---|---|
| Make | ARRI, RED, Sony. | `cameraMake` | CRIF Camera Body; OMC cameraMake | Camera Make |
| Model | ALEXA 35, V-RAPTOR. | `cameraModel` | OMC cameraModel | Name (code) |
| Serial number | The body's serial number. | `cameraSerialNumber` | OMC cameraSerialNumber | Camera Serial Number |
| Sensor size | Active sensor width and height in mm. | `activeSensorPhysicalDimensions` | OpenTrackIO activeSensorPhysicalDimensions; VES 1.2 | Sensor Width mm, Sensor Height mm |
| Sensor resolution | Active sensor width and height in px. | `activeSensorResolution` | OpenTrackIO activeSensorResolution; VES 6.1 | Sensor Resolution Width, Height |

### Lens

| Label | Definition | Key | Standards | FPT |
|---|---|---|---|---|
| Make | Cooke, ZEISS, ARRI. | `lensMake` | OMC lensMake | Lens Make |
| Model | The lens series and focal length as marked. | `lensModel` | CRIF Tk Lens ID; OMC lensModel | Name (code) |
| Serial number | The lens's serial number. | `lensSerialNumber` | CRIF Tk Lens Serial Num | Lens Serial Number |
| Focal length | A prime's focal length, or a zoom's shortest. | `focalLength` | OMC focalLength | Focal Length |
| Long end | A zoom's longest focal length. | `focalLengthMax` | | Focal Length Long End |
| Anamorphic squeeze | 1, 1.5, 2. | `anamorphicSqueeze` | OMC anamorphicSqueeze; OpenTrackIO static.camera.anamorphicSqueeze | Anamorphic Squeeze |

## Actions, states and settings

| Term | Definition | Rejected |
|---|---|---|
| Start, End | The take button pair. Stamps the take's start and end time. | Record, Rec, Roll, Cut, Stop: the app records nothing |
| Ready, Running, Ended | The take's state. | Rolling, Filed, Idle |
| New Take | Starts the next take as a copy of the last. | |
| Photo | Takes a reference photo for the take. | Still, Ref |
| Undo, Redo | Reverse the last edit. | |
| Sync | Send changes to Flow PT and read back. | Upload, Push |
| All synced | Nothing waits, signed in. | |
| Nothing to sync | Nothing waits, signed out. | |
| {n} to sync | Changes wait, signed in. | Pending, Unsynced |
| {n} on this device | Changes wait, nobody signed in. | Local |
| Needs attention | A change waits for a person. Counted as "{n} need attention". | Need a look, Error |
| Also changed in Flow PT | The conflict: both sides changed the same field. | Conflict |
| Keep Mine, Keep Flow PT's | The two ways out of a conflict. | Take theirs: whose? |
| Settings | The settings screen. | Setup: a setup is a camera or lighting thing |
| Appearance: System, Light, Dark | The colour scheme. | Theme, Day |
| Red night mode | Red on black. Replaces the appearance when on. | Night theme |
| Button size: Standard, Large | The capture buttons' size. | Gloves |
| Motion: System, Full, Reduced | Whether the app animates. | |
| Lengths: Metres, Feet and inches | How lengths show and are typed. Stored in metres. | Metric, Imperial, Feet |
| Display | The settings section with appearance and motion. | Look: too close to a sync word |

## Hard cases

- **Tilt**, not pitch. CRIF "Tk Camera Tilt", OMC and OpenTrackIO `tilt`. Pitch is a CG word.
- **Dutch angle**, not roll, for the angle. CRIF names it "Tk Camera Dutch" and crews say dutch.
  This keeps **Roll** free for the camera roll, its CRIF and set meaning. The key stays `roll`.
- **Camera roll**, not reel or mag. CRIF "Tk Roll", the VES guide's "Roll, Slate, Take", OMC
  `cameraRoll`, ALE "Camroll". Reel is the editorial and tape word; mag is the physical magazine.
  The short form is Roll.
- **Lens height**, not camera height. CRIF measures the lens, which is what matchmove needs.
- **Focus distance** in forms, **Focus** in the table. "Focus" alone in a form reads as a yes/no.
- **Subject distance**: reads in step with focus distance, and is what wranglers write.
- **T-stop**, not stop. Cine lenses are marked in T, and OMC and OpenTrackIO name `tStop`. CRIF
  "Tk Stop" allows F or T. Never "Stop" alone: it is a banned button word.
- **Shutter angle** in degrees. Shutter speed is a stills word.
- **Frame rate** in forms, **FPS** in the table, **fps** as the unit. CRIF "Tk FPS".
- **ISO**, not EI or ASA. One number, what the camera menu shows on most bodies. CRIF says ASA,
  ARRI files say Exposure_index; both map to it.
- **White balance**, not colour temperature. Colour temperature is the light's; white balance is
  the camera's setting.
- **Filter** holds every filter, ND included, as typed. CRIF "Tk Filter".
- **Slate** is the board number; **Setup** is the setup within the scene; **Camera setup** is a
  camera with a lens and a letter. A VFX **shot** is the post shot code, only in "VFX shots".
- **Scene** is the script scene. **Take** is the take as called, a string: 1, 2, PU.
- **Circled** and **No good** (short NG). Circled is the crew word and OMC `circleTake`. Print and
  Good are rejected: print is a film-lab word, good reads as a judgement on the shot.
- **MOS** and **wild track** have no field yet. When they come: "MOS" (flag), "Wild track"
  (flag), both sentence case.
- **Unit** is the shooting unit. **Shoot day** is one unit's day, named "Day {n}".
- **Entry** for a stored thing. "Item" is vague; "record" means to shoot.
- **Photo**, not still. On set, "stills" means the unit stills photographer.
- Sync speaks of **Flow PT** and **this device**. Never "the server", "mine and theirs".

# fpt

Flow Production Tracking: the mapping of our records to a site's entities and fields, and the
outbox's `Transport` over the REST API. The browser calls `/api/v1` itself with a bearer. Nothing
here is wired into the app yet.

Every behaviour relied on is from `~/dev/sg-groundtruth/corpus`. The comments name the entries.

## Modules

| module | pure | what it does |
|---|---|---|
| `names.ts` | yes | Display name to `sg_` name, as the server derives it. Type to REST slug. |
| `mapping.ts` | yes | The mapping, derived from the catalogue. Entity types per scope. |
| `convert.ts` | yes | One value, both ways, per FPT data type. |
| `schema.ts` | yes | Entities by display name, the field plan, the `Resolution` kept per site. |
| `payload.ts` | yes | A record to the `data` of a create or update. A row back to our keys. |
| `stills.ts` | yes | A still's remote id, file name and display name. |
| `errors.ts` | yes | What a refusal or a missing answer means. |
| `uploadPlan.ts` | yes | Upload sizes, URL life, the completion body. |
| `cache.ts` | port | `KeyValue`: where a site's resolution is kept. Memory and `localStorage` forms. |
| `api.ts` | no | The calls. The only module that calls `fetch`. Uses `sg-widgets-core`'s clients. |
| `setup.ts` | no | `checkSetup`: the readiness report, and field creation. |
| `transport.ts` | no | `createFptTransport`: the `Transport`. |
| `fakeFpt.ts`, `testkit.ts` | no | A site behind a `fetch`, in the corpus's shapes. For tests. |

## Plugging it in

```ts
import { bearer, auth } from '$lib/auth/session.svelte';
import { checkSetup, createFptTransport, storageKeyValue } from '$lib/fpt';

const schemaCache = storageKeyValue(localStorage);
const report = await checkSetup({ site: auth.site!, bearer, schemaCache }); // after sign-in
if (report.ready) {
	const transport = createFptTransport({ site: auth.site!, bearer, schemaCache, projectId });
	const runner = createRunner({ port: store.outbox, transport, env: browserEnv() });
}
```

- `projectId` is the FPT project the device syncs with. The app picks it. See decision 1.
- Do not start the runner before `report.ready`. A site that is not set up throws `failed`, which
  counts attempts.
- `checkSetup({ createFields: false })` only looks.

## Entities

| scope | entity | found by |
|---|---|---|
| `shootDay` | ShootDay | schema name |
| `slate` | Slate | schema name |
| `camera` | Camera | schema name |
| `take` | custom, "Take" | display name |
| `lens` | custom, "Lens" or "Lenses" | display name |
| `cameraSetup` | custom, "Camera Setup" | display name |
| `lightingSetup` | custom, "Lighting Setup" | display name |
| `still` | Attachment, in `sg_stills` on the take | file name |
| `project` | Project | given: `projectId` |

Custom entities are matched trimmed and whatever the case, among `CustomEntityNN` types only.
Never by slot number.

## The setup report

```ts
type SetupReport = {
	ready: boolean; // every entity found, every field there
	site: string;
	entities: {
		scope: EntityScope;
		kind: 'builtin' | 'custom';
		displayName: string; // custom: the name to give the entity
		status: 'found' | 'missing' | 'ambiguous';
		entityType?: string; // 'CustomEntity09'; for a built-in type also when missing
		candidates?: string[]; // ambiguous: every type with that display name
	}[];
	fields: {
		scope: EntityScope;
		entityType: string;
		name: string; // 'sg_focal_length'
		displayName: string; // 'Focal Length'
		dataType: 'text' | 'float' | 'number' | 'checkbox' | 'date' | 'date_time' | 'entity' | 'multi_entity';
		status: 'present' | 'created' | 'missing' | 'needsAdmin' | 'blocked' | 'failed';
		reason?: string;
		unique?: true; // must be created unique
		validTypes?: string[]; // the type an entity field links
	}[];
	canCreateFields?: boolean; // absent when no create was tried
};
```

- `missing` entity: an admin enables it in the web interface. No API call does.
- `needsAdmin`: the person may not create fields. The entry holds all an admin needs to create it.
  The check stops creating at the first refusal.
- `blocked`: both names are taken, or the field links an entity that is missing.
- `failed`: the site refused, or created another name than asked.

## The mapping

Derived from `$lib/model/catalogue`. The display name is the key in words, the `sg_` name follows
from it by the server's rule, the data type follows from the value type. A new catalogue field is
mapped with no line. `OVERRIDES` in `mapping.ts` holds the exceptions, one line each.
`mapping.test.ts` fails if a catalogue field or a link key has no mapping.

| value type | FPT type | on the wire |
|---|---|---|
| string, enum, timecode | text | as it is |
| stringList | text | `SH010, SH020` |
| rational | text | `24000/1001` |
| date | date | `YYYY-MM-DD` |
| timestamp | date_time | UTC, to the second |
| integer | number | JSON integer |
| number | float | numeric string, `"50.0"`. A JSON integer is refused |
| boolean | checkbox | `true`, `false`. Never null |
| length | float | metres. Infinity is `1000000000.0` |
| dimensions | float or number | two fields, width and height |
| ref | entity | `{type, id}` |

Every entity also gets `sg_onset_uuid` (text, unique): the record id on the device. The take gets
`sg_stills` (multi-entity to Attachment). `created_at` of a take is its `startedAt`.

**shootDay**

| key | field | type | unit |
|---|---|---|---|
| `projectId` | `project` | entity | |
| `shootDate` | `sg_shoot_date`, `code` | date | |
| `shootDay` | `sg_day_number` | number | |
| `cameraUnit` | `sg_camera_unit` | text | |
| `location` | `sg_location` | text | |
| `wrangler` | `sg_wrangler` | text | |

**lightingSetup**

| key | field | type | unit |
|---|---|---|---|
| `projectId` | `project` | entity | |
| `label` | `code` | text | |
| `hdri` | `sg_hdri` | checkbox | |
| `hdriFilename` | `sg_hdri_filename` | text | |
| `referenceBalls` | `sg_reference_balls` | checkbox | |
| `colourChart` | `sg_colour_chart` | checkbox | |
| `notes` | `sg_set_notes` | text | |

**cameraSetup**

| key | field | type | unit |
|---|---|---|---|
| `projectId` | `project` | entity | |
| `cameraLabel` | `code` | text | |
| `cameraId` | `sg_camera` | entity | |
| `lensId` | `sg_lens` | entity | |

**slate**

| key | field | type | unit |
|---|---|---|---|
| `shootDayId` | `sg_shoot_day` | entity | |
| `templateId` | `sg_onset_template` | text | |
| `slateUID` | `code` | text | |
| `sceneNumber` | `sg_scene_number` | text | |
| `setup` | `sg_setup` | text | |
| `lightingSetupId` | `sg_lighting_setup` | entity | |
| `description` | `description` | text | |
| `vfxShots` | `sg_vfx_shots` | text | |
| `elementType` | `sg_element_type` | text | |
| `interiorExterior` | `sg_interior_exterior` | text | |
| `scriptTime` | `sg_script_time` | text | |
| `lidar` | `sg_lidar` | checkbox | |
| `witnessCamera` | `sg_witness_camera` | checkbox | |
| `cleanPlate` | `sg_clean_plate` | checkbox | |
| `notes` | `sg_set_notes` | text | |

**take**

| key | field | type | unit |
|---|---|---|---|
| `slateId` | `sg_slate` | entity | |
| `templateId` | `sg_onset_template` | text | |
| `take` | `code` | text | |
| `startedAt` | `sg_started_at` | date_time | |
| `endedAt` | `sg_ended_at` | date_time | |
| `circleTake` | `sg_circle_take` | checkbox | |
| `noGood` | `sg_no_good` | checkbox | |
| `notes` | `sg_set_notes` | text | |
| `cameraSetupId` | `sg_camera_setup` | entity | |
| `cameraId` | `sg_camera` | entity | |
| `lensId` | `sg_lens` | entity | |
| `focalLength`, `focalLengthEnd` | `sg_focal_length`, `sg_focal_length_end` | float | mm |
| `tStop` | `sg_t_stop` | float | |
| `focusDistance`, `focusDistanceEnd` | `sg_focus_distance_m`, `sg_focus_distance_end_m` | float | m |
| `lensHeight`, `lensHeightEnd` | `sg_lens_height_m`, `sg_lens_height_end_m` | float | m |
| `tilt`, `tiltEnd` | `sg_tilt`, `sg_tilt_end` | float | deg |
| `roll`, `rollEnd` | `sg_roll`, `sg_roll_end` | float | deg |
| `distanceToSubject`, `distanceToSubjectEnd` | `sg_distance_to_subject_m`, `sg_distance_to_subject_end_m` | float | m |
| `captureFrameRate` | `sg_capture_frame_rate` | text | num/denom, Hz |
| `shutterAngle` | `sg_shutter_angle` | float | deg |
| `isoSpeed` | `sg_iso` | number | |
| `whiteBalance` | `sg_white_balance` | number | K |
| `filter` | `sg_filter` | text | |
| `cameraRoll` | `sg_camera_roll` | text | |
| `clipName` | `sg_clip_name` | text | |
| `timecodeStart` | `sg_timecode_start` | text | |
| `timecodeEnd` | `sg_timecode_end` | text | |

**camera**

| key | field | type | unit |
|---|---|---|---|
| `projectId` | `project` | entity | |
| `cameraMake` | `sg_camera_make` | text | |
| `cameraModel` | `code` | text | |
| `cameraSerialNumber` | `sg_camera_serial_number` | text | |
| `activeSensorPhysicalDimensions` | `sg_sensor_width_mm`, `sg_sensor_height_mm` | float | mm |
| `activeSensorResolution` | `sg_sensor_resolution_width`, `sg_sensor_resolution_height` | number | px |

**lens**

| key | field | type | unit |
|---|---|---|---|
| `projectId` | `project` | entity | |
| `lensMake` | `sg_lens_make` | text | |
| `lensModel` | `code` | text | |
| `lensSerialNumber` | `sg_lens_serial_number` | text | |
| `focalLength` | `sg_focal_length` | float | mm |
| `focalLengthMax` | `sg_focal_length_max` | float | mm |
| `anamorphicSqueeze` | `sg_anamorphic_squeeze` | text | num/denom |

**still** (an Attachment)

| key | field | note |
|---|---|---|
| `takeId` | the take's `sg_stills` | set by the upload |
| `capturedAt` | `display_name` | `Still 2026-11-11T09:01:02.000Z` |
| `caption` | `description` | |
| the still id and the blob id | `filename` | `onset_<still>_<blob>.jpg`. Read-only after upload |

These are the names asked for. The name on a site can differ: see decision 3.

## How a push goes

- One `_batch` per push. One dependency level, as the runner sends it.
- Everything is checked before it is sent. A create in a batch skips the server's validation.
- A 400 code 104 "required to be unique" names no request. Every create of the batch is looked up
  by client UUID; the ones found are `duplicate`.
- A 404 names the type and id: that operation is `gone`.
- Another 400 names a field: the operations that wrote it are `invalid`. If it names none, every
  operation of the batch is `invalid` with the server's words.
- 401, or 400 code 102: `unauthorized`. 429, 5xx: `failed`. 502, 504 on a write: `timeout`.
- No answer: `unreachable` when offline, or on a read. `timeout` on a write while online.

## How an upload goes

1. `beginUpload`: `GET .../<take>/<id>/sg_stills/_upload?filename=`. Above 8 MiB,
   `multipart_upload=true` and 8 MiB parts. The session expires 840 s later.
2. `uploadPart`: `PUT` to storage. No Authorization. A 403 is `expired`. A multipart part's URL is
   minted when its bytes are ready.
3. `renewUpload`: one PUT gets a new ticket. Multipart keeps the parts sent and mints the URL of
   the next part; if the site refuses, the upload is aborted and `expired` is thrown.
4. `finishUpload`: the completion, with the ETags for multipart. Then, best effort: find the row by
   file name, put back any photo the field lost, write the caption.
5. `verifyUpload`: find the row by file name, fetch the stored file, compare the size, make sure
   the take's `sg_stills` holds it. A row with no bytes is deleted. Only ids are returned.

## Decisions

Made by Claude. Kevin can overrule any of them.

1. **The project is given, not synced.** `createFptTransport` takes `projectId`. A project create
   sends nothing and answers that id. A project update is refused. A project delete sends nothing.
   The app never creates, renames or deletes an FPT project.
2. **Plain field names.** "Focal Length", `sg_focal_length`. No prefix. Only the client UUID and
   the template link carry "Onset".
3. **A site field with our name and a fitting type is used as it is.** Where the name is taken by
   another type, or the display name is already shown by another field, ours steps aside to
   "Onset <name>", `sg_onset_<name>`. The resolution keeps the real name per site.
4. **A length says its unit in its name:** `sg_lens_height_m`. A crew that thinks in feet must not
   read metres as feet. Other units are in the field's description.
5. **Infinity is 1,000,000,000 m.** A float holds no infinity and null means not noted.
6. **A rational is text,** `24000/1001`. Lossless. FPT has no rational.
7. **A timecode and an enum are text.** The timecode keeps its frames. The enum keeps its key
   (`magicHour`), not a label. No list field: its values would need an admin to change.
8. **A list of strings is one text,** comma-separated. An item with a comma would split.
   `vfxShots` are not links to Shots.
9. **The record's name is `code`:** slate id, take number, camera model, lens model, setup labels.
   A shoot day's `code` is its date, and the date is a date field too.
10. **Notes are `sg_set_notes`.** The stock `notes` field links Note records.
11. **`templateId` is kept, as text,** in `sg_onset_template`. It is an id on the device.
12. **A key with no mapping is refused, not dropped.** The operation needs attention and says
    which key.
13. **A still is an Attachment found by its file name,** `onset_<still>_<blob>.<ext>`. The create of
    a still sends nothing: an Attachment made before its file can never get one. The still's
    remote id is `still:{"take":…,"capturedAt":…,"caption":…}`: what the upload needs, since the
    runner hands the upload only the still's remote id.
14. **The capture time of a still is in its display name.** Whether a custom field can be made on
    Attachment is not measured.
15. **Photos go to the field, then are put back if lost.** Whether a second upload to a
    multi-entity field adds or replaces is not measured, so `finishUpload` reads the field before
    and after and adds what is missing.
16. **A row with no bytes is deleted by the check.** It cannot be repaired.
17. **The `image` thumbnail is not set.** It needs a second upload of the same bytes. Not cheap.
18. **8 MiB in one PUT, 8 MiB parts above.** The largest single PUT measured was 7.7 MB.
19. **The transport never creates fields.** `checkSetup` does. The transport reads the cache, or
    the schema, and throws `failed` with what is missing.
20. **A resolution is cached until a write names a field the site lacks.** Then it is read again.
    `checkSetup` always reads and rewrites it.
21. **A created row is not read back.** Every create carries the project, so the row is readable.

## Where FPT did not fit the contract

1. **A checkbox has no null.** An unticked box reads as a missing value. The model's `sameValue`
   says `false` and missing differ. So a field stored as `false` on the device, then ticked,
   shows a conflict. The app must clear a boolean (`undefined`), not store `false`. Or
   `sameValue` treats `false` as missing.
2. **The server rounds.** A date_time keeps seconds, a float six decimals, a text loses outer
   spaces. A local value with more than that reads back different, and the next edit of that
   field shows a conflict. Stamp times to the second on the device.
3. **A batch refusal names no request.** See "How a push goes".
4. **No kind for "the site is not set up".** It is `failed`. Gate the runner on `ready`.
5. **A failed `fetch` does not say whether the request left.** Offline is `unreachable`. Online, a
   write is `timeout` and is checked; a read is `unreachable` and stops the drain.
6. **`finishUpload` and `verifyUpload` write.** They link, caption, and delete an empty row.

## Corpus gaps, as probe questions

1. What does `POST /schema/<Type>/fields` answer a signed-in person who is not an admin: status,
   code, title? Which permission groups may create fields?
2. What does `/api/v1` answer a bearer past its 600 s, or a made-up one: status, code, envelope?
3. A second upload to a multi-entity Attachment field
   (`/entity/<type>/<id>/<field>/_upload`): does it add or replace? Does the Attachment get a
   `project`?
4. Can a custom field be created on Attachment by API? Is `Attachment.filename` kept verbatim at
   90 characters, and do `is` and `starts_with` filter on it?
5. `unique: true`: does it span projects? Does a deleted row keep its value?
6. Do a numeric string in a float field, and `created_at`, behave in a `_batch` create on a custom
   entity as they do in a single `PUT` and `POST` on Version?
7. Does a dotted read through an entity field reach a custom field of a custom entity:
   `sg_slate.Slate.sg_onset_uuid`?
8. Multipart: how long does an `upload_id` live? Is the `timestamp` of a part link checked for
   age? Does a part URL minted 20 minutes after the init still complete?
9. The largest single PUT the storage takes. A real browser run of the whole upload.
10. Does the stored file's `GET` answer `Content-Length` to a page, and may the body be cancelled?
11. An entity field makes a field on each type it links (probe 121). What is it named, and can it
    be avoided? Ours make one on ShootDay, Slate, Camera and the custom entities.
12. May a person in a non-admin group create, update and delete rows of the custom entities, and
    delete an Attachment?
13. What a rate limit answers. Still unseen.

## On the probed site, read 2026-11-11

Read only: `GET /schema` and `GET /schema/<Type>/fields`, nothing written.

All seven entities resolve. ShootDay, Slate and Camera are on. Take, Lens, Camera Setup and
Lighting Setup are each one custom entity with that display name; the lens entity is shown as
"Lens". Take, Camera Setup and Lighting Setup have no field of the site's own yet.

Of the 76 fields we want, five are already there with a fitting type and are used as they are:
`ShootDay.sg_shoot_date`, `Slate.sg_shoot_day`, `Slate.sg_set_notes`,
`Camera.sg_camera_serial_number`, `Lens.sg_lens_serial_number`. Two names are held by a field of
another type, so ours step aside: `ShootDay.sg_onset_location` and `Lens.sg_onset_focal_length`.
The other 69 are created under their plain names.

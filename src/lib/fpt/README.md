# fpt

Flow Production Tracking: the mapping of our records to a site's entities and fields, and the
outbox's `Transport` over the REST API. The browser calls `/api/v1` itself with a bearer. The app
wires it in `src/lib/app/sync/` (its README).

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
| `diagrams.ts` | yes | A slate's setup diagram image: its file name and display name. |
| `versions.ts` | yes | A take's media that go up as a Version (a video; an audio note next): kind, file name, name, create, the file read back. |
| `takeVersions.ts` | no | The Version of a take's media: found by client UUID, made, its file checked. |
| `shots.ts` | yes | A slate's VFX shot codes matched to Shots: the search, what to link and unlink, what waits. |
| `errors.ts` | yes | What a refusal or a missing answer means. |
| `token.ts` | yes | The bearer's `exp`, and when to renew it. |
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
- `bearer({ renew: true })` must answer a new bearer, not the one held. It is asked a minute
  before the held one's `exp`, and once when the site answers `Token Expired` (decision 22).
  `bearer()` of `$lib/auth/session.svelte` ignores the argument today; sg-widgets-core's minter
  under it renews 60 s before its own expiry, which covers the first case.
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
| `reference` | custom, "Set Reference" | display name |
| `still` | Attachment, in `sg_photos` on the take | file name |
| `still` with a video file | Version, `entity` the take, the file in `sg_uploaded_movie` | client UUID |
| `project` | Project | given: `projectId` |
| (none) | Shot, in `sg_shots` on the slate | code, in the project. Read and linked, never written |
| a slate's setup diagram (#87) | Attachment, in `sg_setup_diagram` on the slate | file name |

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
	reverseFields: {
		entityType: string; // the linked type: 'Slate'
		name: string; // 'sg_takes'
		displayName: string; // 'Take <-> Slate'
		source: string; // our link field: 'CustomEntity09.sg_slate'
		status: 'present' | 'willAppear';
	}[];
	canCreateFields?: boolean; // absent when no create was tried
};
```

- `missing` entity: an admin enables it in the web interface. No API call does.
- `needsAdmin`: the person may not create fields. An Artist gets 500 code 105 "User doesn't have
  permission to create a Field" (corpus findings/132). The check stops at that first refusal and
  the sheet says only that an Admin must run Set Up Fields.
- `blocked`: both names are taken, the field links an entity that is missing, or the field it
  would add on the linked type takes a name already there (see "Reverse fields").
- `failed`: the site refused, or created another name than asked.

## Reverse fields

Every link field we create makes the server add a multi-entity field on the type it links,
visible and editable, and no create property stops it (corpus findings/142):

| our field | added on the linked type |
|---|---|
| `entity` | `sg_<source display name, plural>`, shown `<source> <-> <field>`: `Take.sg_slate` adds `Slate.sg_takes` |
| `multi_entity` | `<source slug>_<field>_<source slug>s`: `Take.sg_photos` adds `Attachment.custom_entity09_sg_photos_custom_entity09s`, `Slate.sg_shots` adds `Shot.slate_sg_shots_slates`, shown "Slates <-> Shots" |

- `planFields` predicts each name (`names.ts`, `reverseField`), from what the site calls the
  source entity. The plural of a built-in or of "Lens" is our English rule; the corpus measured
  custom slots.
- A predicted name already on the linked type, or predicted twice, blocks the link: the report
  names the field, nothing is created. What the server would pick instead is unmeasured.
- The report lists every added field, so an admin knows what will appear.
- **Never delete one.** Deleting the added field deletes our link field too, and both names stay
  spent until the Trash is emptied. Nothing here deletes or changes a field.
- A re-run finds the link and the field it added, and changes nothing.
- A retired field in the site's Trash still holds its name (findings/019). Kevin emptied the
  probed site's Trash on 2026-11-11; do the same before a first Set Up Fields elsewhere.

## The mapping

Derived from `$lib/model/catalogue`. The display name is the key in words, the `sg_` name follows
from it by the server's rule, the data type follows from the value type. A new catalogue field is
mapped with no line. `OVERRIDES` in `mapping.ts` holds the exceptions, one line each. Display
names follow `docs/vocabulary.md` (its FPT column): Dutch Angle, Start Time, Circled, Photos.
`mapping.test.ts` fails if a catalogue field or a link key has no mapping.

| value type | FPT type | on the wire |
|---|---|---|
| string, enum, timecode | text | as it is |
| stringList | text | `SH010, SH020` |
| rational | text | `24000/1001` |
| date | date | `YYYY-MM-DD` |
| timestamp | date_time | UTC, whole seconds. A fraction is never sent |
| integer | number | JSON integer |
| number | float | numeric string, `"50.0"`. A JSON integer is refused |
| boolean | checkbox | `true`, `false`. Never null |
| length | float | metres. Infinity is `1000000000.0` |
| dimensions | float or number | two fields, width and height |
| ref | entity | `{type, id}` |

Every entity also gets `sg_onset_uuid` (text, unique): the record id on the device. So does
Version, where a take's videos go. The take gets `sg_photos` (multi-entity to Attachment). The
slate gets `sg_shots`, "Shots" (multi-entity to Shot): see "Shot links", and `sg_setup_diagram`,
"Setup Diagram" (multi-entity to Attachment): see "A slate's setup diagram". `created_at` of a take
is its `startedAt`, of a set reference its `loggedAt`.

**shootDay**

| key | field | type | unit |
|---|---|---|---|
| `projectId` | `project` | entity | |
| `shootDate` | `sg_shoot_date`, `code` | date | |
| `shootDay` | `sg_day_number` | number | |
| `cameraUnit` | `sg_unit` | text | |
| `location` | `sg_location` | text | |
| `wrangler` | `sg_wrangler` | text | |

**lightingSetup**

| key | field | type | unit |
|---|---|---|---|
| `projectId` | `project` | entity | |
| `label` | `code` | text | |
| `hdri` | `sg_hdri` | checkbox | |
| `hdriFilename` | `sg_hdri_filename` | text | |
| `referenceBalls` | `sg_grey_and_chrome_balls` | checkbox | |
| `colourChart` | `sg_colour_chart` | checkbox | |
| `notes` | `sg_set_notes` | text | |

**cameraSetup**

| key | field | type | unit |
|---|---|---|---|
| `projectId` | `project` | entity | |
| `cameraLabel` | `code` | text | |
| `cameraId` | `sg_camera` | entity | |
| `lensId` | `sg_lens` | entity | |
| `order` | `sg_sort_order` | number | |

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
| `vfxShots` | `sg_vfx_shots` | text | as typed; the Shots of the codes go to `sg_shots` |
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
| `takeType` | `sg_take_type` | text | the key: `cleanPlate`; empty is Main |
| `takeTail` | `sg_take_tail` | text | the keys, comma-separated: `cleanPlate, ballsAndChart`; empty is none |
| `startedAt` | `sg_start_time` | date_time | |
| `endedAt` | `sg_end_time` | date_time | |
| `circleTake` | `sg_circled` | checkbox | |
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
| `roll`, `rollEnd` | `sg_dutch_angle`, `sg_dutch_angle_end` | float | deg |
| `distanceToSubject`, `distanceToSubjectEnd` | `sg_subject_distance_m`, `sg_subject_distance_end_m` | float | m |
| `captureFrameRate` | `sg_frame_rate` | text | num/denom, Hz |
| `shutterAngle` | `sg_shutter_angle` | float | deg |
| `isoSpeed` | `sg_iso` | number | |
| `whiteBalance` | `sg_white_balance` | number | K |
| `filter` | `sg_filter` | text | |
| `cameraRoll` | `sg_camera_roll` | text | |
| `clipName` | `sg_clip_name` | text | |
| `timecodeStart` | `sg_timecode_in` | text | |
| `timecodeEnd` | `sg_timecode_out` | text | |

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
| `focalLengthMax` | `sg_focal_length_long_end` | float | mm |
| `anamorphicSqueeze` | `sg_anamorphic_squeeze` | text | num/denom |

**reference** (a set reference, one row each)

| key | field | type | unit |
|---|---|---|---|
| `slateId` | `sg_slate` | entity | |
| `kind` | `sg_kind` | text | |
| `name` | `code` | text | |
| `device` | `sg_device` | text | |
| `cardOrRoll` | `sg_card_or_roll` | text | |
| `count` | `sg_count` | number | |
| `notes` | `sg_set_notes` | text | |
| `loggedAt` | `sg_logged_at`, and `created_at` on create | date_time | |

`Set Reference.sg_slate` adds `Slate.sg_set_references`, shown "Set Reference <-> Slate"
(findings/142), so a slate in Flow PT lists its references.

**still** (an Attachment)

| key | field | note |
|---|---|---|
| `takeId` | the take's `sg_photos` | set by the upload |
| `capturedAt` | `display_name` | `Photo 2026-11-11T09:01:02.000Z` |
| `caption` | `description` | |
| the still id and the blob id | `filename` | `onset_<still>_<blob>.jpg`, lowercase, no space. Read-only after upload |
| the take, found back | `attachment_links` | set by the upload |

**still with a video file** (a Version, decision 32)

| key | field | note |
|---|---|---|
| the still id | `sg_onset_uuid` | unique, made by Set Up Fields |
| `takeId` | `entity` | the take. Read back by the check, put back if missing |
| `capturedAt` | `code` | `Video 2026-11-11T09:01:02Z`. Not unique: the client UUID is the key |
| `caption` | `description` | |
| the file | `sg_uploaded_movie` | `onset_video_<still>_<blob>.mov`. One file; a new upload replaces it |
| | `project` | the linked project |

A still's annotated copy (#86: the photo with its drawing flattened on it) is a second file of the
still, uploaded to the same field: `filename` `onset_<still>_<blob>-annotated.jpg`, `display_name`
`Photo 2026-11-11T09:01:02.000Z annotated`. The still's prefix finds both; `capturedAtOf` reads
either display name. A caption or capture time written on the still goes on both files. A copy
made again after the drawing changed is a new file. When it is verified, the take keeps only the
newest annotated copy, the one uploaded last, in its photos field: one `_batch` removes the older
ones (and adds the newest if it is missing), the mode in the body (recipes/009, findings/154 of the
notes-media probes). The older copies stay as Attachments, off the field: there is no file delete
in the queue, and an Artist may not delete an Attachment (findings/143). A late check of an older
copy finds it there and leaves it off.

These are the names asked for. The name on a site can differ: see decision 3.

## A slate's setup diagram

The diagram (#87) stays on the device as data. Flow PT gets its image: a PNG drawn in the browser
before each drain (`beforeDrain` in `app/sync/engine.ts`, `$lib/draw/diagramUploads.ts`), stored
as a file of the slate, `variant: 'diagram'`, and uploaded as a photo is, to the slate's
`sg_setup_diagram` field. It waits while the page is hidden or offline, as any upload does.

| what | field | note |
|---|---|---|
| the slate, the file | `filename` | `onset_diagram_<slate>_<blob>.png`, the slate's client UUID |
| | `display_name` | `Setup diagram` |
| the slate | the slate's `sg_setup_diagram` | set by the upload, checked by the verify |

An image is drawn again when what it shows changes: a shape, a camera's lens, a zoom's focal length
on a later take. The one before is taken back while unsent. Once sent, it stays as an Attachment:
when the new one is verified, one `_batch` takes the older ones off the slate's field (and puts the
newest back if it is missing), the mode in the body (recipes/009, findings/154 of the notes-media
probes). The slate shows one. A blank diagram sends nothing; one sent before stays on the field.

## How a push goes

- One `_batch` per push. One dependency level, as the runner sends it.
- Everything is checked before it is sent. A create in a batch skips the server's validation.
- A 400 code 104 "required to be unique" names no request. Every create of the batch is looked up
  by client UUID; the ones found are `duplicate`.
- A 404 names the type and id: that operation is `gone`.
- Another 400 names a field: the operations that wrote it are `invalid`. If it names none, every
  operation of the batch is `invalid` with the server's words.
- A 400 code 104 "cannot be created / can not be deleted / not editable for this user" (corpus
  findings/143): the operations of that kind are `invalid` with "This Flow PT account can't create
  Takes. Ask an Admin for the permission." Every later operation of that table and kind is
  refused the same way without being sent, for the life of the transport. Not retried.
- 401 code 102 `Token Expired` (findings/133): a new bearer, the same request once more, inside
  the same call. Any other 401 code 102 (`Token invalid`, or no detail): `unauthorized`. 400 code
  102: `unauthorized`. 429, 5xx: `failed`. 502, 504 on a write: `timeout`.
- No answer: `unreachable` when offline, or on a read. `timeout` on a write while online.

## How an upload goes

1. `beginUpload`: `GET .../<take>/<id>/sg_photos/_upload?filename=`. Above 32 MiB,
   `multipart_upload=true` and 8 MiB parts. The session expires 840 s later.
2. `uploadPart`: `PUT` to storage. No Authorization. A single PUT sends the photo's type as
   `Content-Type`. A 403 is `expired`. A multipart part's URL is minted when its bytes are ready.
3. `renewUpload`: one PUT gets a new ticket. Multipart keeps the parts sent and mints the URL of
   the next part; if the site refuses, the upload is aborted and `expired` is thrown.
4. `finishUpload`: the completion, with the ETags for multipart. The upload added the photo to the
   field beside the others, and gave it the take's project (findings/134). Then, best effort:
   find the row by file name, write the caption.
5. `verifyUpload`: find the row by file name, `GET` the stored file and read `Content-Length`
   (never `HEAD`: it is 403), compare the size, make sure the take's `sg_photos` holds it. A row
   with no bytes is deleted. Only ids are returned.

A video (`versionKind` of its type) goes the same way to another place (`takeVersions.ts`):

1. `beginUpload` finds the still's Version by client UUID, or creates it (`project`, `entity` the
   take, `code`, the client UUID, `description`). A create refused as not unique was made by an
   earlier try whose answer was lost: it is found again. Then the ticket for
   `versions/<id>/sg_uploaded_movie/_upload`, under `onset_video_<still>_<blob>.<ext>`.
2. The parts and the renewals are a photo's.
3. `finishUpload` sends `upload_data: {}`, as measured on a Version (findings/013, 022), and
   answers the Version's id.
4. `verifyUpload` finds the Version by client UUID, checks that `sg_uploaded_movie` names our file,
   fetches it and compares the size, and puts the take back in `entity` if it is not there. A
   movie with no bytes is left: the next upload replaces it.

## Shot links

A slate's VFX shot codes are text on the device and in `sg_vfx_shots`. At sync the transport also
links the slate to the Shots of the project that have those codes, in `sg_shots`, so a Shot shows
its slates in the field Flow PT adds on Shot (findings/142). `shots.ts` holds the rules,
`transport.ts` the calls.

1. A push whose create or update of a slate carries `vfxShots` tells the app (`onShots`) what it
   owes on each of those slates: every code to link, every code taken off to unlink. Then the
   batch goes as always, with no Shot in it.
2. Once the batch is applied: one `_search` of Shot, `project is <the project>` and
   `code in [<every code>]`, every page. Shot reads are not scoped by the endpoint
   (entity_types/Shot.md).
3. Per slate, a `PUT` with `{"multi_entity_update_mode": "remove", "value": [...]}` for the Shots
   of the codes the edit took off, then one with `add` for the Shots of every code it holds
   (recipes/009). `add` of a Shot already linked changes nothing (field_types/multi_entity.md).
4. The app is told what is still owed (`ShotResult`): `waiting`, codes no Shot has or whose `add`
   failed; `several`, codes more than one Shot has; `unlink`, codes whose `remove` failed.
5. `linkShots` does steps 2 and 3 for slates the server holds, from what is owed: it links what
   waits, unlinks what is owed, and looks again at the codes several Shots share without linking
   them. The app calls it when a drain ends (app/sync README).

- A code matches as Flow PT matches text: trimmed, whatever the case (field_types/text.md).
- Shot codes are not unique: a code several Shots have links them all, and is named so someone
  cleans up (Kevin, #96).
- A link someone made in Flow PT stays: only the Shots of codes taken off on the device are
  unlinked. A bare list, or the mode in the query string, would replace the field (recipes/009).
- None of it can fail a push. A write that gets no answer is owed, and made at a later sync.
- A Shot is never created, renamed or changed.

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
   (`magicHour`), not a label. No list field: its values would need an admin to change. FPT's
   `timecode` type is integer milliseconds, rendered at the site's one fixed rate, and stores no
   rate, so a 23.976 timecode cannot be kept in it; `duration` is integer minutes (corpus
   findings/145, field_types/timecode.md). Text keeps `HH:MM:SS:FF` as the stock cut fields do.
8. **A list of strings is one text,** comma-separated. An item with a comma would split.
   `vfxShots` stays text as typed; its Shots are linked beside it in `sg_shots` (Shot links).
9. **The record's name is `code`:** slate id, take number, camera model, lens model, setup labels.
   A shoot day's `code` is its date, and the date is a date field too.
10. **Notes are `sg_set_notes`.** The stock `notes` field links Note records.
11. **`templateId` is kept, as text,** in `sg_onset_template`. It is an id on the device.
12. **A key with no mapping is refused, not dropped.** The operation needs attention and says
    which key.
13. **A still is an Attachment found by its file name,** `onset_<still>_<blob>.<ext>`. The create of
    a still sends nothing: an Attachment made before its file can never get one. The still's
    remote id is `still:{"take":…,"capturedAt":…,"caption":…}`: what the upload needs, since the
    runner hands the upload only the still's remote id. A custom field on Attachment can now be
    made (findings/135), and was weighed: it would need a `PUT` after the upload, so for a moment
    the row would exist without its id and a retry could upload twice, and it would need an
    Admin and the right to update Attachments, which an Artist lacks (findings/143). The file name
    is set by the upload itself. Kept. The name holds only lowercase, digits, `-` and `_`: the
    server stores a space as `_` and filters ignore case (findings/135).
14. **The capture time of a still is in its display name.** See 13 for why not a custom field.
15. **Photos go straight to the field.** A second upload to it adds (findings/134), so nothing is
    read before or put back after. The check still adds a photo the field lacks, in `add` mode.
16. **A row with no bytes is deleted by the check.** It cannot be repaired.
17. **The `image` thumbnail is not set.** It needs a second upload of the same bytes. Not cheap.
18. **32 MiB in one PUT, 8 MiB parts above.** One PUT took 1000 MB (findings/140), so size does
    not force parts; resuming does. A failed PUT restarts from zero, and a PUT must finish inside
    its URL's 900 s. At 1 Mbit/s on set Wi-Fi, 32 MiB takes 4.5 minutes; 100 MB would take 13, close
    to the URL's end, and a drop near the end would cost all of it. Every still format we take is
    under 32 MiB: a photo is one PUT, a clip goes in parts.
19. **The transport never creates fields.** `checkSetup` does. The transport reads the cache, or
    the schema, and throws `failed` with what is missing.
20. **A resolution is cached until a write names a field the site lacks.** Then it is read again.
    `checkSetup` always reads and rewrites it.
21. **A created row is not read back.** Every create carries the project, so the row is readable.
22. **The bearer is renewed a minute before its `exp`, and once on `Token Expired`.** It worked
    20 s before `exp` and not 5 s after (findings/133). The retry is inside the call, so the
    runner counts no attempt. `Token invalid`, or no detail, is `unauthorized`: minting may not help.
23. **No permission check before syncing.** Kevin's call for v1. Set Up Fields tries and stops at
    the first refusal; a push refused for rights needs attention in plain words, and that kind of
    change waits for the session (How a push goes).
24. **A row is never revived.** A deleted row frees its client UUID, and reviving it once another
    row took that UUID fails, 400 code 104 naming a Postgres transaction, and the row stays
    deleted (findings/136). Undoing a delete on the device sends a create: a new row under the same
    client UUID. A lookup sees live rows only.
25. **A link through a link is read in the same search.** `sg_slate.Slate.sg_onset_uuid` reaches a
    custom field through an `sg_` entity field (findings/138), so a take's slate comes back as its
    client UUID with no second request. A photo's take comes from its `attachment_links`
    (findings/134), also with no second request.
26. **A set reference is a row of the project custom entity "Set Reference", linked to its slate**
    (Kevin, 2026-11-17). Each studio enables the slot and names it in the web interface, as for
    Take: no call does (findings/114, findings/122, 400 code 111). Until it is there the setup check
    is not ready and nothing syncs; the sync sheet names it. A site set up before the reference log
    needs it too: a cached resolution without it is read again.
27. **The kind of a set reference is text:** a built-in key (`hdri360`), as an enum keeps its key
    (decision 7), or a project's own kind as typed. No list field: a project adds kinds, and a list
    would need an admin for each.
28. **Shot links go by single `PUT`, after the batch.** The `multi_entity_update_mode` wrapper is
    measured on `PUT /entity/<type>/<id>` only; inside a `_batch` update it is not. A link in the
    batch would also let one dead Shot id refuse the whole batch ("Value is not legal",
    recipes/002). So the slate lands first, and its links follow.
29. **A code with no Shot waits, and is asked about again.** The device keeps it (app/sync), and a
    later sync links it once a Shot has it (Kevin, #96). A code whose Shot is there but unlinked
    is never linked again: someone unlinked it in Flow PT on purpose.
30. **A code several Shots have links them all, and is listed** (Kevin, #96). Shot codes are not
    unique (entity_types/Shot.md), and nothing on the device tells them apart. Later syncs look at
    the code again, never linking: it leaves the list once one Shot or none has it.
31. **An unlink that fails is owed, and made at a later sync,** until Flow PT matches the slate
    (Kevin, #96). It is dropped once the slate holds the code again.
32. **A video goes up as a Version linked to its take** (Kevin, 2026-11-17, #94), for Flow PT's
    player and transcode. A photo stays an Attachment. On the device both are stills; the file's
    type decides, so nothing changes in the store or the outbox. The still's create sends nothing,
    as for a photo; the Version is made when its file starts to go up, so an empty Version waits
    only as long as an upload does. `versions.ts` lists the kinds: an audio note (#89) is one line
    there and goes through the same calls.
33. **Version gets our client UUID field** (`sg_onset_uuid`, unique), made by Set Up Fields like
    every other: `code` is not unique (entity_types/Version.md), and a retried create must be
    refused, not made twice (findings/127). A site whose resolution was cached before this reads
    its schema again and is not ready until an admin runs Set Up Fields once more.
34. **A still is looked for as an Attachment first, then as a Version.** A photo costs no more
    requests than before. The Version's file name starts `onset_video_`, never as a photo's
    `onset_<id>_`, so a photo's lookup by file name never finds a video's file, nor the two
    Attachments the server adds after it (findings/123).
35. **Deleting a video deletes its Version only.** The movie and the server's transcodes are
    Attachments of the Version; what Flow PT does with them then is not measured.

## Where FPT did not fit the contract

1. **A checkbox has no null.** An unticked box reads as a missing value. Settled in the model:
   `sameValue` treats `false` as missing (model README, decision 37).
2. **The server rounds.** A date_time keeps seconds, a float six decimals, a text loses outer
   spaces. A local value with more than that reads back different, and the next edit of that
   field shows a conflict. Settled for times: `app.now()` stamps to the second and `sameValue`
   compares two timestamps by moment (model README, decision 38). Worse, the path picks the
   second: POST and PUT round `.999` up, a `_batch` create truncates (findings/145). `convert.ts`
   cuts every time to the whole second and checks it, so no fraction is ever sent.
3. **A batch refusal names no request.** See "How a push goes".
4. **No kind for "the site is not set up".** It is `failed`. Gate the runner on `ready`.
   **Nor for "this account may not".** It is `invalid` with plain words, and the transport holds
   back that kind of change itself.
5. **A failed `fetch` does not say whether the request left.** Offline is `unreachable`. Online, a
   write is `timeout` and is checked; a read is `unreachable` and stops the drain.
6. **`finishUpload` and `verifyUpload` write.** They link, caption, and delete an empty row.

## Corpus gaps, as probe questions

Closed on 2026-11-11 by probes 132–145 (`~/dev/sg-groundtruth`, corpus findings/132–145):

| was | answer | finding |
|---|---|---|
| A non-admin creating a field | Artist: 500 code 105 "User doesn't have permission to create a Field"; Admin: 201 | 132 |
| A bearer past its exp, or forged | 401 code 102 `Unauthorized`; `detail` `Token Expired`, `Token invalid` or null | 133 |
| A second upload to a multi-entity Attachment field | adds; the Attachment gets the row's project and `attachment_links` | 134 |
| A custom field on Attachment; `filename` | creatable; 200 characters kept, a space stored as `_`; `is`, `starts_with` ignore case | 135 |
| Does a deleted row keep its unique value | no; reviving it after reuse fails, 400 code 104 | 136 |
| Numeric string and `created_at` in a `_batch` create | as a single POST, and wider | 137 |
| Dotted read through an `sg_` link to a custom field | works, two hops too | 138 |
| Multipart lifetime, part `timestamp` | alive at 1230 s; `timestamp` is part of the key | 139 |
| Largest single PUT | 1000 MB taken, no limit seen | 140 |
| Stored file's GET under CORS | `Content-Length`, Range, cancel all fine; HEAD is 403 | 141 |
| The field a link makes on its target | named as in "Reverse fields"; cannot be avoided; deleting it deletes the link | 142 |
| Non-admin rows | Artist may not create, edit or delete custom rows, nor delete an Attachment | 143 |
| A rate limit | none at 28 requests a second for 10 s | 144 |
| date_time precision, timecode, duration | whole seconds, rounded or truncated by path; ms; minutes | 145 |

Still open:

1. What Manager and Vendor accounts get on a field create, and on rows (probes 132, 143: nobody
   in those groups had impersonation on). The tolerant match in `errors.ts` covers their words.
2. Does `unique: true` span projects (probe 136 had one writable project)? Our UUIDs are unique
   across the site, so the answer changes nothing unless a site has a rule we do not know.
3. What a rate limit answers, when one bites.
4. What the server names an added field for a second link from the same source to the same
   target, and how it pluralises a display name outside the custom slots measured.
5. Whether a part PUT's `Content-Type` sets the stored type of a multipart file.
6. A real browser run of the whole upload (the measurements are a process reading headers).
7. Whether `{"multi_entity_update_mode": "add" | "remove", "value": [...]}` works inside a `_batch`
   update as it does on a single `PUT`, and whether two updates of one record in one batch apply
   in order. Measured since, yes to both, in findings/154 of the notes-media probes (sg-groundtruth
   `107-notes-media-probes`, not in this corpus yet): the annotated copy (#86) and the diagram
   image (#87) use it. Shot links are still single `PUT`s after the batch (decision 28).
8. The name of the field a multi_entity on Slate adds on Shot. Predicted `slate_sg_shots_slates`
   from the measured `version_sg_ai_generated_from_versions` (field_types/multi_entity.md) and the
   slot form of findings/142; Slate itself was not measured.
9. A Version whose `entity` is a custom entity row, as a Take is: does the create take it, does it
   read back, does the web interface show the Version on the Take. A probe in sg-groundtruth is
   measuring it (2026-11-17). Until it reports, the video path is built on the fake site, and the
   check puts `entity` back if a read shows it missing.
10. What Flow PT does with a Version's movie and transcode Attachments when the Version is deleted.
11. The largest video a browser on an iPad sends: one PUT of 1000 MB was measured from a script
   (findings/140); a browser upload is not measured.
12. The name of the field `Slate.sg_setup_diagram` (multi-entity to Attachment, #87) adds on
   Attachment. Predicted `slate_sg_setup_diagram_slates`, as for `sg_shots` (8); not measured.

## On the probed site, read 2026-11-11

Read only: `GET /schema` and `GET /schema/<Type>/fields`, nothing written.

All seven entities resolve. ShootDay, Slate and Camera are on. Take, Lens, Camera Setup and
Lighting Setup are each one custom entity with that display name; the lens entity is shown as
"Lens". Take, Camera Setup and Lighting Setup have no field of the site's own yet.

Of the 76 fields we wanted then (79 with `sg_take_type`, #92, `sg_shots`, #96, and `sg_take_tail`, #108), five are already there with a fitting type and are used as they are:
`ShootDay.sg_shoot_date`, `Slate.sg_shoot_day`, `Slate.sg_set_notes`,
`Camera.sg_camera_serial_number`, `Lens.sg_lens_serial_number`. Two names are held by a field of
another type, so ours step aside: `ShootDay.sg_onset_location` and `Lens.sg_onset_focal_length`.
The other 69 are created under their plain names.

Set Reference came after this read (#93). The probed site needs that slot enabled and named before
sync goes on; Set Up Fields then makes its eight fields.

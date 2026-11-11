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
| `still` | Attachment, in `sg_photos` on the take | file name |
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
| `multi_entity` | `<source slug>_<field>_<source slug>s`: `Take.sg_photos` adds `Attachment.custom_entity09_sg_photos_custom_entity09s` |

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

Every entity also gets `sg_onset_uuid` (text, unique): the record id on the device. The take gets
`sg_photos` (multi-entity to Attachment). `created_at` of a take is its `startedAt`.

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

**still** (an Attachment)

| key | field | note |
|---|---|---|
| `takeId` | the take's `sg_photos` | set by the upload |
| `capturedAt` | `display_name` | `Photo 2026-11-11T09:01:02.000Z` |
| `caption` | `description` | |
| the still id and the blob id | `filename` | `onset_<still>_<blob>.jpg`, lowercase, no space. Read-only after upload |
| the take, found back | `attachment_links` | set by the upload |

These are the names asked for. The name on a site can differ: see decision 3.

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

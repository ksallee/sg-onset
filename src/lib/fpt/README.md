# fpt

Flow Production Tracking: the mapping of our records to a site's entities and fields, and the
outbox's `Transport` over the REST API. The browser calls `/api/v1` itself with a bearer. The app
wires it in `src/lib/app/sync/` (its README).

Every behaviour relied on is from `~/dev/sg-groundtruth/corpus`. The comments name the entries.

## Modules

| module | pure | what it does |
|---|---|---|
| `names.ts` | yes | Display name to `sg_` name, as the server derives it. Type to REST slug. |
| `mapping.ts` | yes | The mapping, derived from the catalogue. Entity types per scope. Every field the app wants (`wantedFields`). |
| `naming.ts` | yes | The names an admin picks (#111): what each custom entity is called, what each field is. The default is the app's own. As text, problems, changes. |
| `convert.ts` | yes | One value, both ways, per FPT data type. |
| `schema.ts` | yes | Entities by display name, the field plan, the `Resolution` kept per site. |
| `payload.ts` | yes | A record to the `data` of a create or update. A row back to our keys. |
| `stills.ts` | yes | A still's remote id, file name and display name. |
| `diagrams.ts` | yes | A slate's setup diagram image: its file name and display name. |
| `versions.ts` | yes | A take's media that go up as a Version (a video, an audio note): kind, file name, name, create, the file read back. |
| `takeVersions.ts` | no | The Version of a take's media: found by client UUID, made, its file checked. |
| `shots.ts` | yes | A slate's VFX shot codes: as typed, as Flow PT matches them, the Shot search, the in-place write. |
| `referenceSlates.ts` | yes | A set reference's Slates field: what to set it to, if anything (#107). |
| `setShots.ts` | yes | One Set Shot per code: its key, the lookup, what to file, what to match, what a slate links (`derivedShots`). |
| `shotNote.ts` | yes | The Note on a Shot (#97) from the records as Flow PT holds them: what was captured, as text and as ids, and the reply with what a sync added. |
| `notePlan.ts` | yes | The Note's key and lookup, who it is to, and what a sync writes: the Note, a rewrite and a reply, or nothing. |
| `shotNotes.ts` | no | `writeShotNotes`: the reads and writes of the Notes on Shots. Reads Flow PT only, so #106 runs it from a desktop. |
| `actionMenu.ts` | yes | The Action Menu Item "Send set data to artists" (#106): its URL, the lookup by title and URL, what Set Up Fields makes or adds the project to. |
| `sendPlan.ts` | yes | What a run of the action covers (`sendScope`) and what it did per Shot (`shotReports`). |
| `setShotLinks.ts` | no | The calls of the Set Shot links, shared by the sync and the action: read by key, match once, read and write a slate's links. |
| `sendSetData.ts` | no | `previewSend`, `sendSetData`: the action's reads and writes, from Flow PT only, with the person's session. |
| `lists.ts` | yes | The shared lists (#110): templates, reference kinds and rigs (#138) as JSON in a text field of the Project. Read, write, apply a push's operations, check they landed. |
| `errors.ts` | yes | What a refusal or a missing answer means. |
| `token.ts` | yes | The bearer's `exp`, and when to renew it. |
| `uploadPlan.ts` | yes | Upload sizes, URL life, the completion body. |
| `cache.ts` | port | `KeyValue`: where a site's resolution is kept. Memory and `localStorage` forms. |
| `api.ts` | no | The calls. The only module that calls `fetch`. Uses `sg-widgets-core`'s clients. |
| `setup.ts` | no | `checkSetup`: the readiness report, and field creation. `setUpNames`, `readNamesReview`: the names on the project (#111). |
| `transport.ts` | no | `createFptTransport`: the `Transport`, with `linkShots` and `linkReferenceSlates`. |
| `fakeFpt.ts`, `testkit.ts` | no | A site behind a `fetch`, in the corpus's shapes. For tests. |
| `golden.test.ts` | | Every request the app sends, on the fake site, against `golden.requests.json`; and the same under other names (#111). |

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
- `projectId` (#111, "The names an admin picks"): the names the project keeps apply. `naming`
  overrides them. With neither, the default names. A transport has a project: it reads the project's
  names once (decision 84).

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
| `reference` | custom, "Set Reference" | display name. Optional: without it the references wait on the device |
| `setShot` | custom, "Set Shot", in `sg_set_shots` on the slate | display name. Optional. One row per VFX shot code, made at sync, no table on the device |
| `still` | Attachment, in `sg_photos` on the take | file name |
| `still` with a video or audio file | Version, `entity` the take, the file in `sg_uploaded_movie` | client UUID |
| `project` | Project | given: `projectId` |
| (none) | Shot, in `sg_shots` on the Set Shot and on the slate | code, in the project. Read and linked, never written |
| a slate's setup diagram (#87) | Attachment, in `sg_setup_diagram` on the slate | file name |
| (none) | Note, one per Shot, with Notes on Shots on (#97) | `sg_onset_key`, in the project. Optional |
| (none) | Reply, on that Note, when a sync adds to it | written, never read |
| (none) | Task, of the Shot: who is assigned | read only |
| (none) | ActionMenuItem "Send set data to artists", on Shot and on Set Shot (#106) | title and URL. Made by Set Up Fields, one per entity type and deploy, holding each project that ran it |
| `template`, `referenceKind`, `rig` | Project, JSON in `sg_onset_templates`, `sg_onset_reference_kinds` and `sg_onset_rigs` | the entry's client UUID, in the list. Optional |

Custom entities are matched trimmed and whatever the case, among `CustomEntityNN` types only.
Never by slot number. The display names are the default; an admin may pick others (#111).

## The setup report

```ts
type SetupReport = {
	ready: boolean; // every required entity found, every field of theirs there
	site: string;
	entities: {
		scope: EntityScope;
		kind: 'builtin' | 'custom';
		displayName: string; // custom: the name to give the entity
		status: 'found' | 'missing' | 'ambiguous';
		entityType?: string; // 'CustomEntity09'; for a built-in type also when missing
		candidates?: string[]; // ambiguous: every type with that display name
		optional?: true; // the site syncs without it: Set Shot, Set Reference (Kevin, #117)
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
	action?: {
		// the Action Menu Item of #106; absent when no project was given
		title: string; // 'Send set data to artists'
		url: string; // '<origin>/action/send-set-data'
		items: { entityType: string; status: 'present' | 'added' | 'missing' | 'needsAdmin' | 'failed'; reason?: string }[];
	};
};
```

- `missing` entity: an admin enables it in the web interface. No API call does. A missing optional
  entity is a note: the report is ready, nothing is planned on it or for the links to it, and what
  needs it waits (decisions 44 and 60).
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
| `multi_entity` | `<source slug>_<field>_<source slug>s`: `Take.sg_photos` adds `Attachment.custom_entity09_sg_photos_custom_entity09s`, `Slate.sg_shots` adds `Shot.slate_sg_shots_slates`, shown "Slates <-> Shots"; `Slate.sg_set_shots` adds `slate_sg_set_shots_slates` on Set Shot, shown "Slates <-> Set Shots"; `Set Shot.sg_shots` adds `Shot.custom_entityNN_sg_shots_custom_entityNNs`, shown "Set Shots <-> Shots" |

- `planFields` predicts each name (`names.ts`, `reverseField`), from what the site calls the
  source entity. The multi_entity rule was measured on custom slots and on Slate (findings/142,
  155). The plural of a built-in or of "Lens" is our English rule; the corpus measured custom
  slots.
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

Every entity of the device also gets `sg_onset_uuid` (text, unique): the record id on the device.
So does Version, where a take's videos go. The take gets `sg_photos` (multi-entity to Attachment).
The slate gets `sg_shots`, "Shots" (multi-entity to Shot), and `sg_set_shots`, "Set Shots"
(multi-entity to Set Shot): see "Set Shots and Shot links"; and `sg_setup_diagram`, "Setup
Diagram" (multi-entity to Attachment): see "A slate's setup diagram". The set reference gets
`sg_slates`, "Slates" (multi-entity to Slate): see "The slates of a set reference". `created_at` of
a take is its `startedAt`, of a set reference its `loggedAt`.

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
| `cameraMount` | `sg_rig` | text | the rig: a built-in rig as its English label (`Steadicam`), or a project rig as typed (#138) |
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
| `vfxShots` | `sg_vfx_shots` | text | as typed; a Set Shot per code goes to `sg_set_shots`, their Shots to `sg_shots` |
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
| `cameraMount` | `sg_rig` | text | the rig: a built-in rig as its English label, or a project rig as typed; a new take gets the setup's (#138) |
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
| the slates it shows on | `sg_slates` | multi_entity | linked at sync |

`Set Reference.sg_slate` adds `Slate.sg_set_references`, shown "Set Reference <-> Slate"
(findings/142), so a slate in Flow PT lists the references logged on it. `Set Reference.sg_slates`
adds `Slate.custom_entityNN_sg_slates_custom_entityNNs`, shown "Set References <-> Slates", so a
slate lists every reference it shows, the lighting setup's HDRIs included.

**setShot** (a Set Shot, one row per VFX shot code in the project; no record on the device)

| what | field | type | note |
|---|---|---|---|
| the project | `project` | entity | |
| the code as first typed | `code` | text | its name. Anyone may rename it: nothing moves |
| the key | `sg_onset_key`, "Onset Key" | text, unique | `<project id>:<code, trimmed, lowercase>` |
| the real Shots | `sg_shots`, "Shots" | multi_entity to Shot | set by the app's match, or by hand in Flow PT |
| matched | `sg_onset_matched`, "Onset Matched" | checkbox | ticked when the app matched it: never again |

`Slate.sg_set_shots` adds `slate_sg_set_shots_slates` on Set Shot, so a Set Shot lists its slates.
`Set Shot.sg_shots` adds `custom_entityNN_sg_shots_custom_entityNNs` on Shot, so a Shot lists its
Set Shots, and from them the slates (findings/142).

**Note** (one per Shot, with Notes on Shots on, #97; no record on the device)

| what | field | type | note |
|---|---|---|---|
| the project | `project` | entity | |
| the title | `subject` | text | `Set data for <Shot code>` |
| the body | `content` | text | see "Notes on Shots" |
| the Shot | `note_links` | multi_entity | `[Shot]` |
| the Shot's Tasks | `tasks` | multi_entity | added to, never taken from |
| who it is to | `addressings_to` | multi_entity | the people and Groups on the Shot's Tasks; added to, never taken from |
| the key | `sg_onset_key`, "Onset Key" | text, unique | `<project id>:shot:<Shot id>` |
| what it lists | `sg_onset_captured`, "Onset Captured" | text | the ids: `take:<slate>:<number>`, `cleanPlate.tail:<slate>:<number>`, `reference:<id>`, `photo:<id>` |

Set Up Fields makes the two Note fields on every site. They are optional: a site without them syncs
the rest, and the Notes wait.

**Project** (the shared lists, #110; the Project is the one the device syncs with, never created)

| what | field | type | note |
|---|---|---|---|
| the templates of the project | `sg_onset_templates`, "Onset Templates" | text | JSON: `{"list":"template","version":1,"entries":[{"id","name","scope","values"}]}` |
| the kinds of set reference it adds | `sg_onset_reference_kinds`, "Onset Reference Kinds" | text | JSON: `{"list":"referenceKind","version":1,"entries":[{"id","name"}]}` |
| the rigs it adds (#138) | `sg_onset_rigs`, "Onset Rigs" | text | JSON: `{"list":"rig","version":1,"entries":[{"id","name"}]}` |

A template's values are in our field form, as on the device: a length in metres, a rational as
`{num, den}`. Only SG OnSet reads them. Set Up Fields makes the three fields on every site. They
are optional, and each list follows its own field (#138): a list whose field the site lacks waits
on the device, and the rest syncs.

**still** (an Attachment)

| key | field | note |
|---|---|---|
| `takeId` | the take's `sg_photos` | set by the upload |
| `capturedAt` | `display_name` | `Photo 2026-11-11T09:01:02.000Z` |
| `caption` | `description` | |
| the still id and the blob id | `filename` | `onset_<still>_<blob>.jpg`, lowercase, no space. Read-only after upload |
| the take, found back | `attachment_links` | set by the upload |

**still with a video or audio file** (a Version, decisions 32 and 57)

| key | field | note |
|---|---|---|
| the still id | `sg_onset_uuid` | unique, made by Set Up Fields |
| `takeId` | `entity` | the take. Read back by the check, put back if missing |
| `capturedAt` | `code` | `Video 2026-11-11T09:01:02Z`, `Audio note 2026-11-11T09:01:02Z`. Not unique: the client UUID is the key |
| `caption` | `description` | |
| the file | `sg_uploaded_movie` | `onset_video_<still>_<blob>.mov`, `onset_audio_<still>_<blob>.m4a`. One file; a new upload replaces it |
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

These are the names asked for. The name on a site can differ: see decision 3, and "The names an
admin picks".

## The names an admin picks

Set Up Fields looks for each custom entity by a fixed display name and asks for each field by a
fixed name. A studio's admin may want others, or fields the site has already (#111). `naming.ts`
holds what an admin picks, a `Naming`:

```ts
type Naming = {
	entities?: { take?: string; lens?: string; cameraSetup?: string; lightingSetup?: string; reference?: string; setShot?: string };
	fields?: Record<string, { display: string } | { field: string }>; // by 'take.sg_focal_length'
};
```

- A custom entity is looked for under the name picked, alone. Left out, under the app's own.
- A field is keyed by where it is (a scope, `version`, `note` or `project`) and its default name.
  `display`: the field that display name makes, found or created, stepping aside to "Onset <name>"
  as the default does (decision 3). `field`: a field the site has, used as it is, never created;
  blocked when it is missing or does not fit. Left out, the app's own display name.
- The default naming is empty. It plans exactly what the app always did.

Only the planning reads it: `resolveEntities` and `planFields` (`schema.ts`). The resolution they
make holds each field's name on the site by its default name, as it always did, and every call
reads names from it. So the sync, the setup check, the Notes on Shots and the action of #106 read
the names picked with no change of their own. The resolution keeps the naming it was made with
(absent for the default, so one kept from before reads as it is). The words that tell an admin
which entity to enable say the name picked.

`golden.test.ts` proves both ends: with the default naming, every request of Set Up Fields, a push
of every key of every scope, the uploads, reads, the shared lists (#110), links, Notes, the action
and deletes is the one `golden.requests.json` recorded before the naming existed; with every field and entity renamed, it
is the same list under the new names, less the creates of the fields mapped to fields the site has.

### Where the names live, and how an admin changes them

Kevin decided, 2026-11-17: the names live as JSON in one fixed text field of the Project,
`sg_onset_naming`, "Onset Naming", never renamed; a site without it uses today's names. Once the
project has synced, the names in use stay as they are; moving data is done in Flow PT.

```json
{"app":"sg-onset","naming":1,"entities":{"take":"Shot Take"},"fields":{"take.sg_t_stop":{"display":"Studio T-Stop"}}}
```

- **Read.** A check with the linked project (`checkSetup({ projectId })`, the engine's check) reads
  the type list and Project's fields first, then the field's value, named, and plans under those
  names. The page of #106 does the same for the project Flow PT named. A transport reads them once,
  at its first call that needs the schema, with one `GET /schema/Project/fields/sg_onset_naming`
  (404 on a site without it, findings/157), and reads the schema again if they differ from the ones
  it kept (decision 84). Names of a later version stop it all (decision 82).
- **Review.** Setup's Names row opens a page (`app/sync/names.ts`, `NamesPage.svelte`). It reads the
  site once (`readNamesReview`): the fields of every custom entity, what the project keeps, whether
  the project has synced, whether this account may save (findings/159). Each change is planned on
  the device under the names on the page: what is there, what Set Up Fields would make, the fields
  of the site of the right type to pick, and the problems (`namingProblems`). Nothing is sent.
- **Change.** Per custom entity, the name to look for, typed or picked from the site's. Per field:
  keep, rename, or a field of the site. A prefix for all at once (`withPrefix`). Once the project has
  synced, an entity found and a field there under the names the project keeps cannot change.
- **File.** Export writes the page's names as the JSON above. Import puts a file's names on the
  page; what is in use keeps the project's names, and the page says how many.
- **Save.** Review Changes shows the names to save and what Set Up Fields will make, as before. Set
  Up Fields (`setUpNames`) makes `sg_onset_naming` if the site has none, makes the fields under the
  names, then writes the names to the project and reads them back, comparing the parsed value
  (findings/158). An Artist is refused the create (500 code 105) and the write (400 code 104): the
  page says only an Admin can save. The names are kept only if the site is ready under them, or was
  not under the names the project kept (decision 83).

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

A video or an audio note (`versionKind` of its type) goes the same way to another place (`takeVersions.ts`):

1. `beginUpload` finds the still's Version by client UUID, or creates it (`project`, `entity` the
   take, `code`, the client UUID, `description`). A create refused as not unique was made by an
   earlier try whose answer was lost: it is found again. Then the ticket for
   `versions/<id>/sg_uploaded_movie/_upload`, under `onset_<kind>_<still>_<blob>.<ext>`.
2. The parts and the renewals are a photo's.
3. `finishUpload` sends `upload_data: {}`, as measured on a Version (findings/013, 022), and
   answers the Version's id.
4. `verifyUpload` finds the Version by client UUID, checks that `sg_uploaded_movie` names our file,
   fetches it and compares the size, and puts the take back in `entity` if it is not there. A
   movie with no bytes is left: the next upload replaces it.

## Set Shots and Shot links

A slate's VFX shot codes are text on the device and in `sg_vfx_shots`. At the shoot the Shots
rarely exist yet: editorial makes them at turnover, often after wrap (Kevin, #102). So at sync each
code is filed as a Set Shot, one row per code in the project, and the slate links its Set Shots in
`sg_set_shots`.

Links to Shots are made in one place, the Set Shot's `sg_shots`: by the app's match on the code,
once, or by a person in Flow PT's grid, which covers the time after wrap. The slate's own
`sg_shots` (#96) is derived: the Shots of its Set Shots, so artists stay one click from the slate.
A wrong link is fixed on the Set Shot; one made by hand on the slate is overwritten at the next
sync. Nothing about links is kept on the device. `setShots.ts` holds the rules, `setShotLinks.ts`
and `transport.ts` the calls (Kevin, 2026-11-17, replacing #96's link rules). The Action Menu Item
of #106 runs the same rules from a desktop ("Send set data to artists").

`linkShots` takes slates Flow PT holds, each with the codes it holds now:

1. One search of the slates, by id, for what they link now; one of Set Shot, `project is <the
   project>` and `sg_onset_key in [<the key of every code>]`.
2. Every code with no Set Shot is filed: one `_batch` of creates, each with the project, the code as
   typed and the key. If the batch is refused or gets no answer, the codes are looked up again
   (decision 37).
3. Every Set Shot never matched that holds no Shot: one search of Shot, `project is <the project>`
   and `code in [<their codes>]`, every page (Shot reads are not scoped by the endpoint,
   entity_types/Shot.md). Per Set Shot some Shot has the code of, one `_batch` of two updates: `add`
   the Shots to its `sg_shots`, tick `sg_onset_matched`. Together or not at all, in that order
   (findings/154).
4. Per slate, each field that differs is set whole, one `PUT` a field, with
   `{"multi_entity_update_mode": "set", "value": [...]}` (recipes/009): `sg_set_shots` to the Set
   Shots of its codes, `sg_shots` to every Shot of those Set Shots (`slateWrites`, `derivedShots`).
5. The answer is, per slate, the codes whose Set Shot holds several Shots of that code: for the
   sync sheet, never kept.

A push whose create or update of a slate carries `vfxShots` runs it for those slates once its batch
has landed. The app runs it for every slate of the project Flow PT holds when a drain ends
(app/sync README). On a site without Set Shot it does nothing and answers nothing: the links wait.

- A code matches as Flow PT matches text: trimmed, whatever the case (field_types/text.md). The key
  holds it so, and a unique field compares the same way (findings/127).
- Shot codes are not unique: a match takes every Shot with the code, and the code is named so
  someone cleans up (Kevin, #96).
- None of it can fail a push. What did not land is worked out again at the next sync.
- A Shot is never created, renamed or changed. A Set Shot is created, matched once, never renamed,
  never deleted.

## The slates of a set reference

An HDRI 360, a 360 video or an HDR reference shows on every slate of its slate's lighting setup,
now or later; any other kind on its own slate (#107, lib/references README). In Flow PT the Set
Reference links all of them in `sg_slates`, so each slate and its Shots reach it. `sg_slate` stays
the slate it was logged on. The field is derived, as a slate's Shots are (decisions 58 and 59):
`referenceSlates.ts` holds the rule, `app/sync/referenceSlates.ts` the slates from the device,
`transport.ts` the calls.

1. When a drain ends, before the slates and their Notes (app/sync README, decision 14), the app
   works out from the records on the device the slates each reference Flow PT holds shows on, by
   Flow PT id.
2. The transport reads what the references' `sg_slates` hold now, one search per 500.
3. Per reference that differs, a `PUT` with `{"multi_entity_update_mode": "set", "value": [...]}`
   (recipes/009). A refusal is that reference's alone; no answer stops the rest.

- Nothing is kept on the device. A slate made on the lighting setup, a slate moved to another, a
  reference given another kind: each shows at the next sync.
- A slate linked by hand in Flow PT is overwritten. A slate deleted leaves the field by itself:
  Flow PT drops a deleted row from a multi-entity list (field_types/multi_entity.md).
- A slate Flow PT does not hold yet is left out, and added at a later sync.
- A reference whose row Flow PT no longer has is skipped: its delete is the outbox's business.
- The Note on a Shot reads a reference's slates from `sg_slate` and `sg_slates` (`shotNote.ts`), so
  a lighting reference is listed on every Shot of its lighting setup's slates.
- On a site without Set Reference nothing is read or written (decision 60). The references wait on
  the device, and their Slates are set at the first sync after they go up.

## Notes on Shots

With Notes on Shots on for the project (app/sync README), when a drain ends and the slates are
brought in line, the Shots they reach through their Set Shots each get one Note listing what was
captured for them (#97). Kevin decided, 2026-11-17: the Note is from whoever syncs; a sync with
nothing new for a Shot writes nothing; when a later sync adds material, the Note is rewritten in
place and a short Reply says what was added; at each sync that writes the Note or a Reply, people
newly assigned to the Shot's Tasks are added, and nobody is removed.

`writeNotes` takes the Shot ids and reads everything from Flow PT, nothing from the device:

1. The Shots by id, in the project, for their codes. The Set Shots holding them (`sg_shots in`),
   the slates of those Set Shots (`sg_set_shots in`), their takes and references (`sg_slate in`),
   the Attachments in the takes' photos fields (`id in`). The Shots' Tasks (`entity in`, in the
   project), with `task_assignees`. The Notes already there, by key. Lists of more than 500 go in
   several searches.
2. Per Shot, `shotNote.ts` works out what was captured: the slates are those whose Set Shots hold
   the Shot (the slate's own Shots field is derived from them, #102). `notePlan.ts` decides:
   nothing captured, no Note; no Note yet, one `POST /entity/notes`; the Note lists less than was
   captured, one `PUT` of the Note, then one `POST /entity/replies`; otherwise nothing.
3. Never throws. No answer or no session stops the writes; a refusal is that Shot's alone. What did
   not land is worked out again at the next sync.

On a site without Set Reference (decision 60) the references are not searched: the Note lists what
Flow PT holds, which is none. Once they go up, the next sync that writes adds them, with a Reply.

A sample, for a Shot with two slates. The Note sits in a small space in Flow PT (Kevin,
2026-11-17): short headings, one entry a line, no intro, since the subject names the Shot.

```
Subject: Set data for SMP_042_0010

Elements
Clean plate: 42A take 10
Clean plate tail: 42B take 2
Balls and chart tail: 42A take 3

Takes
42A: 1, 2, 3, 10
42B: 1, 2

References
HDRI 360: HDRI_0412
HDRI 360: HDRI_0413
Witness camera: WIT_A001

Photos: 3
```

And the Reply after a later sync that added a clean plate at the tail of take 11, take 12, an
HDRI and two photos. A take said as an element take is not said again:

```
Added:
Clean plate tail: 42A take 11
42A take 12
HDRI 360: HDRI_0414
2 photos
```

The words are in the message catalogue, `sync.note.*`, always English.

## Send set data to artists

Shots are made at turnover, after wrap, when nobody syncs any more (#106). So Set Up Fields adds an
Action Menu Item, **Send set data to artists**, on Shot and on Set Shot (when its slot is
enabled), for the linked Flow PT project. Whoever links the Set Shots at turnover selects rows in
Flow PT's web interface and runs it. Kevin decided, 2026-11-17: build it; without it the
after-wrap links and Notes do not happen.

What Flow PT sends (findings/156, probe 156 in Chrome): a new tab posts
`application/x-www-form-urlencoded` to the item's URL, even when set to json, with `Origin: null`,
`Sec-Fetch-Site: cross-site`, no `Referer` and no credential. The form holds `selected_ids`, `ids`
(every row on the page), `entity_type`, `project_id`, `project_name`, `server_hostname`, `user_id`,
`user_login`, `session_uuid`, and the page's columns and sort.

1. **The item.** `actionMenu.ts`, called by `checkSetup` with `actionMenu: { projectId, url }`.
   Looked for by title and URL; per entity type, a row of ours naming the project is there, one
   for other projects gets the project added (`multi_entity_update_mode: add`), none is created
   with `title`, `url`, `entity_type` and `projects`, nothing else. The URL is the deploy's own
   origin and `/action/send-set-data`, so a deploy of a studio's own points at itself. The check
   after linking only looks; Set Up Fields makes it. An Artist is refused (400 code 104): the line
   says an admin must. It decides nothing about readiness.
2. **The route.** `POST /action/send-set-data` (`$lib/server/action-route.ts`,
   `$lib/send/request.ts`) reads the form, 1 MiB at most, keeps `selected_ids`, `entity_type`,
   `project_id` and `server_hostname`, checks them (ids are integers, 500 at most; the type is
   `Shot` or a `CustomEntityNN` slot; the host passes the sign-in allowlist, `FPT_HOSTS` and
   `FPT_EXTRA_HOSTS`), and answers 303 to `/send-set-data?site=&project=&type=&ids=`. The login,
   the user id, the session id and the rest of the form are dropped and never logged. A problem
   is a 303 to the page with `?problem=` and nothing else. SvelteKit's own check refuses a form
   from another site, so it is off and `hooks.server.ts` runs the same check with this route let
   through (`$lib/server/csrf.ts`).
3. **The page.** `/send-set-data`, outside the shell: it needs no project on the device. Signed
   in to the site Flow PT named, with the person's own session, it reads the site's schema fresh,
   checks the type is Shot or the site's Set Shot slot, and shows the project, the site, the rows
   and what Send will do. Not signed in to that site, it asks to sign in first and then goes on.
   Nothing is written before the tap on **Send**: the request proves nothing about where it came
   from.
4. **The run** (`sendSetData.ts`), from what Flow PT holds:
   - on Shots: their codes; the Set Shots holding them, and those of their codes by key. On Set
     Shots: those rows. A row of another project, deleted, or a Set Shot with no key is left out
     and counted.
   - the code match of #102 on those Set Shots, once each (decision 39): never matched and empty
     gets every Shot of the project with its code, and its flag.
   - the slates that link the run's Set Shots (`sg_set_shots in`): each set to the Set Shots of its
     codes as Flow PT holds them (`sg_vfx_shots`) and the Shots of those (`slateWrites`), where it
     differs.
   - the Note of each Shot of the run (`writeShotNotes`), whatever a device's Notes on Shots
     setting: running the action is the request. One Note per Shot, a Reply on additions, the
     newly assigned added (#97).
   - per Shot: whether this run linked its Set Shot, its slates, whether a slate write failed, its
     Note. The Set Shots selected that still hold no Shot are listed.

## The shared lists

At each sync the app reads back the lists a show shares and merges them with the device's (#110,
app/sync README): `readShared` reads them, nothing else. Slates, takes and references are not read.

| list | read from | one search |
|---|---|---|
| cameras | Camera, `project is <the project>` | every page, every mapped field and the client UUID |
| lenses | Lens | the same |
| camera setups | Camera Setup | the same; its camera and lens as their client UUIDs, read through the link (findings/138) |
| lighting setups | Lighting Setup | the same |
| templates, reference kinds, rigs | the Project's three fields | one search of the Project, the fields the site has |

A row with no client UUID was made in Flow PT, not by a device: it is left out. A read of 40 full
pages (20,000 rows) is not judged whole, so nothing is judged removed from it. A list whose field
holds text this version cannot read (typed by hand, or written by a later version) is left out.

A push writes a list so (`plan`, `writeLists`):

1. One search of the Project for the field. The push's operations are applied to the entries in
   order (`applyListOps`): a create whose id is there is `duplicate`, an update or a delete of an
   entry not there is `gone`, a key the list has no place for is `invalid`. Any refusal sends
   nothing, as for a batch.
2. One `PUT` of the Project with the whole list, before the push's batch. Both lists of a push go
   in the one `PUT`.
3. One search again: the list must hold every operation (`landed`). Flow PT has no conditional
   write (recipes/005), so another device may have written the field between our read and our
   write. If so the push answers `timeout`: the runner checks every entry of it, by `lookup` and
   `read`, and sends again what did not land, read-modify-write once more.

`lookup` finds an entry by its id in the list; `read` gives its values. The server id of an entry is
its own id. A text field on Project kept 1,000,000 characters of JSON byte for byte, with no refusal
(findings/158): some 700 templates of 20 fields each. Nothing is cut to fit. It strips outer spaces
and newlines, so what is read back is parsed and compared as values, never as text. Every read of
the Project names its fields: with none named, a `GET` returns the whole list, and every client of
the site would pay for it (findings/158).

A refusal of the `PUT` for want of rights says so in plain words, and every later list operation
waits for the session, as a row write does (How a push goes): an Artist in the project gets 400 code
104 `The field is not editable for this user`, one outside it `Entity can not be accessed by this
user` (findings/159). An Admin may; a Manager is unmeasured (gap 22).

A record removed on another device and kept here is sent back as a new row under the same client
UUID, with a new id (app/sync README, decision 20). Flow PT reads every link to the deleted row as
none and refuses any write naming it (findings/161). So the synced takes and slates here that link
it, the history no device reads back, are written again: an update from no link to the record,
resolved to the new id by client UUID when sent, after the record's create (`relink`,
app/sync/shared.ts). The old id is never written. A camera setup follows Flow PT (Kevin, #110): its
link reads as none, and it takes that.

## Decisions

Made by Claude. Kevin can overrule any of them.

1. **The project is given, not synced.** `createFptTransport` takes `projectId`. A project create
   sends nothing and answers that id. A project update is refused. A project delete sends nothing.
   The app never creates, renames or deletes an FPT project.
2. **Plain field names.** "Focal Length", `sg_focal_length`. No prefix. Only the client UUID, the
   Set Shot key and the template link carry "Onset".
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
   `vfxShots` stays text as typed; its Set Shots and Shots are linked beside it (Set Shots and
   Shot links).
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
    Take: no call does (findings/114, findings/122, 400 code 111). It is optional since #117
    (decision 60): until it is there the rest syncs and the references wait on the device.
27. **The kind of a set reference is text:** a built-in key (`hdri360`), as an enum keeps its key
    (decision 7), or a project's own kind as typed. No list field: a project adds kinds, and a list
    would need an admin for each.
28. **Shot links follow the batch, never in it.** A link in the slate's batch would let one dead
    Shot id refuse the whole batch ("Value is not legal", recipes/002). So the slate lands first,
    and its links follow: one `PUT` a field, up to two a slate. The mode works in a `_batch`
    update too (findings/154); kept apart, a refused field does not hold back the other. Two fields
    with the mode in one `PUT` are not measured. A Set Shot's match is a batch of two updates of
    the one row, so its Shots and its flag land together.
29. Superseded by Kevin on 2026-11-17 (#102): a code with no Shot no longer waits on the device. See
    38 to 42.
30. Superseded by Kevin on 2026-11-17 (#102): a code several Shots have is listed from what each
    sync reads. See 43.
31. Superseded by Kevin on 2026-11-17 (#102): no unlink is owed on the device; each sync sets the
    slate's links whole. See 41 and 42.
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
36. **Every code typed is a Set Shot, a row of the project custom entity "Set Shot"** (Kevin, #102),
    even when a Shot has the code: it is then matched at once. Not flagged rows in Shot: they fire
    task templates and event scripts, count in shot lists and bids, need Shot create rights, and
    duplicate the Shot editorial makes, with no merge in Flow PT. Each studio enables the slot and
    names it, as for Take (findings/122). No Versions on it. It is optional (decision 44).
37. **A Set Shot is never made twice for one code in a project.** It is looked up by key before it
    is made, and the key is a text field created unique, which refuses a second row, case and
    outer spaces ignored, in a `_batch` too (findings/127). The key is `<project id>:<code>`:
    whether `unique` spans projects is unmeasured (findings/136), and two shows may share a code.
    A refused or unanswered create is looked up again, never sent blind. A deleted Set Shot frees
    its key (findings/136): a later sync of a slate with the code files a new one.
38. **Links to Shots are made in one place: the Set Shot's Shots** (Kevin, 2026-11-17). The app's
    match fills it, or a person in Flow PT's grid. Several Shots for a shot editorial splits.
39. **The app matches a Set Shot once, and the Set Shot says so.** It links a Set Shot never matched
    that holds no Shot to every Shot with the code typed on set, and ticks `sg_onset_matched` in
    the same batch. A ticked Set Shot is never matched again, on any device: one a person emptied
    after a match stays empty (Kevin, 2026-11-17). One a person filled is left alone and not ticked;
    emptied before the app ever matched it, it may be matched once. A Set Shot no Shot has the code
    of is tried at each sync: that is the late link. Once it holds a Shot, a Shot made later with
    its code is not added: someone sets it by hand. The code is the one the key holds, not the Set
    Shot's name now: renaming a Set Shot is free and moves nothing (Kevin, #102).
40. **A slate's Set Shots are those of its codes, and its Shots those of its Set Shots** (Kevin,
    2026-11-17). Both fields are set whole, in `set` mode, and written only when they differ. A
    link made by hand on the slate is overwritten: a wrong link is fixed on the Set Shot. One rule,
    `derivedShots`, so a page with no data on the device works it out the same way (#106).
41. **Nothing about links is kept on the device.** Each sync reads the slates' links and their Set
    Shots, and sets what differs: a code taken off is unlinked at the next sync even if the write
    failed, and a Shot set on a Set Shot in the grid reaches its slates at the next sync. #96's
    lists of codes waiting and unlinks owed, and its rule that a Shot a person unlinked from a slate
    is never linked again, are gone (Kevin, 2026-11-17).
42. **Every slate of the project Flow PT holds is brought in line when a drain ends,** at most once a
    minute, at once on Sync Now, and the slates of a push right after it (app/sync README).
43. **A code several Shots have is a Set Shot with more than one Shot of that code** (Kevin, #96),
    named in the sync sheet from what the last sync read. A Set Shot holding Shots of other codes,
    a shot editorial split, is not named.
44. **Set Shot is optional** (Kevin, #117). The resolution holds it only once the entity, its three
    fields and the slate's `sg_set_shots` are all there; until then the rest syncs, the setup check
    names it as a note, and the sync sheet says to enable it and how many slates wait. Nothing is
    dropped: the codes are on the slates, and the first sync after an admin enables it and runs Set
    Up Fields files the Set Shots and links them all. Set Reference follows (decision 60).
45. **A Set Shot is never deleted** (Kevin, #102). A code renamed or taken off a slate unlinks that
    slate from its Set Shot, which stays, with any Shots set on it, even when no slate lists it.
    Anyone can delete a stray one in Flow PT.
46. **One Note per Shot, keyed in a unique text field on Note,** `sg_onset_key`, `<project id>:shot:<Shot
    id>`: a second create with the key is refused, on a PUT too, under a person (findings/146). The
    project is in it as for a Set Shot. `Note.meta` needs no admin but refuses no duplicate and is
    written on create only (findings/146, field_types/jsonb.md). A refused create was made by
    another device since the lookup: left for the next sync, which reads it. A Note someone deleted
    frees its key: the next sync that has something for the Shot makes a new one.
47. **Nothing new or something added is decided from a field on the Note,** `sg_onset_captured`: what
    the Note lists, as ids. Not from the Note's text: the reply must say what was added, which a
    comparison of two texts cannot say without reading our own words back, and new wording in a
    later version would then rewrite every Note. The ids are a take number of a slate (so a second
    camera's take adds nothing), an element take with its type and whether at the tail, a reference,
    a photo. A text field takes 100,000 characters (field_types/text.md).
48. **Only an addition writes.** What the Note lists that is gone (a take deleted, a code taken off)
    writes nothing: an edit marks the Note unread for everyone (findings/149) and would say
    nothing new. The next write puts it right.
49. **No Note until something is captured for the Shot:** a take or a reference. A slate made at prep
    with the code writes nothing.
50. **The Note is built from what Flow PT holds,** never from the device (#106 runs the same code from
    a desktop with no data). A take another device sent is in it.
51. **The Note goes to what the Shot's Tasks hold:** people, and Groups as Groups. A Group addressed
    makes each member follow (findings/147); expanding it would freeze its members at that sync.
    The Note is linked to the Tasks too, as recipes/026 does, so it shows on them. Both are added
    to with the mode in the body (recipes/009), only on a sync that writes; nobody is removed.
52. **The Note is written as the person,** with the session's bearer, naming no author. A script's
    Note create reached no stream (findings/067); a person's did (findings/149).
53. **The `PUT` before the Reply.** A lost Reply leaves a right Note, unread again for its
    addressees (findings/149). The other order, a lost `PUT` would send the Reply twice.
54. **A Note and a Reply are each one create, not a `_batch`:** a create in a batch skips the
    server's checks (reports/001), and recipes/026 measured the single create.
55. **A photo is counted once:** the annotated copy is the same photo, and a photo sent twice is
    one, both told by the file name (stills.ts). A file someone added by hand counts as one.
56. **The Note fields are optional, and Set Up Fields makes them on every site,** whether a device
    turns Notes on Shots on or not: the setting is per device, and an admin cannot know. A site
    without them syncs the rest; the sync sheet says an admin runs Set Up Fields.
57. **An audio note goes up as a Version linked to its take, as a video does** (Kevin, 2026-11-17,
    #89). On the device it is a still whose file is audio. The file is the one the browser wrote,
    M4A (AAC) from Safari, WebM (Opus) where the browser has no AAC; nothing converts it. Flow PT
    makes an AAC mp4 of either, with no thumbnail (findings/152). The code says `Audio note`, so a
    change of its time keeps the word. The kind comes from the type the device stored, never from
    the Version's `content_type`: the server reads an Opus WebM as `video/webm` (findings/152).
58. **The slates a set reference shows on get a multi-entity field beside `sg_slate`** (#107). A
    field's type cannot change once made (endpoints/put_schema_type_fields_field: a `PUT` of
    `data_type` answers 200 and changes nothing), so `sg_slate` stays an entity field, the slate it
    was logged on, and `sg_slates` links every slate it shows on. A link to the Lighting Setup was
    weighed: a slate and its Shots would reach the reference only through a second hop, and the
    issue asks that each slate reach it. A site set up before this lacks `sg_slates`: its cached
    resolution is read again, and it is not ready until an admin runs Set Up Fields once more.
59. **`sg_slates` is derived, as a slate's Shots are** (Kevin, 2026-11-17; decisions 40 and 41). At
    each sync it is set whole, in `set` mode, to the slates the reference shows on, and written only
    when it differs. A slate linked by hand in Flow PT is overwritten. Nothing is kept on the device.
    One `PUT` per reference: the mode works in a `_batch` update too (findings/154), but a batch is
    all or nothing, and one reference deleted in Flow PT would refuse the writes of every other.
60. **Set Reference is optional** (Kevin, #117), as Set Shot is (decision 44). The resolution holds
    it only once the entity and all nine of its fields are there, `sg_slate` and `sg_slates` among
    them; no record of another scope links one, so nothing else waits. Until then the rest syncs,
    the setup check names it as a note, the status says "All synced, 3 waiting", and the sync sheet
    says to enable it and how many references wait. A set reference is a record on the device, so it waits in the queue: the runner drains a
    port that leaves its entries out (app/sync README, decision 15). Nothing is dropped and nothing
    needs a person. The first sync after an admin enables it and runs Set Up Fields sends them, then
    sets their Slates. Should one reach the transport on such a site all the same, it is refused in
    plain words, alone, and never sent blind. The Notes on Shots list no references there (decision
    50: what Flow PT holds).

61. **One Action Menu Item per entity type and deploy, holding every project that ran Set Up
    Fields** (#106). Found by title and URL, so it is never made twice; a second project is added
    to its projects in place. A deploy elsewhere has another URL, so its own row. A row of ours
    with no project gets the project too: what Flow PT does with an empty list is unmeasured.
62. **Only title, URL, entity type and projects are sent.** Left alone, the item posts a form in a
    new tab, which is what probe 156 recorded. `selection_required`, `light_payload`,
    `open_in_overlay`, `secret_token` and the rest stay as Flow PT sets them: what they change is
    not measured.
63. **The route takes a form from any origin and writes nothing.** No signature was measured, so
    the request proves nothing. The page writes only on Send, with the person's own session for
    that site, and the site must pass the sign-in allowlist. A forged post can open the page, and
    nothing more.
64. **A run covers what was selected.** The match runs on the Set Shots of the selected rows only,
    and the Notes are written on the run's Shots only. A slate's links are set whole, as at sync,
    so a slate keeps the Set Shots of its other codes. Another code's Set Shot is matched by the
    next sync, or a run on it.
65. **The slates of a run are those linking its Set Shots.** A slate whose code has a Set Shot
    it does not link yet is put right by the next sync from the device. The Note reads the slates
    the same way (decision 50).
66. **500 rows a run.** The page address carries every id, and each Shot costs a few requests.
    More is refused in words.
67. **The page reads the site's schema fresh, into memory.** It needs nothing on the device, and
    a schema kept from before an admin enabled Set Shot would hide it.
68. **Templates and reference kinds are JSON in two text fields of the Project** (#110). Flow PT has
    no entity for either, and Kevin wants no new required custom entity (#117): a site without the
    fields syncs the rest. The Project is the one the device syncs with, so the list is the show's,
    and Set Up Fields makes the fields as it makes the others: a text field on Project is created by
    API as on any type, an Admin's 201, an Artist's 500 code 105 (findings/157). It kept 1,000,000
    characters of JSON byte for byte (findings/158). A custom jsonb field cannot be created at all,
    400 code 103 (findings/160; recipe 028 does the same). A custom entity per list was weighed: it
    would give one row per entry and a unique client UUID, but it is one more slot each studio
    enables.
69. **One field per list,** so an edit of a kind never writes over a template another device saved
    at the same moment, and the reverse.
70. **A list is written whole, read again, and checked.** No conditional write exists: `If-Match`
    is ignored (recipes/005). Two devices that write one list within a second may lose one write,
    and the check finds it and sends it again. The window is the time between the search and the
    `PUT`. The check parses what it reads and compares values: Flow PT strips outer spaces and
    newlines (findings/158), so a list another writer formatted reads as the same list.
71. **A list holds the keys the device has, but the project:** a template's `name`, `scope` and
    `values`, a kind's or a rig's `name`. The project is the field's own; a device reading it puts the entry
    under its own project.
72. **A list this version cannot read is never written over.** Its entries need a person, with the
    field named, until an admin empties it in Flow PT. It is left out of a read too, so nothing on
    the device is judged removed from it.
73. **Cameras, lenses, camera setups and lighting setups are read back from their entities,** every
    row of the project with a client UUID. A row made by hand in Flow PT has none and is left out:
    matching it to the device's gear by name is not done. Which camera setups a device shoots with
    is its own choice, kept on the device, never in Flow PT (app/sync README, decision 25).
74. **A record sent back writes the links of the history again, with its new id.** Flow PT reads a
    link to a deleted row as none and refuses any write naming one, as it refuses an id that never
    existed (findings/161). The record kept here is a new row; the synced takes and slates here that
    link it each get an update from no link to it, after its create, resolved by client UUID when
    sent. A camera setup does not (Kevin, 2026-11-17): it is read back and follows Flow PT. Another
    device that took the lens off it and deleted the lens, or a person who deleted the lens in Flow
    PT, both read as no link, and the setup here takes it, listed under "Changed on another device".
    Camera setups are read first, so a lens they no longer hold is not counted as used when the
    lenses merge: it is kept only for a take.
75. **The names an admin picks change the planning only** (#111). The resolution already held each
    field's name on the site by the mapping's name (decision 3), and every call reads names from
    it. So a naming changes what Set Up Fields looks for and creates, and nothing past the
    resolution. The default naming changes nothing, which `golden.test.ts` holds to the request.
76. **A field is named in a naming by where it is and its default name,** `take.sg_focal_length`:
    stable whatever a site calls it, and the key the resolution already used.
77. **A renamed field keeps the step-aside rule** of decision 3. **A field mapped to one the site has
    is used as it is or not at all:** never created, never changed. Not there, or not fitting, it
    blocks, with the reason.
78. **A custom entity given a name is looked for under that name alone.** Lenses, the other spelling
    of Lens, holds for the default only.
79. **A naming is refused whole** (`parseNaming`) when two custom entities would be found under one
    name, when two fields of one entity ask for one name, or when a display name has outer spaces
    or a character outside ASCII: the server names such a field `sg_<data_type>` (findings/117).
80. **The resolution keeps the naming it was made with.** The transport reads a stale one again
    under its names; a caller that asks for other names reads the site again. Since decision 81 a
    check reads the names the project keeps (app/sync README, decision 26).
81. **The names live in one fixed text field of the Project, `sg_onset_naming`** (Kevin, #111): JSON,
    one per project, read by every device of it. Its own name is never in a naming: it is read
    before any name is known. A site without it uses today's names, and nothing more is asked. A
    text field keeps JSON byte for byte; a jsonb field cannot be made (findings/158, 160; recipe
    028). Set Up Fields makes it the first time an admin saves names.
82. **Names saved by a later version are never guessed at, and never written over.** The check is
    not ready and plans nothing, the transport sends nothing, Set Up Fields does not save, and each
    says to update SG OnSet. Guessing would write values to fields another version did not mean.
83. **Names are kept on the project only when the site is ready under them, or was not ready under
    the names the project kept.** So a save never takes a device from syncing to stopped. The fields
    made for names not kept stay, unused, and the schema on the device stays under the kept names.
84. **A transport reads the project's names once, at its first call that needs the schema.** A
    device that kept its schema before an admin saved other names would write to the old fields.
    That matters only before the project's first sync: after it the names in use never change
    (decision 85), so a device with an older copy writes the same fields. One read a transport, a
    404 on a site that never saved names.
85. **Once the project has synced, what is in use stays as it is** (Kevin, #111). Synced: Flow PT
    holds a row of the project with our client UUID, found with `is_not` null (field_types/text.md),
    one search a type until one answers. In use: an entity found, or a field there, under the names
    the project keeps. An entity or a field not found yet may still be named. To move data an admin
    works in Flow PT.
86. **The review reads the site once and plans every change on the device,** the fields of every
    custom entity included, so an entity looked for under another name shows its fields at once.
    Nothing is written before the review's Set Up Fields.
87. **Only an Admin saves names.** The field's `editable` for the person (findings/159) makes the
    page read only; without the field yet, the create says (findings/157). A Manager is not
    measured: the refusal, if any, is said in plain words.
88. **A file of names is the field's JSON.** Importing puts its names on the page and changes
    nothing in Flow PT; names in use keep the project's, and the page counts them.
89. **The rig is text on Take and on Camera Setup, `sg_rig`, "Rig"** (Kevin, #138): a built-in rig
    as its English label (`Steadicam`), so people reading the take in Flow PT see words, read back
    to its key, case and outer spaces ignored (Kevin, 2026-11-25); a project rig as typed. Unlike a
    set reference's kind (decision 27), which keeps its key.
    No list field: a project adds rigs. **It is optional** (Kevin, 2026-11-25): a site without it is
    ready and syncs the rest. Set Up Fields makes it and the review lists it, like every field. The
    first optional field of a required entity: `optional: true` in its line of `OVERRIDES` makes the
    next one. Each entity follows its own field, so Take may have it while Camera Setup does not.
    - The resolution names it when it is there, and a cache without it stays good. `missingFields`
      lists what the site lacks as `take.cameraMount`.
    - The transport never sends, asks for or reads a field the site lacks (`onSite` in payload.ts),
      and the shared read of camera setups leaves the key out, so the device keeps its own rig.
    - The app strips the key from what the runner sees (app/sync `withoutWaiting`): the rest of the
      record goes, the rig stays on the record. Nothing waits in the queue and nothing needs a
      person.
    - The device keeps the fields a site lacked when it last read its schema. When one of them is
      there at a later read (an admin ran Set Up Fields, then a check), the runner stops, each unsent
      update of the key loses it, and every record holding a value queues an update of it from no
      value (the store's `refill`). Records synced while it was missing get their rig that way. A
      device that never saw it missing sends nothing again.
90. **A project's own rigs are a third shared list, `sg_onset_rigs` on the Project** (#138), beside
    the templates and the kinds (decisions 68 to 72). **Each list follows its own field** (Kevin,
    2026-11-25): the resolution names the fields that are there (`missingLists` gives the others),
    and a list whose field is missing waits on the device. A site set up before the rigs keeps
    syncing its templates and kinds; its rigs go once Set Up Fields makes `sg_onset_rigs`. A
    resolution kept before the rigs names two fields and stays good. The sync sheet's section on the
    lists shows while the templates or the kinds wait, as its words name them; a site that lacks
    only the rigs field lacks the Rig of Take and Camera Setup too, and the sheet's line on rigs
    says they wait while a take or camera setup holds one.

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

Closed on 2026-11-17 by probes 157 to 161 and recipe 028 (`~/dev/sg-groundtruth`, PR #116), for the
shared lists (#110):

| was | answer | finding |
|---|---|---|
| A custom field on Project: create, and a `PUT` | `POST /schema/Project/fields`, `text`, 201 for an Admin, 500 code 105 for an Artist; `Onset Templates` gives `sg_onset_templates`. Reads like a field on any type | 157 |
| A text field past 100,000 characters | 1,000,000 characters of JSON stored byte for byte, newlines and tabs kept; outer spaces and newlines stripped. A `GET` of a Project with no `fields` returns the whole value | 158 |
| Who may update a Project's field | Admin and script 200, member or not; an Artist in the project reads it and gets 400 code 104 `The field is not editable for this user` on a `PUT`; outside it, 404 on the read and 400 code 104 `Entity can not be accessed by this user` | 159 |
| A custom jsonb field | cannot be created: 400 code 103 `data_type is not valid`, on Project or any type | 160 |
| A link to a deleted row | reads as null (entity) or drops out (multi_entity), matches no filter; any write naming a deleted row is 400 code 104 `Value is not legal.`, as for an id that never existed | 161 |

Closed on 2026-11-17 by probes 154 and 155 (`~/dev/sg-groundtruth`, PR #108, not merged yet):

| was | answer | finding |
|---|---|---|
| `multi_entity_update_mode` inside a `_batch` update; two updates of one record in one batch | as on a `PUT`; they apply in request order, each row the record after it | 154 |
| The field a multi_entity on Slate adds on its target | `slate_<field>_slates`, shown `Slates <-> <field>`, the rule of the custom slots: `slate_sg_shots_slates` on Shot, `slate_sg_set_shots_slates` on Set Shot | 155 |

Still open:

1. What Manager and Vendor accounts get on a field create, and on rows (probes 132, 143: nobody
   in those groups had impersonation on). The tolerant match in `errors.ts` covers their words.
2. Does `unique: true` span projects (probe 136 had one writable project)? Our UUIDs are unique
   across the site, and the Set Shot key holds the project, so the answer changes nothing unless
   a site has a rule we do not know. Measured: a unique field ignores case and outer spaces
   (findings/127).
3. What a rate limit answers, when one bites.
4. What the server names an added field for a second link from the same source to the same
   target, and how it pluralises a display name outside the custom slots measured.
5. Whether a part PUT's `Content-Type` sets the stored type of a multipart file.
6. A real browser run of the whole upload (the measurements are a process reading headers).
7. A Version whose `entity` is a custom entity row, as a Take is: the create takes it and reads it
   back (findings/151, 201 on every slot tried). Whether the web interface plays a video or an
   audio note on the Take is not measured: it needs a person (findings/151, 152). The check still
   puts `entity` back if a read shows it missing.
8. What Flow PT does with a Version's movie and transcode Attachments when the Version is deleted.
9. The largest video a browser on an iPad sends: one PUT of 1000 MB was measured from a script
   (findings/140); a browser upload is not measured.
10. Whether one `PUT` takes the `multi_entity_update_mode` wrapper on two fields at once. Not
    needed: each field is its own `PUT` (decision 28), and one `_batch` of an update per field
    would do the same, in order (findings/154).
11. The name of the field `Slate.sg_setup_diagram` (multi-entity to Attachment, #87) adds on
    Attachment. Predicted `slate_sg_setup_diagram_slates` by the rule measured on Slate with Shot
    as the target (findings/155); Attachment as the target is not measured.
12. Notes on Shots (#97), written with the app's session bearer (the launcher's, probe 052): who
    `created_by` and `user` name, whether the create reaches the Shot's stream, and whether the
    Note, its edit and its Reply reach the addressees' Inbox. Measured under `sudo_as_login`
    only (findings/148, 149); the launcher bearer and the Inbox need a person and a browser
    (probes 147, 148, 149, their "Needs a browser" steps).
13. Whether a person of the Artist, Manager or Vendor group may write the two custom Note fields
    and create a Note with them. Findings/146 wrote them as the operator.
14. Whether someone taken off `addressings_to` stops following (recipes/026). Moot here: nobody is
    taken off.
15. Whether `unique` on Note spans projects (findings/146). The key holds the project.
16. Whether the Shot's reverse field of `Set Shot.sg_shots`, or `Slate.sg_shots`, shows on a Shot's
    page in the web interface by default, so an artist finds the slates from the Note. Not needed by
    the app.
17. Whether an ActionMenuItem's `secret_token` adds a signature to the request (findings/156). Not
    measured: nothing relies on it. The Send button and the host allowlist are the guard.
18. What the web interface does with an ActionMenuItem whose `projects` is empty, and whether
    `permissions_groups` hides it there (findings/156: it does not filter what the API returns).
19. Whether a Manager may create an ActionMenuItem (findings/156: Admin 201, Artist 400 code 104,
    Manager not reachable).
20. What Safari and Firefox send to the item's URL: `Origin`, `Sec-Fetch-Site`, the content type
    (probe 156 ran Chrome). The route takes any origin, so only the content type matters.
21. What `selected_ids` holds when a person runs the item with no row selected, and what
    `selection_required` changes. The route reads an empty or missing value as nothing selected.
22. Whether a Manager or a Vendor may update a Project's field (findings/159 read their rights,
    update allowed for Manager, denied for Vendor, and exercised neither) or create one
    (findings/157). A refusal is said in plain words and the lists wait; the rest syncs. The same
    holds for the names (#111): a refused save says only an Admin can.
23. What a `_search` answers when `fields` names a field the type does not have. Not relied on: the
    names are read through `GET /schema/Project/fields/sg_onset_naming` first, a 404 when absent.

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

Set Reference came after this read (#93). Without that slot the rest syncs and the references wait
on the device (#117); once it is enabled and named, Set Up Fields makes its nine fields, `sg_slates`
(#107) among them.

Set Shot came after too (#102). Kevin enabled the slot on 2026-11-17; its schema was not read here.
Set Up Fields makes its two fields, `sg_onset_key` and `sg_shots`, and the slate's `sg_set_shots`.

Notes on Shots came after too (#97). Set Up Fields makes `sg_onset_key` (unique) and
`sg_onset_captured` on Note, a stock type. Until then the rest syncs and no Note is written.

The Action Menu Item came after too (#106). Set Up Fields makes it on Shot and on Set Shot for the
linked project, pointing at the deploy it runs on. An admin runs it once per project.

The shared lists came after too (#110). Set Up Fields makes `sg_onset_templates`,
`sg_onset_reference_kinds` and `sg_onset_rigs` (#138) on Project, a stock type. Until then the rest
syncs and templates, kinds and rigs wait on the device.

# Areas

Who owns which paths, and what everyone shares. Three pieces of work go on at once: the take
screen; gear, camera setups and CSV import; slates, templates and bulk edit. Each edits its own
paths only. What is shared is used as it is. If a shared file needs a change, that is its own
small issue and PR, not part of a feature.

## Ownership

| area | routes | modules | components | strings |
|---|---|---|---|---|
| Take screen | `src/routes/(app)/shoot/**`, `src/routes/proto/**` | `src/lib/take/**` | `src/lib/components/take/**` | `src/lib/i18n/en/take.ts` |
| Gear, camera setups, CSV import | `src/routes/(app)/gear/**` | `src/lib/gear/**` | `src/lib/components/gear/**` | `src/lib/i18n/en/gear.ts`, `src/lib/i18n/en/import.ts` |
| Slates, templates, bulk edit | `src/routes/(app)/slates/**`, `src/routes/(app)/templates/**` | `src/lib/slates/**`, `src/lib/templates/**` | `src/lib/components/slates/**`, `src/lib/components/templates/**` | `src/lib/i18n/en/slates.ts`, `src/lib/i18n/en/templates.ts` |
| Shell (shared, no feature edits) | `src/routes/+layout.svelte`, `src/routes/+page.svelte`, `src/routes/(app)/+layout.svelte`, `src/routes/(app)/settings/**`, `src/routes/welcome/**`, `src/routes/(app)/sign-in/**`, `src/routes/auth/**` | `src/lib/app/**`, `src/lib/settings/**`, `src/lib/i18n/*.ts`, `src/lib/ios/**`, `src/lib/pwa/**`, `src/lib/model/**`, `src/lib/store/**`, `src/lib/outbox/**`, `src/lib/auth/**` | `src/lib/components/app/**`, `src/lib/components/ios/**` | `src/lib/i18n/en/common.ts`, `settings.ts`, `auth.ts`, `fields.ts`, `validation.ts`, `index.ts` |

Also shared: `src/app.css`, `src/app.html`, `package.json`, `docs/**`. A directory named above that
does not exist yet is made by its owner.

Each area's page is a placeholder today. Its owner replaces it.

## Contracts

Everything below is in `src/lib/app/` unless it says otherwise. Pure modules have their test
beside them; read the test for the exact behaviour.

### The store

- `useApp()` (`app.svelte.ts`): `{ store, edit, canUndo, canRedo, lastEdit, dismissEdit, newId, now }`.
  The store is opened once, in the browser, by the root layout. Call `useApp()` while a component
  initialises. Never call `openStore()` yourself.
- Read with the live helpers (`live.svelte.ts`), never with a one-off `store.get` in a component:
  - `liveList(table, () => parentId)`, `liveRecord(table, () => id)`: `.value`, `.ready`, `.error`.
  - `live(tables, (store) => promise, initial)` for anything else. It runs again after a commit
    to one of `tables`, and when a rune it read before its first `await` changes.
  - `liveUnsynced()`, `liveQueue()` for the outbox.
- Ids are `app.newId()`. Times are `app.now()`. The model takes both as arguments.

### Edits and undo

Every write goes through `app.edit` (`editor.ts`). It saves, queues for sync and records the undo.
Never call `store.apply`, `store.create` or `store.remove` from a feature.

- `edit.set(table, record, key, value, label?)`: one field. `undefined` clears it.
- `edit.apply(table, patch, label?)`: a model patch, as `bulkEdit` and `applyTemplateEdit` return.
- `edit.create(table, row, { attach?, label? })`, `edit.remove(table, id, label?)`,
  `edit.removeTree(table, id, label?)` (the record and everything under it).
- `edit.group(label, async () => { … })`: every edit inside is one undo entry.
- `edit.undo()`, `edit.redo()`. Undo is the inverse patch, queued like any edit.
- `label` is `{ key, params }`, a message key. `edit.changed {field}`, `edit.created {what}`,
  `edit.removed {what}` exist; an area adds its own to its strings file.
- The shell shows the last labelled edit in a notice with Undo, on every destination but Shoot.
  On Shoot the page shows its own: read `app.lastEdit`, call `app.edit.undo()`.
- Typed text becomes a value with `readField(scope, key, text, units)` (`fieldEdit.ts`): it gives
  the value to save or the issue to show (`issueText`).

### The place

- `useCurrent()` (`current.svelte.ts`): `projects`, `project`, `shootDays`, `shootDay`, `slates`,
  `slate`, `ready`, `select({ projectId?, shootDayId?, slateId? })`. Live. The pick is kept in the
  settings. A project always exists under `(app)`: a device with none is sent to `/welcome`.
- `useShell()` (`shell.svelte.ts`): `openContext()` opens the project and day picker,
  `openSync()` the sync detail. `components/app/ContextBar.svelte` is the row that shows the
  place at the head of a page.
- Sorting and naming: `context.ts` (`sortSlates`, `sortShootDays`, `dayName`), `titles.ts`
  (`recordTitle`), `takeRows.ts` (takes in shot order with camera and focal length),
  `format.ts` (`formatDate`, `formatTime`, `formatBytes`, `ago`, `today`).

### Settings

- `settings.value` (`settings.svelte.ts`) is a rune: `hand`, `appearance`, `night`, `buttonSize`,
  `units`, `motion`, `sidebar`, `last`. Change with `settings.update({ … })`.
- They are on `<html>` for CSS: `data-theme="light|dark"`, `data-night="true"`,
  `data-hand="left|right"`, `data-motion="full|reduced"`, `data-button-size="standard|large"`,
  `--target`, `--gap` (capture targets), `--touch` (every other target).
- Lengths show and are typed in `settings.value.units`: pass it to the model's `parseField`,
  `formatField`, `readField`.
- A Workspace takes `hand={settings.value.hand}` and the target from
  `captureTarget(settings.value.buttonSize === 'large')`.
- A new setting is a shared change: ask for it, do not add a second store of preferences.

### Strings

- `t(key, params)` from `$lib/i18n/messages`. Every string an area shows is in that area's file
  under `src/lib/i18n/en/`. A key lives in one file. No English in a component.
- Field labels, validation and import messages exist for the whole model: `fieldLabel(def)`,
  `optionLabel(def, option)`, `unitLabel(unit)`, `issueText(issue)`, `importIssueText(issue)`
  from `$lib/i18n/modelText`. `tk(key)` reads a key held as data.
- A field added to the model's catalogue needs its label in `fields.ts`: `model.test.ts` fails
  until it has one. That is a shared change, with the model change.

### Navigation

- The destinations are data: `NAV` in `nav.ts`. `focus: true` gives a destination the room and
  the calm of the capture path: the sidebar is a strip there and the shell shows no notice.
- A page under a destination (`/slates/<id>`) pushes and pops by itself (`ios/direction.ts`).
- The sync detail lists what needs a look from the outbox alone. A new table shows up there with
  its `scope.<table>` name and its naming field (`titles.ts`): nothing to register.

### The kit

`src/lib/components/ios/README.md`, section "Tablet first", is the rule: `Page`, `Columns`,
`Section`, `Row`, `InputRow`, `Sheet`, `NavBar`, `Notice`, `Workspace` and the rail parts. A
part an area needs and the kit lacks starts in that area's components directory. Moving it into
the kit is a shared change.

## Not built

The Flow PT transport. The outbox fills and nothing drains it. The sync status says so.

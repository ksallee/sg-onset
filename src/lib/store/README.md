# store

On-device storage. Records, files, the sync queue and the backup. The app talks to the `Store`
interface. The implementation here is IndexedDB through Dexie. A Capacitor store can replace it.

## Modules

| module | pure | what it does |
|---|---|---|
| `types.ts` | types | `Store`, `BlobMeta`, `StorageStatus`, `BackupSource`, `BackupTarget`. |
| `tables.ts` | yes | The tables, from the model: one per scope, `still`, `template`, `referenceKind`, `markup` and `diagram`. Parent keys, link keys, `dependsOn`, `LOCAL_TABLES`. |
| `schema.ts` | yes | The IndexedDB schema by version. How to add a version. |
| `storage.ts` | yes | `storageStatus`, `prunable`, `BLOB_KEEP_MS`. |
| `dexieStore.ts` | no | `openStore`: the `Store` on Dexie. |
| `archive.ts` | yes | The layout of a backup: paths, NDJSON, the manifest and its check. |
| `crc32.ts` | yes | CRC-32, for the restore. |
| `zipRead.ts` | no | A zip reader over a `Blob`: zip64, stored and deflated entries. Refuses a damaged archive. |
| `backup.ts` | no | `exportBackup`, `saveBackup`, `backupToFile`, `importBackup`, the sinks. |
| `snapshots/policy.ts` | yes | `snapshotDue`, `nextCheckAt`, `isRiskyEdit`: when a snapshot is due. |
| `snapshots/retention.ts` | yes | `retain`, `budgetBytes`: which snapshots to keep. |
| `snapshots/reconcile.ts` | yes | `planRestore`, `diffTables`: what a restore does to the records and the queue. |
| `snapshots/signals.ts` | yes | `backupSignals`: one severity and the detail, for the UI. |
| `snapshots/zipWrite.ts` | yes | A synchronous stored-zip writer. |
| `snapshots/codec.ts` | no | A snapshot's bytes: encode, gzip, check, decode. |
| `snapshots/snapshots.ts` | no | `store.snapshots`: take, list, verify, preview, restore, prune, the off-device marks. |
| `snapshots/scheduler.ts` | no | `createSnapshotter`: runs them after changes, when idle, and before risky operations. |

## Store

```ts
interface Store {
	get(table, id): Promise<Row | undefined>;
	list(table, parentId?): Promise<Row[]>;

	create(table, record, attach?: { blob: Blob; id?: string; name?: string }): Promise<void>;
	apply(table, patch: Patch): Promise<Patch>;
	remove(table, id): Promise<void>;
	restore(table, id): Promise<boolean>;
	purgeTrash(before: number): Promise<number>;

	putBlob(table, recordId, file): Promise<BlobMeta>;
	blob(id): Promise<Blob | undefined>;
	blobsOf(recordId): Promise<BlobMeta[]>;
	pruneBlobs(keepMs?): Promise<number>;
	dropBlob(id): Promise<boolean>;

	outbox: OutboxPort;
	unsynced(): Promise<Unsynced>;
	resolve(entryId, pick): Promise<void>;
	retry(entryId): Promise<void>;
	remoteId(id): Promise<RemoteId | undefined>;
	reconcile(table, users, plan): Promise<Plan>;
	snapshots: Snapshots;

	subscribe(listener: (event: { tables: readonly string[] }) => void): () => void;
	persist(): Promise<boolean>;
	storage(): Promise<StorageStatus>;
	close(): void;
}
```

- Every write is one transaction over the record table and the outbox. A saved value always has
  its queue entry.
- `apply` takes a model patch and returns it as applied, with the stored values as `from`.
  Undo is `apply(table, invertPatch(returned))`. It is queued like any edit.
- `reconcile` brings a table in line with what Flow PT holds (#110), in one transaction: it reads
  the table, the tables whose records may use one of its records, the queue, the server ids and
  the trash, hands them to the plan (pure, `app/sync/shared.ts`), and applies it. Records put,
  changed or removed so are not queued, and are not on the undo stack: they came from Flow PT. Only
  a record sent back, or one Flow PT never had, gets a create queued.
- Reads are plain promises. `subscribe` fires after each committed change with the names of the
  tables touched, plus `outbox`, `blobs`, `trash`, `snapshots`, `meta`. The UI wraps it in runes.
- `persist()` asks through `$lib/pwa/persist`. `storage()` gives `persisted`, `usage`, `quota`,
  `free`, `usedFraction`.

```ts
const store = openStore();
await store.create('take', take);
const applied = await store.apply('take', [change(take, 'tStop', 4)]);
await store.apply('take', invertPatch(applied)); // undo

const runner = createRunner({ port: store.outbox, transport, env: browserEnv() });
const sync = runInForeground(runner, browserPage());
store.subscribe((e) => e.tables.includes('outbox') && sync.kick());
```

## Tables

- One per scope (`project`, `shootDay`, `lightingSetup`, `cameraSetup`, `slate`, `take`,
  `camera`, `lens`, `reference`), `still`, `template`, `referenceKind`, `markup`, `diagram` and
  `clipImport`. Key `id`, index on the parent key.
- `template`: a live template, under its project (schema version 3). Synced since #110, as JSON on
  the Project (fpt README, "The shared lists"); kept on the device only before.
- `reference`: a set reference, under its slate (schema version 4). Synced like a take.
- `referenceKind`: a kind of set reference the project added, `{ id, projectId, name }` (schema
  version 4). Synced as a template is, since #110.
- `markup`: the drawing on a photo, under its still (schema version 5, #86). Kept on the device:
  it is in the backup and on the undo stack, and nothing is queued for it (`LOCAL_TABLES`). It
  reaches Flow PT as the still's annotated copy (below).
- `diagram`: a slate's setup diagram, under its slate (schema version 6, #87). Kept on the device
  like a drawing. The wrap package holds it as an image.
- `clipImport`: one import of the DIT's clips, under its shoot day (schema version 7, #109):
  `{ id, shootDayId, importedAt, fileName?, filled }`, `filled` being take id to field to the value
  the import wrote. Kept on the device like a drawing. A later import of the day reads it to know
  which fields an import filled and nobody edited since (`$lib/clips`).
- `blobs`: one row per file, without the bytes. `blobData`: the bytes. A file may be one the app
  made: `variant: 'annotated'`, a still's photo with its drawing flattened on it, or `variant:
  'diagram'`, a slate's setup diagram as an image; `source` is the key of the drawing it was made
  from (`$lib/draw/markup`, `$lib/draw/diagram`). Its upload carries the variant, so Flow PT names
  and places it (fpt README). `dropBlob(id)` takes back a file whose
  upload has not left: its description, its unpinned bytes and its queued upload. Once the upload
  has left, or may have, it refuses and the file stays.
- `outbox`: the queue. `remotes`: client UUID to server id. `trash`: removed records.
  `meta`: the queue counter (`seq`, also the change counter of the snapshots) and the times of the
  last off-device copies.
- `snapshots`, `snapshotData` (version 2): the snapshots, apart from the store's own tables. A
  backup does not hold them, `clear()` does not empty them, `isEmpty()` does not count them.

## Schema versions

`schema.ts` holds `VERSIONS`. A shipped version is never edited. To change the schema, append
`{ version, stores, upgrade }`: `stores` lists only the tables that change, `upgrade` rewrites the
rows already there. `dexieStore.test.ts` proves the mechanism with a later version.

Every upgrade from version 2 on takes a `migration` snapshot first, inside the upgrade
transaction, of the rows as the old version left them. An upgrade that throws changes nothing:
IndexedDB rolls it back. One that runs and does damage can be undone from that snapshot.

## Backup

A zip. `tables/<table>.ndjson` for every table, `blobs/<id>` for every file as captured,
`manifest.json` last. An archive without a manifest was cut short.

- `exportBackup(store, { now })` is a stream. `saveBackup(stream, sink)` pumps it into a sink.
  `backupToFile` picks the sink: the origin's private file system where the browser can write
  it, memory otherwise. Hand the file to `shareOrDownload` from `$lib/pwa/files`, on a tap.
  `removeExport()` frees the copy afterwards.
- `importBackup(store, file, { replace })` checks the whole archive first: manifest, counts, every
  entry's header against the directory, every checksum, the manifest's too. One bent byte is
  refused (#123). Only then is the store touched. A store with data is refused unless `replace`.
- The backup holds the queue, the server ids and the trash. A restored iPad carries on syncing
  where the old one stopped.

## Snapshots

Automatic, rolling copies of the whole store but the photo bytes, kept on the device. They exist
so that a mistake or a bug cannot cost a shooting day.

### What they protect against, and what they do not

A snapshot lives in the same browser storage as the data. So it protects against **logical
loss**: a wrong bulk edit past the undo stack, a template applied to everything, a buggy
migration, a corrupted table, an accidental "delete project".

It does **not** protect against losing the storage itself: iPadOS evicting the site's data,
deleting the home-screen app, a reset or lost iPad. Those take the snapshots with them. Only an
off-device copy survives them: a full sync to Flow PT, or the backup zip the user exports. So the
store also keeps the time of the last off-device copy, and `backupSignals` tells the UI how long
entries have existed only on this device.

### What a snapshot holds

Every row of every record table, the queue, the server ids, the trash, the file descriptions,
the counters, and the schema version. One read transaction, so one moment. Encoded as the
backup's layout (`tables/<table>.ndjson` and `manifest.json`, no `blobs/`) in a stored zip, then
gzipped with `CompressionStream` where it exists. `store.snapshots.zip(id)` gives that zip back:
`importBackup` takes it into an empty store, photos aside.

**Photo bytes are not copied.** They are large, and a row of `blobData` never changes. The
snapshot names the files it describes (`blobIds`, indexed). Bytes a kept snapshot names are not
freed: `pruneBlobs` skips them, the confirmed delete of their record keeps them, `clear()` keeps
them. They go when the last snapshot naming them goes. A backup does not export them.

Each snapshot carries its counts per table and a CRC-32 of its stored bytes; every zip entry has
its own. It is read back and checked once written, and again before every preview and restore. A
snapshot that fails is marked `bad`: listed as such, never restored, dropped by retention.

### When

`createSnapshotter({ snapshots: store.snapshots, subscribe: store.subscribe })`, once, in the
browser. After changes, not on a timer alone:

- Due when there are changes not in a snapshot and either **10 minutes** passed since the last one
  or **200 changes** piled up. The first change after opening a store with no snapshot makes one
  due. A change is one queued operation: the store's `seq` counter.
- When the page hides with changes: at once, best effort.
- Before a risky operation, whatever the time: `await snapshotter.snapshotBefore(reason)`. The
  schema migration does it by itself. An edit counts as risky from **20** records
  (`isRiskyEdit`).
- It runs in an idle callback (a 200 ms timeout where there is none), one at a time, abortable.
  It reads in one read transaction and writes in a short one over the snapshot tables only: it
  never holds a write transaction on the records. 2,000 takes and their queue: about 0.5 s and
  40 kB in the test environment.

### Kept

The newest good snapshot, always. The last **3** automatic ones. The newest of each of the last
**7** days, in the device's time zone. Every risky one for **48 hours**. Within a budget of 5 % of
the quota, at most 25 % of the free space (100 MB when the browser does not say): over it, the
oldest dailies go first, then the oldest risky ones, then the oldest automatic ones. When even
that is not enough, `status().overBudget` says so.

### Restore

`list()`, `preview(id)` (records added, removed, changed per table, and how many changes the
restore will queue), then `restore(id)`. It takes a `beforeRestore` snapshot first: restoring that
one undoes the restore. Then one transaction writes the records, the trash and the file
descriptions as the snapshot holds them, and rebuilds the queue (`reconcile.ts`):

- Entries sent or maybe sent, or waiting for a person, stay. Unsent ones are dropped.
- A record Flow PT holds (a server id, then the kept creates and deletes in order) and the
  snapshot holds: an update of the fields that differ. Base: the current value with every dropped
  edit undone. If that belief is wrong, the conflict check catches it before anything is sent.
- A record the snapshot holds and Flow PT does not: a create. A record never synced, or one
  deleted since and the delete confirmed.
- A record Flow PT holds and the snapshot does not: a delete, and the record goes to the trash.
- A file the snapshot describes, not verified and not being uploaded: an upload.
- Server ids are kept as they are now. Nothing synced is resent as a create.

A snapshot from a newer schema is refused. One from an older schema only with
`acceptOlderSchema`: that is the way back from a migration that did damage.

### Signals

`backupSignals(await store.snapshots.status(), now)`: `severity` (`ok`, `remind`, `warn`), the
`reasons`, time since the last snapshot, the last off-device copy and time since, and the entries
that exist only on this device and since when. Warn after **24 hours** of entries only here.
Remind after **4 hours**, when changes have waited over an hour for a snapshot, when the newest
snapshot is bad, over budget, or when storage is not persisted and something exists only here.
A backup export made after a change counts as an off-device copy of it.

`store.snapshots.markOffDevice('export', at)` after a backup zip is handed over.
`markOffDevice('sync', at)` after a drain: it records only when the whole queue is empty.

## Decisions

Made by Claude. Kevin can overrule any of them.

1. **Files live in IndexedDB as Blobs, not in OPFS.** Report 02 recommends it and argues OPFS only
   for SQLite. One transaction then covers a still, its file and its queue entry. OPFS would
   need a second, non-atomic write. The bytes sit in their own table, so listing never reads a
   photo. Behind `Store`, so it can change.
2. **A file's bytes stay 7 days after the server was seen to hold it,** then `pruneBlobs()` may
   free them. The description stays, with `prunedAt`. Nothing prunes on its own: the app calls
   it. Never before verify.
3. **No thumbnails here.** Report 02 says to keep one after pruning. Making it is the capture
   screen's job; it can be a second blob of the still.
4. **`remove` moves the record to a trash table.** The files stay. `restore` brings it back while
   the delete is unsent. Once the delete has left, restore is refused. When the server confirms,
   the record, its files and its server id are purged. `purgeTrash(before)` drops removals that
   never reached the server.
5. **`remove` does not cascade.** Removing a slate leaves its takes. The caller decides.
6. **`apply` uses the stored value as `from`,** whatever the patch said. A change to a record that
   is not there is skipped, as in the model.
7. **Text typed another way is stored and not queued.** 6' retyped as 6 ft is the same value.
8. **Taking the server value in a conflict never overwrites a value typed since.**
9. **Our own subscription, not Dexie's liveQuery.** One callback with table names. It does not
   see writes from another tab.
10. **Zip writer: `client-zip`** (2.7 kB gzipped, no dependencies, streams, zip64, stores without
    compressing). **Zip reader: our own,** 150 lines. No small library reads a zip by slicing a
    Blob, and slicing is what keeps a restore out of memory. It was checked by hand against
    archives from `zip`, `ditto` and Python's zip64 writer.
11. **Photos are stored, not compressed.** They do not shrink.
12. **Restore is all or nothing in intent, not in one transaction.** The archive is fully checked
    first. A failure while writing can still leave a partial store.
13. **A backup from another schema version is refused.** Version 2 added only the snapshot
    tables, which a backup does not hold, so a version 1 backup is still refused for its number
    alone. The migration of backup rows comes with the first change to a backed-up table.
14. **A re-zipped backup must keep the files at the top level.** Extra files are ignored.
15. **Server ids live in `remotes`, not on the records.** The model stays free of sync fields.
16. **Snapshots live in IndexedDB tables, not in OPFS.** One transaction writes a snapshot's row
    and its bytes, and the transactions that free photo bytes can read which ones a snapshot
    names. OPFS would split both, and it is evicted with IndexedDB anyway: it buys no safety.
17. **A snapshot does not copy photo bytes; it keeps them.** A photo freed by `pruneBlobs` can stay
    up to 7 more days, while a daily snapshot names it.
18. **Restore rebuilds the queue; the snapshot's own queue is not restored.** It is from the past.
19. **A snapshot from an older schema is refused unless asked.** No row migration runs on it: the
    app version that fixes a bad migration decides.
20. **A create after a confirmed delete reuses the client UUID.** If Flow PT keeps a retired
    record's UUID unique, the create is refused as a duplicate and needs a person. To check in
    the corpus.
21. **A file uploaded after the snapshot stays on Flow PT** with its record deleted. There is no
    file delete in the queue.
22. **Bad snapshots are dropped** by the next retention, not kept for inspection.
23. **The before-restore snapshot is taken in its own transaction.** If an edit lands between it
    and the restore, the restore starts again, three times, then refuses as `busy`.
24. **Every write transaction reads `snapshots`** to know which photo bytes to keep. A snapshot's
    own short write can then delay an edit by a few milliseconds.
25. **Templates sync, since #110.** They stayed on the device until then, as Flow PT had no place
    for them; now each project's list is JSON in a text field of its Project (fpt README, "The
    shared lists"). A slate or take keeps its template's id as text. No schema change: only
    `LOCAL_TABLES` changed, so a backup or snapshot from before still restores, and the first sync
    after sends the templates no queue entry names (`app/sync/shared.ts`, `push`).
26. **A project's own kinds of set reference sync as templates do, since #110.** Each reference
    still carries its kind as text, so Flow PT sees every kind used. Schema version 4 adds them with
    the references: a backup made before it is refused (decision 13), a snapshot from before it
    needs `acceptOlderSchema`.
27. **A drawing stays on the device; its flattened copy is a file of the still.** The photo is
    never touched. The flattener (`$lib/draw/flattener.ts`) makes the copy after the drawing
    changes, and drops the copies that no longer match while they are unsent. A copy already
    sent is not deleted (there is no file delete in the queue, 21, and an Artist may not delete an
    Attachment, corpus findings/143): once the new copy is verified, the old one is taken off the
    take's photos field instead (fpt README).
28. **What an import of the DIT's clips wrote stays on the device.** The takes hold the values and
    sync as any edit; the record of which import wrote what has no place in Flow PT. It is created
    in the import's undo entry, so an undo takes it back with the values. Schema version 7: a
    backup made before it is refused (decision 13), a snapshot from before it needs
    `acceptOlderSchema`.
29. **A record taken in from Flow PT is not on the undo stack** (#110). Undo takes back what this
    device did; a list read back is what another device did. `reconcile` writes past the editor.

## What a real iPad must still prove

- Is `persist()` granted to the home-screen app on iPadOS 27, and does a week of data survive.
- Quota: what `estimate()` reports, and what happens at the limit. Does the write fail cleanly.
- Blob size: the largest photo and the largest video IndexedDB takes in one row, and how slow a
  HEIC of 10 to 25 MB is to write on the capture path.
- Eviction: does deleting the icon, a full disk or a long idle wipe the store.
- Export: does `createWritable` exist in the home-screen app, can the file from the private file
  system go to the share sheet, and does a 5 GB zip fit. The export needs as much free space
  again as the data. Without it the zip is built in memory and a large one will fail.
- Import: does a multi-gigabyte file from the Files picker slice without being read whole.
- The screen locking mid-upload and mid-export.
- Snapshots: the time of a snapshot of a real week (2,000 takes and photos) on an iPad, and that
  it never stutters the take screen. Whether `CompressionStream` and `requestIdleCallback` exist
  in the home-screen app (without them: stored zips, a 200 ms timeout). Whether
  `visibilitychange` gives the hidden snapshot time to finish before the page is frozen.
- That 10 to 20 MB of snapshots does not slow the store's opening.

# store

On-device storage. Records, files, the sync queue and the backup. The app talks to the `Store`
interface. The implementation here is IndexedDB through Dexie. A Capacitor store can replace it.

## Modules

| module | pure | what it does |
|---|---|---|
| `types.ts` | types | `Store`, `BlobMeta`, `StorageStatus`, `BackupSource`, `BackupTarget`. |
| `tables.ts` | yes | The tables, from the model: one per scope, `still` and `template`. Parent keys, link keys, `dependsOn`, `LOCAL_TABLES`. |
| `schema.ts` | yes | The IndexedDB schema by version. How to add a version. |
| `storage.ts` | yes | `storageStatus`, `prunable`, `BLOB_KEEP_MS`. |
| `dexieStore.ts` | no | `openStore`: the `Store` on Dexie. |
| `archive.ts` | yes | The layout of a backup: paths, NDJSON, the manifest and its check. |
| `crc32.ts` | yes | CRC-32, for the restore. |
| `zipRead.ts` | no | A zip reader over a `Blob`: zip64, stored and deflated entries. |
| `backup.ts` | no | `exportBackup`, `saveBackup`, `backupToFile`, `importBackup`, the sinks. |

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

	outbox: OutboxPort;
	unsynced(): Promise<Unsynced>;
	resolve(entryId, pick): Promise<void>;
	retry(entryId): Promise<void>;
	remoteId(id): Promise<RemoteId | undefined>;

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
- Reads are plain promises. `subscribe` fires after each committed change with the names of the
  tables touched, plus `outbox`, `blobs`, `trash`. The UI wraps it in runes.
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
  `camera`, `lens`), `still` and `template`. Key `id`, index on the parent key.
- `template`: a live template, under its project (schema version 2). Kept on the device: it is in
  the backup and on the undo stack, and nothing is queued for it (`LOCAL_TABLES`).
- `blobs`: one row per file, without the bytes. `blobData`: the bytes.
- `outbox`: the queue. `remotes`: client UUID to server id. `trash`: removed records.
  `meta`: the queue counter.

## Schema versions

`schema.ts` holds `VERSIONS`. A shipped version is never edited. To change the schema, append
`{ version, stores, upgrade }`: `stores` lists only the tables that change, `upgrade` rewrites the
rows already there. `dexieStore.test.ts` proves the mechanism with a second version.

## Backup

A zip. `tables/<table>.ndjson` for every table, `blobs/<id>` for every file as captured,
`manifest.json` last. An archive without a manifest was cut short.

- `exportBackup(store, { now })` is a stream. `saveBackup(stream, sink)` pumps it into a sink.
  `backupToFile` picks the sink: the origin's private file system where the browser can write
  it, memory otherwise. Hand the file to `shareOrDownload` from `$lib/pwa/files`, on a tap.
  `removeExport()` frees the copy afterwards.
- `importBackup(store, file, { replace })` checks the whole archive first: manifest, counts, every
  checksum. Only then is the store touched. A store with data is refused unless `replace`.
- The backup holds the queue, the server ids and the trash. A restored iPad carries on syncing
  where the old one stopped.

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
13. **A backup from another schema version is refused.** There is one version. The migration of
    backup rows comes with the second.
14. **A re-zipped backup must keep the files at the top level.** Extra files are ignored.
15. **Server ids live in `remotes`, not on the records.** The model stays free of sync fields.
16. **Templates stay on the device.** Flow PT has no place for them; a slate or take keeps its
    template's id as text. The store skips the outbox for a table in `LOCAL_TABLES`. A backup
    made under schema version 1 is refused by version 2 (decision 13).

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

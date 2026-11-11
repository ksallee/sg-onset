# outbox

The sync queue. An entry is one thing the server does not have yet: a record to create, fields to
change, a record to delete, a file to upload. The core is pure. The runner and the foreground
watcher are the edge. Nothing here knows FPT: the server is a `Transport`.

## Modules

| module | pure | what it does |
|---|---|---|
| `types.ts` | yes | `Entry`, `Op`, `EntryState`, `Attention`, `Policy` and its defaults. |
| `queue.ts` | yes | `enqueue`: adds an operation, merging it into what is still unsent. |
| `levels.ts` | yes | `levels`, `blockers`: what waits for what. |
| `plan.ts` | yes | `planBatch`: what to check, what to send as one batch, which file to upload. |
| `backoff.ts` | yes | `backoffMs`, `exhausted`: the retry schedule. Time and jitter are passed in. |
| `machine.ts` | yes | The moves between entry states. |
| `conflict.ts` | yes | `verdict`, `checkUpdate`, `applyServerRead`, `resolveConflict`. |
| `recovery.ts` | yes | `judge`: did an attempt with no answer land. |
| `select.ts` | yes | `unsynced`: the counts the UI shows. |
| `upload.ts` | yes | `planParts`, `partMargin`, `expiring`: the upload policy. |
| `transport.ts` | types | The `Transport` interface and `TransportError`. |
| `port.ts` | mostly | `OutboxPort`: what the runner asks of storage. `settle` (pure), `memoryPort`. |
| `runner.ts` | no | `createRunner`: drains the queue through a transport. |
| `foreground.ts` | no | `runInForeground`: drains while the page is visible and online. `browserPage`, `browserEnv`. |
| `fakeTransport.ts` | no | An in-memory transport that can be told to fail. For tests. |
| `testkit.ts` | yes | Builders for the tests. |

## Transport

```ts
interface Transport {
	push(ops: PushOp[], signal?: AbortSignal): Promise<PushResult>;
	lookup(refs: RecordRef[], signal?: AbortSignal): Promise<Found[]>;
	read(requests: ReadRequest[], signal?: AbortSignal): Promise<ServerRecord[]>;
	beginUpload(blob: BlobRef, signal?: AbortSignal): Promise<UploadSession>;
	renewUpload(session: UploadSession, signal?: AbortSignal): Promise<UploadSession>;
	uploadPart(session: UploadSession, part: { index: number; data: Blob }, signal?: AbortSignal): Promise<SentPart>;
	finishUpload(session: UploadSession, parts: SentPart[], signal?: AbortSignal): Promise<{ remoteId?: RemoteId }>;
	verifyUpload(blob: BlobRef, remoteId?: RemoteId, signal?: AbortSignal): Promise<{ verified: boolean; remoteId?: RemoteId }>;
}

type PushOp = { entryId: string; op: CreateOp | UpdateOp | DeleteOp; remoteId?: RemoteId; dependsOn: readonly string[]; links: Record<string, RemoteId> };
type PushResult =
	| { outcome: 'applied'; remoteIds: Record<string, RemoteId> }
	| { outcome: 'refused'; refusals: { entryId: string; reason: 'duplicate' | 'invalid' | 'gone'; message?: string }[] };
```

What an implementation must hold to:

- `push` is one batch of one dependency level, all or nothing. No operation in it links to a
  record created in it. The runner guarantees that.
- Every create carries the client UUID in a field the server keeps unique. A create sent twice is
  then refused as `duplicate` and never made twice.
- `lookup` finds records by client UUID. `read` returns the server's values of the fields asked
  for, in our field form. The mapping both ways is the transport's.
- A definite answer is returned. Trouble is thrown as `TransportError`:
  `unreachable` (never left), `unauthorized` (no session), `failed` (5xx, rate limit; nothing
  landed), `timeout` (may have landed), `expired` (upload URL dead). Anything else thrown counts
  as `timeout`.
- An answer from `finishUpload` proves nothing. `verifyUpload` says whether the file is there.

## Entry states

| state | meaning | leaves by |
|---|---|---|
| `pending` | Never sent, or known not to have landed. | An attempt starts. |
| `inFlight` | An attempt has started. Written before the request leaves. | The answer, or the next drain. |
| `sentUnconfirmed` | May have landed: timed out, the app died, refused as duplicate, or uploaded and not verified. | A check against the server. |
| `confirmed` | The server has it. | The entry leaves the queue. |
| `failedRetryable` | The server did not take it. Retried at `nextAttemptAt`. | The retry, or attention after `maxAttempts`. |
| `needsAttention` | Only a person can move it on: `conflict`, `refused`, `gone`, `attempts`, `blobMissing`. | `resolveConflict` or `retry`. |

```
pending, failedRetryable ──> inFlight ──> confirmed
                               ├────────> sentUnconfirmed ──> confirmed
                               │                 └──────────> failedRetryable, needsAttention
                               ├────────> failedRetryable     the server did not take it
                               ├────────> pending             it never left: offline, no session
                               └────────> needsAttention      refused, gone, out of attempts
needsAttention ──> pending                                    a person retried or chose
pending, failedRetryable ──> confirmed, needsAttention        the read before sending
```

## How a drain goes

1. Entries found in flight are marked `sentUnconfirmed`. The last drain died mid-request.
2. Loop, while the page is visible and online:
   - Unconfirmed entries that are due are checked. A create or a delete by `lookup`, an update by
     `read`, an upload by `verifyUpload`. Landed: confirmed. Not landed: scheduled to go again.
   - Else the open entries of level 0 go as one batch, oldest first, at most `maxOps`. The fields
     of the updates are read first and compared (see Conflicts). Then the entries are written as
     in flight, then pushed.
   - Else one file is uploaded, part by part, then left as `sentUnconfirmed` for the check.
   - Else the drain ends: `idle`, or `waiting` with the time of the next retry.
3. `unreachable` or `unauthorized` ends the drain. The attempt is not counted.

`runInForeground` calls `drain()` when the page becomes visible, when the network returns, when a
retry falls due, and on `kick()`. It calls `stop()` when the page is hidden.

## Coalescing

- An edit merges into the last unsent entry of the same record. Into a create: the create carries
  the new values. Into an update: per field, first base, last value.
- A field set back to its base leaves the entry. An entry with no field left leaves the queue.
  So undo of an unsent edit sends nothing.
- An entry that is in flight, unconfirmed or needs attention is never changed. The new edit is its
  own entry behind it. So undo of a sent edit sends the inverse.
- A delete of a record never sent removes everything queued for it. A create after an unsent
  delete cancels the delete.

## Conflicts

Field level. `base` is the value we believe the server held when the edit was made.

- Server equals ours: nothing to send, no conflict.
- Server equals base: send ours.
- Otherwise: a conflict. Nothing is sent, nothing is dropped. The entry needs attention and holds
  base, ours and theirs.

Values compare with the model's `sameValue`. `resolveConflict` takes a pick per field: `mine`
sends ours over theirs, `theirs` returns the patch that sets the local record to the server value.

## Decisions

Made by Claude. Kevin can overrule any of them.

1. **One conflicting field holds its whole entry.** The other fields edited with it wait too.
   Reason: one state per entry. Splitting an entry is possible later.
2. **An entry that needs attention blocks later entries of the same record,** and a create that
   needs attention blocks its children. Other records go on.
3. **A delete is not checked for conflicts.** A delete of a record the server no longer has
   counts as done.
4. **The time-out check waits one backoff step,** then looks. If the server commits later still,
   the resend is refused as a duplicate and looked up. Updates are safe to resend.
5. **A check that fails is retried without counting an attempt.** A resend counts.
6. **Backoff: 2 s, doubling, capped at 5 min, 8 attempts,** jitter between half and the whole
   delay. Then the entry needs attention. Offline and signed-out never count.
7. **25 record operations per batch.** A guess until the FPT transport is measured.
8. **One file at a time, after the record batches of the moment.** Records are small and matter
   most.
9. **An expired upload URL is renewed and the upload carries on.** If the transport cannot
   continue, the file starts again from part one. Three expiries in a row with no part sent is a
   failure. A part is not started on a URL with less than 60 s left, or less than one and a half
   times what the last part took.
10. **A failed part is tried three times** before the upload fails.
11. **No upload progress is kept across drains.** A killed upload starts again unless the check
    finds it landed.
12. **A transport call with no answer after 120 s counts as timed out.**
13. **`applied` with no server id for a create is looked up,** not trusted.
14. **One tab.** Two tabs of the app would both drain. A lock (`navigator.locks`) is not built.
15. **No pull.** The outbox pushes. Reading other people's changes from the server is not here.

## What a real iPad must still prove

- What a request in flight does when the screen locks: does it fail, stall, or finish unseen.
  The runner treats all three as "may have landed", but the 120 s timeout is a guess.
- Whether `visibilitychange` and `pagehide` fire before the page is suspended, every time.
- How long an upload of a full-resolution photo takes on set Wi-Fi and on cellular, against the
  14 minute URL life.
- Whether `navigator.onLine` can be trusted on iPadOS, or says online on a dead network.
- Timers after a long sleep: does the scheduled retry fire on wake.

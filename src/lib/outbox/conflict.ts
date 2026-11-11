// Conflict detection. The server has no conditional write, so the client reads the fields it is
// about to change and compares. Pure.
//
// The rule, per field, with `base` the value we believe the server held when the edit was made:
// - server equals ours: nothing to send. No conflict, whoever wrote it.
// - server equals base: nobody else touched it. Send ours.
// - anything else: a conflict. Nothing is sent and nothing is dropped. The entry waits for a
//   person, with base, ours and theirs.
// Values compare with the model's `sameValue`: 6' and 6 ft are one value; a missing value and null
// are one value. `updated_at` is no help here: it moves on uploads and on links from the other
// side, so only the field values are compared.

import type { Patch } from '$lib/model/patch';
import { sameValue } from '$lib/model/value';
import { isOpen, type Entry, type FieldConflict, type FieldEdit, type Queue } from './types';

export type Verdict = 'send' | 'same' | 'conflict';

export function verdict(edit: FieldEdit, server: unknown): Verdict {
	if (sameValue(server, edit.value)) return 'same';
	if (sameValue(server, edit.base)) return 'send';
	return 'conflict';
}

/** The fields of an update sorted by verdict. `server` holds the server's value of each key. */
export function checkUpdate(
	changes: Record<string, FieldEdit>,
	server: Record<string, unknown>
): { send: Record<string, FieldEdit>; conflicts: FieldConflict[] } {
	const send: Record<string, FieldEdit> = {};
	const conflicts: FieldConflict[] = [];
	for (const [key, edit] of Object.entries(changes)) {
		const v = verdict(edit, server[key]);
		if (v === 'send') send[key] = edit;
		if (v === 'conflict') conflicts.push({ key, base: edit.base, local: edit.value, server: server[key] });
	}
	return { send, conflicts };
}

/**
 * The queue after reading the server's values for an unsent update. `server` undefined: the
 * record is gone. One conflicting field holds the whole entry: its other fields wait with it.
 */
export function applyServerRead(queue: Queue, id: string, server: Record<string, unknown> | undefined): Entry[] {
	return queue.map((e) => {
		if (e.id !== id || !isOpen(e) || e.op.kind !== 'update') return e;
		if (!server) return { ...e, state: 'needsAttention', attention: { reason: 'gone' } };
		const { send, conflicts } = checkUpdate(e.op.changes, server);
		const { nextAttemptAt: _n, ...rest } = e;
		if (conflicts.length) return { ...rest, state: 'needsAttention', attention: { reason: 'conflict', conflicts } };
		const left = Object.keys(send).length;
		if (!left) return { ...rest, state: 'confirmed' };
		if (left === Object.keys(e.op.changes).length) return e;
		return { ...e, op: { ...e.op, changes: send } };
	});
}

/**
 * A person picks, per conflicting field.
 * - `mine`: our value will overwrite the server's. The base becomes the server value seen, so a
 *   further change on the server is caught again.
 * - `theirs`: the field leaves the entry. `local` is the patch that sets the local record to the
 *   server value; the caller applies it to the store without queueing it.
 * The entry goes back to pending, or away if nothing is left to send.
 */
export function resolveConflict(
	queue: Queue,
	id: string,
	pick: (conflict: FieldConflict) => 'mine' | 'theirs'
): { queue: Entry[]; local: Patch } {
	const local: { id: string; key: string; from: unknown; to: unknown }[] = [];
	const next = queue.flatMap((e): Entry[] => {
		if (e.id !== id || e.state !== 'needsAttention' || e.attention?.reason !== 'conflict' || e.op.kind !== 'update') {
			return [e];
		}
		const changes = { ...e.op.changes };
		for (const c of e.attention.conflicts) {
			if (pick(c) === 'mine') changes[c.key] = { base: c.server, value: c.local };
			else {
				delete changes[c.key];
				local.push({ id: e.op.recordId, key: c.key, from: c.local, to: c.server });
			}
		}
		if (!Object.keys(changes).length) return [];
		const { attention: _a, nextAttemptAt: _n, ...rest } = e;
		return [{ ...rest, op: { ...e.op, changes }, state: 'pending', attempts: 0 }];
	});
	return { queue: next, local };
}

// Dependency levels. The server cannot link rows created in the same batch, so the queue goes
// out one level at a time: level 0 now, level 1 once level 0 is confirmed. Pure.
//
// An entry waits for:
// - the entry before it on the same record (edits of a record go in order, a file after its record);
// - the create of every record it depends on, while that create is still in the queue.
// A dependency with no create in the queue is on the server already.

import { isActive, type Entry, type Queue } from './types';

type Index = { previous: Map<string, Entry | undefined>; creates: Map<string, Entry> };

function index(queue: Queue): Index {
	const active = queue.filter(isActive).sort((a, b) => a.seq - b.seq);
	const previous = new Map<string, Entry | undefined>();
	const lastOf = new Map<string, Entry>();
	const creates = new Map<string, Entry>();
	for (const e of active) {
		previous.set(e.id, lastOf.get(e.op.recordId));
		lastOf.set(e.op.recordId, e);
		if (e.op.kind === 'create') creates.set(e.op.recordId, e);
	}
	return { previous, creates };
}

function blockersIn(ix: Index, entry: Entry): Entry[] {
	const found = new Set<Entry>();
	for (const id of entry.dependsOn) {
		const create = ix.creates.get(id);
		if (create && create !== entry) found.add(create);
	}
	const before = ix.previous.get(entry.id);
	if (before) found.add(before);
	return [...found].sort((a, b) => a.seq - b.seq);
}

/** The active entries `entry` waits for, in order of arrival. */
export function blockers(queue: Queue, entry: Entry): Entry[] {
	return blockersIn(index(queue), entry);
}

/** Entry id to level, for every active entry. Level 0 waits for nothing. */
export function levels(queue: Queue): Map<string, number> {
	const ix = index(queue);
	const level = new Map<string, number>();
	const visiting = new Set<string>();
	for (const root of queue) {
		if (!isActive(root) || level.has(root.id)) continue;
		// Depth first with our own stack: a week of edits can chain thousands deep.
		const stack: Entry[] = [root];
		while (stack.length) {
			const e = stack[stack.length - 1];
			if (level.has(e.id)) {
				stack.pop();
				continue;
			}
			visiting.add(e.id);
			// A blocker being visited is a cycle: it cannot be waited for, so it is skipped.
			const waits = blockersIn(ix, e).filter((b) => level.has(b.id) || !visiting.has(b.id));
			const unknown = waits.filter((b) => !level.has(b.id));
			if (unknown.length) {
				stack.push(...unknown);
				continue;
			}
			level.set(e.id, waits.length ? 1 + Math.max(...waits.map((b) => level.get(b.id)!)) : 0);
			visiting.delete(e.id);
			stack.pop();
		}
	}
	return level;
}

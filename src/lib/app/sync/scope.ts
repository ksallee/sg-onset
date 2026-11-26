// The outbox as one project sees it. The runner drains through this port, so only the entries of
// the linked project go to its FPT project. Without it the transport would answer the linked FPT
// project's id for every project's create (lib/fpt README, decision 1), and a second project on
// the device (the sample) would land in it. On a site that lacks an optional entity, the runner's
// port also leaves out what waits for it (`withoutWaiting`). The edge: it reads the store to find
// which project a record belongs to.

import type { OutboxPort } from '$lib/outbox/port';
import type { Entry, Queue } from '$lib/outbox/types';
import type { DexieStore } from '$lib/store/dexieStore';
import { isTable } from '$lib/store/tables';
import { entryParent, parentOf, scopedUpdate } from './queue';
import { waits, withoutFields } from './waiting';

type ScopeStore = Pick<DexieStore, 'get' | 'rows' | 'outbox'>;
type Parent = { table: string; id: string };

/** Deepest chain: still, take, slate, shoot day, project. */
const MAX_DEPTH = 8;

export interface ProjectScope {
	/** The ids of the entries of `queue` that belong to the project. */
	mine(queue: Queue): Promise<Set<string>>;
	/** The outbox, kept to the project's entries. */
	port: OutboxPort;
}

export function projectScope(store: ScopeStore, projectId: string): ProjectScope {
	// Record id to project id. A record keeps its project, so a found owner is kept. An unknown one
	// is not: the record may be written later.
	const owners = new Map<string, string>();

	async function mine(queue: Queue): Promise<Set<string>> {
		let trash: Map<string, { table: string; record: Record<string, unknown> }> | undefined;
		const trashed = async (id: string) => {
			trash ??= new Map(((await store.rows('trash')) as { id: string; table: string; record: Record<string, unknown> }[]).map((r) => [r.id, r]));
			return trash.get(id)?.record;
		};

		async function ownerOf(table: string, id: string, hint: Parent | undefined, depth: number): Promise<string | undefined> {
			if (table === 'project') return id;
			const known = owners.get(id);
			if (known !== undefined || depth > MAX_DEPTH || !isTable(table)) return known;
			let parent = hint;
			if (!parent) {
				const row = ((await store.get(table, id)) as Record<string, unknown> | undefined) ?? (await trashed(id));
				parent = row ? parentOf(table, row) : undefined;
			}
			const owner = parent ? await ownerOf(parent.table, parent.id, undefined, depth + 1) : undefined;
			if (owner !== undefined) owners.set(id, owner);
			return owner;
		}

		const ids = new Set<string>();
		for (const e of queue) {
			if ((await ownerOf(e.op.table, e.op.recordId, entryParent(e), 0)) === projectId) ids.add(e.id);
		}
		return ids;
	}

	const port: OutboxPort = {
		async entries(): Promise<Entry[]> {
			const queue = await store.outbox.entries();
			const ids = await mine(queue);
			return queue.filter((e) => ids.has(e.id));
		},
		async update(fn) {
			const ids = await mine(await store.outbox.entries());
			// An entry queued since is not in `ids`: it is left alone, and the next step sees it.
			const after = await store.outbox.update(scopedUpdate(fn, (e) => ids.has(e.id)));
			return after.filter((e) => ids.has(e.id));
		},
		remoteIds: (ids) => store.outbox.remoteIds(ids),
		blob: (id) => store.outbox.blob(id)
	};

	return { mine, port };
}

/**
 * The outbox without the entries that wait for an entity the site lacks (waiting.ts): the runner
 * drains through it, so they stay in the queue as they are, never sent, never dropped (Kevin, #117).
 * The keys of an optional field the site lacks (`fields`, #138) are left out of what the runner
 * sees and writes back: the rest of the record goes, and the value waits on the record itself.
 */
export function withoutWaiting(port: OutboxPort, tables: readonly string[], fields: readonly string[] = []): OutboxPort {
	if (!tables.length && !fields.length) return port;
	const sendable = (e: Entry) => !waits(e, tables);
	const seen = (queue: Queue) => queue.map((e) => withoutFields(e, fields));
	return {
		entries: async () => seen((await port.entries()).filter(sendable)),
		update: async (fn) => seen((await port.update(scopedUpdate((q) => fn(seen(q)), sendable))).filter(sendable)),
		remoteIds: (ids) => port.remoteIds(ids),
		blob: (id) => port.blob(id)
	};
}

// The queue as sync shows and scopes it: what waits by kind, the change of a drain kept to one
// project's entries, and a conflict in words. Pure.

import { findField, SCOPES, type Scope } from '$lib/model/catalogue';
import { formatField } from '$lib/model/fieldText';
import type { UnitSystem } from '$lib/model/length';
import { fieldLabel, unitLabel } from '$lib/i18n/modelText';
import { t } from '$lib/i18n/messages';
import type { Entry, FieldConflict, Queue } from '$lib/outbox/types';
import { isTable, PARENTS, TABLES, type TableName } from '$lib/store/tables';

/** A kind of record by its table, or `file` for the bytes of a photo. */
export type PendingKind = TableName | 'file';

const ORDER: PendingKind[] = [...TABLES, 'file'];

/** What waits to be sent, by kind, in the model's order, photos' bytes last. Not what needs a person. */
export function pendingByKind(queue: Queue): { kind: PendingKind; count: number }[] {
	const counts = new Map<PendingKind, number>();
	for (const e of queue) {
		if (e.state === 'needsAttention' || e.state === 'confirmed') continue;
		const kind: PendingKind | undefined = e.op.kind === 'blob' ? 'file' : isTable(e.op.table) ? e.op.table : undefined;
		if (kind) counts.set(kind, (counts.get(kind) ?? 0) + 1);
	}
	return ORDER.filter((k) => counts.has(k)).map((kind) => ({ kind, count: counts.get(kind)! }));
}

/**
 * `fn`, a change of the queue, run on the entries `mine` keeps only. The others are passed through
 * as they are. The runner then drains one project and leaves the others' entries alone.
 */
export function scopedUpdate(fn: (queue: Queue) => Queue, mine: (entry: Entry) => boolean): (queue: Queue) => Entry[] {
	return (queue) => {
		const own = queue.filter(mine);
		const rest = queue.filter((e) => !mine(e));
		return [...rest, ...fn(own)].sort((a, b) => a.seq - b.seq);
	};
}

/** The parent of a record, from its values. A project has none. */
export function parentOf(table: string, values: Record<string, unknown>): { table: TableName; id: string } | undefined {
	if (!isTable(table)) return undefined;
	const link = PARENTS[table];
	const id = link ? values[link.key] : undefined;
	return link && typeof id === 'string' && id !== '' ? { table: link.table, id } : undefined;
}

/** The parent of a record a create carries, read from its values. Undefined when the entry does not say. */
export function entryParent(entry: Entry): { table: TableName; id: string } | undefined {
	return entry.op.kind === 'create' ? parentOf(entry.op.table, entry.op.fields) : undefined;
}

function shown(scope: Scope, key: string, value: unknown, system: UnitSystem): string {
	const found = findField(scope, key);
	if (!found) return value == null ? t('sync.conflict.empty') : String(value);
	const { def } = found;
	if (def.type === 'boolean') return value === true ? t('common.yes') : t('common.no');
	const text = formatField(def, value, system);
	if (text === '') return t('sync.conflict.empty');
	const numeric = def.type === 'number' || def.type === 'integer';
	return numeric && def.unit ? `${text} ${unitLabel(def.unit)}` : text;
}

/** The fields of a conflict: label, ours and theirs, as the device shows values. */
export function conflictLines(table: string, conflicts: readonly FieldConflict[], system: UnitSystem): { key: string; label: string; mine: string; theirs: string }[] {
	const scope = (SCOPES as readonly string[]).includes(table) ? (table as Scope) : undefined;
	return conflicts.map((c) => {
		const found = scope ? findField(scope, c.key) : undefined;
		return {
			key: c.key,
			label: found ? fieldLabel(found.def, found.end) : c.key,
			mine: scope ? shown(scope, c.key, c.local, system) : String(c.local ?? t('sync.conflict.empty')),
			theirs: scope ? shown(scope, c.key, c.server, system) : String(c.server ?? t('sync.conflict.empty'))
		};
	});
}

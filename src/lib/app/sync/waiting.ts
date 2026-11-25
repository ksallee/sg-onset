// What waits on the device for an entity the site lacks (Kevin, #117). Set Reference is optional:
// on a site without it, the entries of the set references stay in the queue, as they are, and the
// runner never sees them. Nothing is dropped and nothing needs a person. They go at the first drain
// after an admin enables the entity and runs Set Up Fields, their links to slates after them. A Set
// Shot is no record on the device: what waits for it is in the codes on the slates. Pure.

import type { Unsynced } from '$lib/outbox/select';
import type { Entry } from '$lib/outbox/types';

/**
 * The tables whose entries wait on the device: the set references', on a site without Set
 * Reference; the templates', the reference kinds' and the rigs', on a site without the Project
 * fields (#110, #138).
 */
export function waitingTables(setup: { referencesMissing?: boolean; setShotsMissing?: boolean; listsMissing?: boolean }): string[] {
	return [...(setup.referencesMissing ? ['reference'] : []), ...(setup.listsMissing ? ['template', 'referenceKind', 'rig'] : [])];
}

/** Whether an entry waits for an entity the site lacks. */
export function waits(entry: Entry, tables: readonly string[]): boolean {
	return tables.includes(entry.op.table);
}

/** The queue in two, each in order: what the runner may send, and what waits for an entity the site lacks. */
export function splitWaiting(queue: readonly Entry[], tables: readonly string[]): { open: Entry[]; waiting: Entry[] } {
	return { open: queue.filter((e) => !waits(e, tables)), waiting: queue.filter((e) => waits(e, tables)) };
}

/**
 * The changes waiting for other projects on this device: the whole queue less the current
 * project's, what waits there for an entity included.
 */
export function elsewhereCount(everything: Unsynced | undefined, scoped: Unsynced | undefined, waiting: Unsynced | undefined): number {
	const all = everything?.entries ?? 0;
	return Math.max(0, all - (scoped?.entries ?? all) - (waiting?.entries ?? 0));
}

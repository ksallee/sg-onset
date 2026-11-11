// Live reads of the store, as runes. A read runs once, again after every commit that touches the
// tables it names, and again when a rune it read changes (a parent id, a filter). Built on the
// store's `subscribe`. Call these while a component initialises; read `.value` in the markup or
// in a `$derived`. On the server nothing is read: the value stays the initial one.
import { untrack } from 'svelte';
import type { Unsynced } from '$lib/outbox/select';
import type { Entry } from '$lib/outbox/types';
import type { DexieStore } from '$lib/store/dexieStore';
import type { RowOf, TableName } from '$lib/store/tables';
import { maybeApp } from './app.svelte';
import { latest, touches } from './live';

export interface Live<T> {
	readonly value: T;
	/** The first read has answered. */
	readonly ready: boolean;
	/** What the last read threw, if it did. */
	readonly error: unknown;
}

/**
 * `read` runs against the store; what it returns is `value`. `tables`: the tables whose changes
 * make it run again (record tables, or the store's `outbox`, `blobs`, `trash`); none means any.
 * Runes read by `read` before its first `await` are tracked, so `() => store.list('take', id)`
 * follows `id`.
 */
export function live<T>(tables: readonly string[], read: (store: DexieStore) => Promise<T> | T, initial: T): Live<T> {
	const app = maybeApp();
	let value = $state.raw(initial);
	let ready = $state(false);
	let error = $state.raw<unknown>(undefined);

	$effect(() => {
		if (!app) return;
		const order = latest();
		let stopped = false;
		const load = () => {
			const n = order.begin();
			const settle = (run: () => void) => {
				if (!stopped && order.current(n)) run();
			};
			let answer: Promise<T> | T;
			try {
				answer = read(app.store);
			} catch (e) {
				return settle(() => (error = e));
			}
			Promise.resolve(answer).then(
				(v) =>
					settle(() => {
						value = v;
						ready = true;
						error = undefined;
					}),
				(e) => settle(() => (error = e))
			);
		};
		load();
		const stop = app.store.subscribe((event) => {
			if (touches(event.tables, tables)) untrack(load);
		});
		return () => {
			stopped = true;
			stop();
		};
	});

	return {
		get value() {
			return value;
		},
		get ready() {
			return ready;
		},
		get error() {
			return error;
		}
	};
}

/** The records of a table; with `parent`, the children of that record, and none while it is undefined. */
export function liveList<T extends TableName>(table: T, parent?: () => string | undefined): Live<RowOf<T>[]> {
	return live<RowOf<T>[]>(
		[table],
		(store) => {
			if (!parent) return store.list(table);
			const id = parent();
			return id === undefined ? [] : store.list(table, id);
		},
		[]
	);
}

/** One record, by an id that may change or be missing. */
export function liveRecord<T extends TableName>(table: T, id: () => string | undefined): Live<RowOf<T> | undefined> {
	return live<RowOf<T> | undefined>(
		[table],
		(store) => {
			const key = id();
			return key === undefined ? undefined : store.get(table, key);
		},
		undefined
	);
}

/** The outbox's counts: what the sync status shows. */
export function liveUnsynced(): Live<Unsynced | undefined> {
	return live<Unsynced | undefined>(['outbox'], (store) => store.unsynced(), undefined);
}

/** The whole sync queue, in order of arrival. */
export function liveQueue(): Live<Entry[]> {
	return live<Entry[]>(['outbox'], (store) => store.outbox.entries(), []);
}

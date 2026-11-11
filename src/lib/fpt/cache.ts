// Where a site's resolved schema is kept on the device. A tiny port, injected: not the store's
// tables, so a backup or a restore of the records never carries one site's schema to another.

export interface KeyValue {
	get(key: string): Promise<string | undefined>;
	set(key: string, value: string): Promise<void>;
	delete(key: string): Promise<void>;
}

/** The key a site's resolution is kept under. */
export function resolutionKey(site: string): string {
	return `schema:${site}`;
}

/** In memory: for tests, and for a page load with no storage. */
export function memoryKeyValue(): KeyValue & { map: Map<string, string> } {
	const map = new Map<string, string>();
	return {
		map,
		get: async (key) => map.get(key),
		set: async (key, value) => void map.set(key, value),
		delete: async (key) => void map.delete(key)
	};
}

/** Over `localStorage` or anything shaped like it. Blocked storage reads as empty and keeps nothing. */
export function storageKeyValue(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>, prefix = 'sg-onset:fpt:'): KeyValue {
	const quiet = <T>(fn: () => T, fallback: T): T => {
		try {
			return fn();
		} catch {
			return fallback;
		}
	};
	return {
		get: async (key) => quiet(() => storage.getItem(prefix + key) ?? undefined, undefined),
		set: async (key, value) => quiet(() => storage.setItem(prefix + key, value), undefined),
		delete: async (key) => quiet(() => storage.removeItem(prefix + key), undefined)
	};
}

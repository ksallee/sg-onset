// Ask the browser to keep our storage (IndexedDB, cached files)
// rather than evict it under pressure. Safari evicts script-written storage of sites
// unused for 7 days unless the app is on the home screen or storage is persisted.

/** True when storage is (now) persistent; false when refused or unsupported. Never throws. */
export async function persistStorage(): Promise<boolean> {
	const storage = typeof navigator === 'undefined' ? undefined : navigator.storage;
	if (!storage?.persist) return false;
	try {
		return (await storage.persisted?.()) || (await storage.persist());
	} catch {
		return false;
	}
}

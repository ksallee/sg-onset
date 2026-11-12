// Ask the browser to keep our storage (IndexedDB, cached files)
// rather than evict it under pressure. Safari evicts script-written storage of sites
// unused for 7 days unless the app is on the home screen or storage is persisted.

import { persistAsksWithDialog } from './platform';

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

/**
 * Asks again as the app opens, where asking shows no dialog. A browser that said no to a new
 * install says yes once it counts the app as used, and nothing else would ask it again.
 */
export async function persistQuietly(): Promise<boolean> {
	if (typeof navigator === 'undefined' || persistAsksWithDialog(navigator.userAgent)) return false;
	return persistStorage();
}

// What the Storage section of Settings says. Pure.

import { formatBytes } from '$lib/app/format';
import type { StorageStatus } from '$lib/store/types';

/** "12 MB" and "2 GB" for the used line, or nothing when the browser does not say. */
export function storageUse(status: Pick<StorageStatus, 'usage' | 'quota'> | undefined): { used: string; quota: string } | undefined {
	if (status?.usage === undefined || status.quota === undefined) return undefined;
	return { used: formatBytes(status.usage), quota: formatBytes(status.quota) };
}

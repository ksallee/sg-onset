// Storage facts the UI shows, and when a file's local bytes may go. Pure.

import type { BlobMeta, StorageStatus } from './types';

/** How long the bytes of a file stay on the device after the server was seen to hold it. */
export const BLOB_KEEP_MS = 7 * 24 * 3600 * 1000;

export function storageStatus(persisted: boolean, estimate: { usage?: number; quota?: number } | undefined): StorageStatus {
	const { usage, quota } = estimate ?? {};
	return {
		persisted,
		...(usage !== undefined ? { usage } : {}),
		...(quota !== undefined ? { quota } : {}),
		...(usage !== undefined && quota !== undefined ? { free: Math.max(0, quota - usage) } : {}),
		...(usage !== undefined && quota ? { usedFraction: usage / quota } : {})
	};
}

/** May the local bytes go. Never before the upload is verified. */
export function prunable(meta: BlobMeta, now: number, keepMs: number = BLOB_KEEP_MS): boolean {
	return meta.verifiedAt !== undefined && meta.prunedAt === undefined && now - meta.verifiedAt >= keepMs;
}

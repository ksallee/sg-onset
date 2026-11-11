import { describe, expect, it } from 'vitest';
import { BLOB_KEEP_MS, prunable, storageStatus } from './storage';
import type { BlobMeta } from './types';

describe('storageStatus', () => {
	it('carries the browser estimate, with what is free and the fraction used', () => {
		expect(storageStatus(true, { usage: 250, quota: 1000 })).toEqual({
			persisted: true,
			usage: 250,
			quota: 1000,
			free: 750,
			usedFraction: 0.25
		});
	});

	it('says only what it knows', () => {
		expect(storageStatus(false, undefined)).toEqual({ persisted: false });
		expect(storageStatus(false, { usage: 10 })).toEqual({ persisted: false, usage: 10 });
		expect(storageStatus(true, { usage: 0, quota: 0 })).toEqual({ persisted: true, usage: 0, quota: 0, free: 0 });
	});

	it('never reports less than nothing free', () => {
		expect(storageStatus(true, { usage: 1200, quota: 1000 }).free).toBe(0);
	});
});

describe('prunable', () => {
	const meta: BlobMeta = { id: 'b', table: 'still', recordId: 'p', type: 'image/jpeg', size: 1, createdAt: 0 };

	it('never frees a file the server has not been seen to hold', () => {
		expect(prunable(meta, 1e15, 0)).toBe(false);
	});

	it('frees a verified file once the keep time has passed', () => {
		const verified = { ...meta, verifiedAt: 1000 };
		expect(prunable(verified, 1000 + BLOB_KEEP_MS - 1)).toBe(false);
		expect(prunable(verified, 1000 + BLOB_KEEP_MS)).toBe(true);
		expect(prunable(verified, 1500, 500)).toBe(true);
	});

	it('does not free twice', () => {
		expect(prunable({ ...meta, verifiedAt: 1, prunedAt: 2 }, 1e15, 0)).toBe(false);
	});

	it('keeps files for seven days by default', () => {
		expect(BLOB_KEEP_MS).toBe(7 * 24 * 3600 * 1000);
	});
});

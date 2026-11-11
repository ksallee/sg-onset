import { describe, expect, it } from 'vitest';
import { blobPath, checkManifest, fromNdjson, MANIFEST_PATH, parsePath, tablePath, toNdjson, type Manifest } from './archive';

describe('paths', () => {
	it('names a file per table and per blob', () => {
		expect(tablePath('take')).toBe('tables/take.ndjson');
		expect(blobPath('3f2a-b1')).toBe('blobs/3f2a-b1');
	});

	it('reads them back', () => {
		expect(parsePath(MANIFEST_PATH)).toEqual({ kind: 'manifest' });
		expect(parsePath(tablePath('outbox'))).toEqual({ kind: 'table', name: 'outbox' });
		expect(parsePath(blobPath('3f2a-b1'))).toEqual({ kind: 'blob', id: '3f2a-b1' });
	});

	it('survives an id with a slash or a space', () => {
		expect(parsePath(blobPath('a/b c'))).toEqual({ kind: 'blob', id: 'a/b c' });
		expect(blobPath('a/b c')).not.toContain('a/b');
	});

	it('ignores what an unzip tool adds, and folders', () => {
		expect(parsePath('__MACOSX/._manifest.json')).toBeUndefined();
		expect(parsePath('tables/')).toBeUndefined();
		expect(parsePath('blobs/')).toBeUndefined();
		expect(parsePath('tables/take.json')).toBeUndefined();
		expect(parsePath('readme.txt')).toBeUndefined();
	});
});

describe('ndjson', () => {
	it('writes one row per line and reads them back', () => {
		const rows = [{ id: 'a', notes: 'two\nlines' }, { id: 'b', n: 1.5, list: ['x'] }];
		const text = toNdjson(rows);
		expect(text.split('\n')).toHaveLength(3);
		expect(text.endsWith('\n')).toBe(true);
		expect(fromNdjson(text)).toEqual(rows);
	});

	it('is empty for no rows, and skips blank lines', () => {
		expect(toNdjson([])).toBe('');
		expect(fromNdjson('')).toEqual([]);
		expect(fromNdjson('{"id":"a"}\n\n{"id":"b"}\r\n')).toEqual([{ id: 'a' }, { id: 'b' }]);
	});
});

describe('checkManifest', () => {
	const good: Manifest = {
		format: 'sg-onset-backup',
		formatVersion: 1,
		schemaVersion: 1,
		exportedAt: '2026-11-11T10:00:00.000Z',
		tables: { take: 2 },
		blobs: 1
	};

	it('accepts a backup of this schema', () => {
		expect(checkManifest(good, 1)).toEqual({ ok: true, manifest: good });
	});

	it.each([
		[null, 'notBackup'],
		[{ ...good, format: 'other' }, 'notBackup'],
		[{ ...good, tables: undefined }, 'notBackup'],
		[{ ...good, formatVersion: 2 }, 'newerFormat'],
		[{ ...good, schemaVersion: 2 }, 'newerSchema'],
		[{ ...good, schemaVersion: 0 }, 'olderSchema']
	])('refuses %j as %s', (value, reason) => {
		expect(checkManifest(value, 1)).toEqual({ ok: false, reason });
	});
});

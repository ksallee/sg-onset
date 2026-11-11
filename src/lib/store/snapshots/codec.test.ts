import { describe, expect, it } from 'vitest';
import { compress, decodeSnapshot, encodeRows, SnapshotCorrupt, snapshotZip } from './codec';
import { readZip } from '../zipRead';

const rows = { take: [{ id: 't1', tStop: 2.8, notes: 'é' }, { id: 't2' }], outbox: [], meta: [{ key: 'seq', value: 4 }] };

async function encoded(gzip: boolean) {
	const zip = encodeRows(rows, { schemaVersion: 2, at: 0 });
	const e = gzip ? await compress(zip) : { ...zip, crc: (await import('../crc32')).crc32(zip.bytes) };
	const meta = { crc: e.crc, encoding: e.encoding, counts: e.counts, schemaVersion: 2 };
	return { e, meta, data: new Blob([e.bytes as BlobPart]) };
}

describe('the snapshot codec', () => {
	it('counts the rows of each table', () => {
		expect(encodeRows(rows, { schemaVersion: 2, at: 0 }).counts).toEqual({ take: 2, outbox: 0, meta: 1 });
	});

	it('gives back every row, gzipped or not', async () => {
		for (const gzip of [true, false]) {
			const { meta, data, e } = await encoded(gzip);
			expect(e.encoding).toBe(gzip ? 'zip+gzip' : 'zip');
			expect(await decodeSnapshot(meta, data)).toEqual(rows);
		}
	});

	it('gzip makes repeated rows smaller', async () => {
		const many = { take: Array.from({ length: 500 }, (_, i) => ({ id: `t${i}`, slateId: 's1', tStop: 2.8, lens: '35 mm' })) };
		const zip = encodeRows(many, { schemaVersion: 2, at: 0 });
		const gz = await compress(zip);
		expect(gz.bytes.length).toBeLessThan(zip.bytes.length / 4);
		expect(gz.rawSize).toBe(zip.bytes.length);
	});

	it('is a backup zip in the archive layout, with a manifest and no files', async () => {
		const { meta, data } = await encoded(true);
		const names = (await readZip(await snapshotZip(meta, data))).map((e) => e.name);
		expect(names).toEqual(['tables/take.ndjson', 'tables/outbox.ndjson', 'tables/meta.ndjson', 'manifest.json']);
	});

	it('refuses bytes that fail their checksum', async () => {
		const { meta, e } = await encoded(true);
		const bent = e.bytes.slice();
		bent[bent.length >> 1] ^= 0xff;
		await expect(decodeSnapshot(meta, new Blob([bent]))).rejects.toBeInstanceOf(SnapshotCorrupt);
	});

	it('refuses a snapshot whose rows do not match its counts', async () => {
		const { meta, data } = await encoded(false);
		await expect(decodeSnapshot({ ...meta, counts: { ...meta.counts, take: 3 } }, data)).rejects.toBeInstanceOf(SnapshotCorrupt);
	});

	it('refuses bytes that are not a snapshot, even with a matching checksum', async () => {
		const junk = new TextEncoder().encode('not a zip');
		const { crc32 } = await import('../crc32');
		await expect(decodeSnapshot({ crc: crc32(junk), encoding: 'zip', counts: {}, schemaVersion: 2 }, new Blob([junk]))).rejects.toBeInstanceOf(SnapshotCorrupt);
	});
});

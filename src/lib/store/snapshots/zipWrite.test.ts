import { describe, expect, it } from 'vitest';
import { crc32 } from '../crc32';
import { entryBlob, entryCrc, readZip } from '../zipRead';
import { writeZip } from './zipWrite';

const text = (s: string) => new TextEncoder().encode(s);

describe('writeZip', () => {
	it('writes a stored zip the reader takes back, names, bytes and checksums', async () => {
		const files = [
			{ name: 'tables/take.ndjson', data: text('{"id":"t1"}\n') },
			{ name: 'tables/empty.ndjson', data: text('') },
			{ name: 'manifest.json', data: text('{"é":"ü"}') }
		];
		const zip = new Blob([writeZip(files, new Date(Date.UTC(2026, 10, 11, 9, 30))) as BlobPart]);
		const entries = await readZip(zip);
		expect(entries.map((e) => e.name)).toEqual(files.map((f) => f.name));
		for (const [i, entry] of entries.entries()) {
			expect(entry.method).toBe(0);
			expect(entry.crc).toBe(crc32(files[i].data));
			expect(await entryCrc(zip, entry)).toBe(entry.crc);
			expect(new Uint8Array(await (await entryBlob(zip, entry)).arrayBuffer())).toEqual(files[i].data);
		}
	});

	it('writes an empty zip', async () => {
		expect(await readZip(new Blob([writeZip([], new Date(0)) as BlobPart]))).toEqual([]);
	});
});

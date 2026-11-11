import { makeZip } from 'client-zip';
import { describe, expect, it } from 'vitest';
import { crc32 } from './crc32';
import { entryBlob, entryCrc, readZip, ZipError } from './zipRead';

type Source = { name: string; data: Uint8Array; deflate?: boolean };
const bytes = (text: string) => new TextEncoder().encode(text);

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
	const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** A zip written by hand, so the reader is checked against the format and not against one writer. */
async function buildZip(files: Source[], zip64 = false): Promise<Blob> {
	const out: Uint8Array[] = [];
	const central: Uint8Array[] = [];
	let offset = 0;
	const push = (list: Uint8Array[], chunk: Uint8Array) => {
		list.push(chunk);
		return chunk.length;
	};
	const header = (size: number, fill: (v: DataView) => void) => {
		const buffer = new Uint8Array(size);
		fill(new DataView(buffer.buffer));
		return buffer;
	};
	for (const f of files) {
		const name = bytes(f.name);
		const body = f.deflate ? await deflateRaw(f.data) : f.data;
		const crc = crc32(f.data);
		const method = f.deflate ? 8 : 0;
		const localExtra = zip64
			? header(20, (v) => {
					v.setUint16(0, 1, true);
					v.setUint16(2, 16, true);
					v.setBigUint64(4, BigInt(f.data.length), true);
					v.setBigUint64(12, BigInt(body.length), true);
				})
			: new Uint8Array();
		const at = offset;
		offset += push(
			out,
			header(30, (v) => {
				v.setUint32(0, 0x04034b50, true);
				v.setUint16(4, zip64 ? 45 : 20, true);
				v.setUint16(6, 0x0800, true);
				v.setUint16(8, method, true);
				v.setUint32(14, crc, true);
				v.setUint32(18, zip64 ? 0xffffffff : body.length, true);
				v.setUint32(22, zip64 ? 0xffffffff : f.data.length, true);
				v.setUint16(26, name.length, true);
				v.setUint16(28, localExtra.length, true);
			})
		);
		offset += push(out, name) + push(out, localExtra) + push(out, body);
		const centralExtra = zip64
			? header(28, (v) => {
					v.setUint16(0, 1, true);
					v.setUint16(2, 24, true);
					v.setBigUint64(4, BigInt(f.data.length), true);
					v.setBigUint64(12, BigInt(body.length), true);
					v.setBigUint64(20, BigInt(at), true);
				})
			: new Uint8Array();
		push(
			central,
			header(46, (v) => {
				v.setUint32(0, 0x02014b50, true);
				v.setUint16(4, 45, true);
				v.setUint16(6, zip64 ? 45 : 20, true);
				v.setUint16(8, 0x0800, true);
				v.setUint16(10, method, true);
				v.setUint32(16, crc, true);
				v.setUint32(20, zip64 ? 0xffffffff : body.length, true);
				v.setUint32(24, zip64 ? 0xffffffff : f.data.length, true);
				v.setUint16(28, name.length, true);
				v.setUint16(30, centralExtra.length, true);
				v.setUint32(42, zip64 ? 0xffffffff : at, true);
			})
		);
		push(central, name);
		push(central, centralExtra);
	}
	const cdOffset = offset;
	const cdSize = central.reduce((n, c) => n + c.length, 0);
	out.push(...central);
	if (zip64) {
		out.push(
			header(56, (v) => {
				v.setUint32(0, 0x06064b50, true);
				v.setBigUint64(4, 44n, true);
				v.setUint16(12, 45, true);
				v.setUint16(14, 45, true);
				v.setBigUint64(24, BigInt(files.length), true);
				v.setBigUint64(32, BigInt(files.length), true);
				v.setBigUint64(40, BigInt(cdSize), true);
				v.setBigUint64(48, BigInt(cdOffset), true);
			}),
			header(20, (v) => {
				v.setUint32(0, 0x07064b50, true);
				v.setBigUint64(8, BigInt(cdOffset + cdSize), true);
				v.setUint32(16, 1, true);
			})
		);
	}
	out.push(
		header(22, (v) => {
			v.setUint32(0, 0x06054b50, true);
			v.setUint16(8, zip64 ? 0xffff : files.length, true);
			v.setUint16(10, zip64 ? 0xffff : files.length, true);
			v.setUint32(12, zip64 ? 0xffffffff : cdSize, true);
			v.setUint32(16, zip64 ? 0xffffffff : cdOffset, true);
		})
	);
	return new Blob(out as BlobPart[]);
}

const files: Source[] = [
	{ name: 'manifest.json', data: bytes('{"a":1}') },
	{ name: 'tables/take.ndjson', data: bytes('{"id":"t1"}\n'.repeat(200)), deflate: true },
	{ name: 'blobs/é ü', data: Uint8Array.from({ length: 3000 }, (_, i) => i % 251) }
];

describe.each([
	['a plain zip', false],
	['a zip64 archive', true]
])('readZip on %s', (_label, zip64) => {
	it('lists the entries with their sizes', async () => {
		const entries = await readZip(await buildZip(files, zip64));
		expect(entries.map((e) => [e.name, e.size])).toEqual(files.map((f) => [f.name, f.data.length]));
	});

	it('gives back the bytes of a stored and of a deflated entry', async () => {
		const zip = await buildZip(files, zip64);
		const entries = await readZip(zip);
		for (const [i, f] of files.entries()) {
			const blob = await entryBlob(zip, entries[i], 'image/jpeg');
			expect(new Uint8Array(await blob.arrayBuffer())).toEqual(f.data);
			expect(blob.type).toBe('image/jpeg');
			expect(await entryCrc(zip, entries[i])).toBe(entries[i].crc);
		}
	});
});

describe('readZip', () => {
	it('reads what client-zip writes: data descriptors, names, bytes', async () => {
		const stream = makeZip([
			{ name: 'tables/take.ndjson', input: '{"id":"t1"}\n', lastModified: new Date(0) },
			{ name: 'blobs/ph1', input: new Blob([files[2].data as BlobPart]), lastModified: new Date(0) }
		]);
		const zip = await new Response(stream).blob();
		const entries = await readZip(zip);
		expect(entries.map((e) => e.name)).toEqual(['tables/take.ndjson', 'blobs/ph1']);
		expect(await (await entryBlob(zip, entries[0])).text()).toBe('{"id":"t1"}\n');
		expect(new Uint8Array(await (await entryBlob(zip, entries[1])).arrayBuffer())).toEqual(files[2].data);
		expect(await entryCrc(zip, entries[1])).toBe(crc32(files[2].data));
	});

	it('reads an empty archive', async () => {
		expect(await readZip(await buildZip([]))).toEqual([]);
	});

	it('finds the directory behind an archive comment', async () => {
		const zip = await buildZip(files);
		const data = new Uint8Array(await zip.arrayBuffer());
		const withComment = new Uint8Array(data.length + 5);
		withComment.set(data);
		new DataView(withComment.buffer).setUint16(data.length - 2, 5, true);
		withComment.set(bytes('hello'), data.length);
		expect(await readZip(new Blob([withComment]))).toHaveLength(3);
	});

	it('shows a flipped byte as a wrong checksum', async () => {
		const zip = await buildZip(files);
		const data = new Uint8Array(await zip.arrayBuffer());
		data[data.length - 2000] ^= 0xff;
		const broken = new Blob([data]);
		const entries = await readZip(broken);
		expect(await entryCrc(broken, entries[2])).not.toBe(entries[2].crc);
	});

	it.each([
		['not a zip', async () => new Blob(['hello, this is not a zip file at all'])],
		['an empty file', async () => new Blob([])],
		['a zip cut short', async () => (await buildZip(files)).slice(0, 2000)]
	])('refuses %s', async (_label, make) => {
		await expect(readZip(await make())).rejects.toBeInstanceOf(ZipError);
	});

	it('refuses an entry packed in a way it does not know', async () => {
		const zip = await buildZip(files);
		const entries = await readZip(zip);
		await expect(entryBlob(zip, { ...entries[0], method: 12 })).rejects.toBeInstanceOf(ZipError);
	});
});

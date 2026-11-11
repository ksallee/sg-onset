// A zip reader over a Blob. It reads the directory at the end of the file and then slices: a
// stored entry is a `Blob.slice`, so restoring a multi-gigabyte backup never holds it in memory.
// Handles zip64 (a backup with a week of photos passes 4 GB), stored and deflated entries, and
// data descriptors. No encryption, no multi-disk.

import { crc32 } from './crc32';

export class ZipError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ZipError';
	}
}

export type ZipEntry = {
	name: string;
	/** Bytes once unpacked. */
	size: number;
	/** Bytes in the archive. */
	compressedSize: number;
	crc: number;
	/** 0 stored, 8 deflated. */
	method: number;
	/** Where the entry's local header starts. */
	offset: number;
};

const EOCD = 0x06054b50;
const EOCD64 = 0x06064b50;
const LOCATOR64 = 0x07064b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
const MAX32 = 0xffffffff;

async function view(file: Blob, start: number, length: number): Promise<DataView> {
	if (start < 0 || start + length > file.size) throw new ZipError('the archive is cut short');
	return new DataView(await file.slice(start, start + length).arrayBuffer());
}

function u64(v: DataView, at: number): number {
	const n = v.getBigUint64(at, true);
	if (n > BigInt(Number.MAX_SAFE_INTEGER)) throw new ZipError('the archive is too large');
	return Number(n);
}

/** The entries of the archive, in directory order. */
export async function readZip(file: Blob): Promise<ZipEntry[]> {
	// The end record is the last thing in the file, before a comment of at most 65535 bytes.
	const tailStart = Math.max(0, file.size - (22 + 0xffff));
	const tail = await view(file, tailStart, file.size - tailStart);
	let at = tail.byteLength - 22;
	while (at >= 0 && !(tail.getUint32(at, true) === EOCD && at + 22 + tail.getUint16(at + 20, true) === tail.byteLength)) at--;
	if (at < 0) throw new ZipError('not a zip archive');

	let count = tail.getUint16(at + 10, true);
	let size = tail.getUint32(at + 12, true);
	let offset = tail.getUint32(at + 16, true);
	if (count === 0xffff || size === MAX32 || offset === MAX32) {
		const locatorAt = tailStart + at - 20;
		const locator = await view(file, locatorAt, 20);
		if (locator.getUint32(0, true) !== LOCATOR64) throw new ZipError('zip64 locator missing');
		const end = await view(file, u64(locator, 8), 56);
		if (end.getUint32(0, true) !== EOCD64) throw new ZipError('zip64 end record missing');
		count = u64(end, 32);
		size = u64(end, 40);
		offset = u64(end, 48);
	}

	const dir = await view(file, offset, size);
	const text = new TextDecoder();
	const entries: ZipEntry[] = [];
	let p = 0;
	for (let i = 0; i < count; i++) {
		if (p + 46 > dir.byteLength || dir.getUint32(p, true) !== CENTRAL) throw new ZipError('bad directory');
		const flags = dir.getUint16(p + 8, true);
		if (flags & 1) throw new ZipError('encrypted archives are not supported');
		const nameLength = dir.getUint16(p + 28, true);
		const extraLength = dir.getUint16(p + 30, true);
		const commentLength = dir.getUint16(p + 32, true);
		const entry: ZipEntry = {
			name: text.decode(new Uint8Array(dir.buffer, dir.byteOffset + p + 46, nameLength)),
			method: dir.getUint16(p + 10, true),
			crc: dir.getUint32(p + 16, true),
			compressedSize: dir.getUint32(p + 20, true),
			size: dir.getUint32(p + 24, true),
			offset: dir.getUint32(p + 42, true)
		};
		// The zip64 extra field holds, in this order, only the values that overflowed.
		let e = p + 46 + nameLength;
		const extraEnd = e + extraLength;
		while (e + 4 <= extraEnd) {
			const id = dir.getUint16(e, true);
			const length = dir.getUint16(e + 2, true);
			if (id === 1) {
				let q = e + 4;
				if (entry.size === MAX32) (entry.size = u64(dir, q)), (q += 8);
				if (entry.compressedSize === MAX32) (entry.compressedSize = u64(dir, q)), (q += 8);
				if (entry.offset === MAX32) entry.offset = u64(dir, q);
			}
			e += 4 + length;
		}
		entries.push(entry);
		p = extraEnd + commentLength;
	}
	return entries;
}

/** The entry's packed bytes, as a slice of the file. */
async function packed(file: Blob, entry: ZipEntry): Promise<Blob> {
	const local = await view(file, entry.offset, 30);
	if (local.getUint32(0, true) !== LOCAL) throw new ZipError(`bad entry ${entry.name}`);
	const start = entry.offset + 30 + local.getUint16(26, true) + local.getUint16(28, true);
	if (start + entry.compressedSize > file.size) throw new ZipError('the archive is cut short');
	return file.slice(start, start + entry.compressedSize);
}

function unpack(data: Blob, entry: ZipEntry): ReadableStream<Uint8Array> {
	if (entry.method === 0) return data.stream() as ReadableStream<Uint8Array>;
	if (entry.method === 8) {
		return data.stream().pipeThrough(new DecompressionStream('deflate-raw') as ReadableWritablePair<Uint8Array, Uint8Array>);
	}
	throw new ZipError(`${entry.name} is packed in a way this reader does not know (method ${entry.method})`);
}

/** The entry's bytes. A stored entry is a slice of `file`: nothing is copied until it is read. */
export async function entryBlob(file: Blob, entry: ZipEntry, type = ''): Promise<Blob> {
	const data = await packed(file, entry);
	if (entry.method === 0) return data.slice(0, data.size, type);
	const whole = await new Response(unpack(data, entry)).blob();
	return whole.slice(0, whole.size, type);
}

/** The checksum of the entry's bytes as they are in the file, read in chunks. Compare with `entry.crc`. */
export async function entryCrc(file: Blob, entry: ZipEntry): Promise<number> {
	const reader = unpack(await packed(file, entry), entry).getReader();
	let crc = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) return crc;
		crc = crc32(value, crc);
	}
}

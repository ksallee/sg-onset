// A zip reader over a Blob. It reads the directory at the end of the file and then slices: a
// stored entry is a `Blob.slice`, so restoring a multi-gigabyte backup never holds it in memory.
// Handles zip64 (a backup with a week of photos passes 4 GB), stored and deflated entries, and
// data descriptors. No encryption, no multi-disk.
//
// A damaged archive is refused. The entries must fill the file from its start to the directory,
// with nothing between them. An entry's local header and data descriptor repeat what the
// directory says of it; any difference is damage. With the checksum of each entry's bytes
// (`entryCrc`), every byte of the archive is checked but the directory's attributes and the
// version that made it, which nothing reads.

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
	/** Where the next entry starts, or the directory. The entry's header, bytes and descriptor fill the space up to it. */
	end: number;
	/** Version needed to extract, flags, and DOS time and date, as the directory has them. */
	version: number;
	flags: number;
	modified: number;
};

const EOCD = 0x06054b50;
const EOCD64 = 0x06064b50;
const LOCATOR64 = 0x07064b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
const DESCRIPTOR = 0x08074b50;
const MAX16 = 0xffff;
const MAX32 = 0xffffffff;
/** Flag bit 3: the checksum and sizes follow the bytes, in a data descriptor. */
const DEFERRED = 8;

async function view(file: Blob, start: number, length: number): Promise<DataView> {
	if (start < 0 || start + length > file.size) throw new ZipError('the archive is cut short');
	return new DataView(await file.slice(start, start + length).arrayBuffer());
}

function u64(v: DataView, at: number): number {
	const n = v.getBigUint64(at, true);
	if (n > BigInt(Number.MAX_SAFE_INTEGER)) throw new ZipError('the archive is too large');
	return Number(n);
}

/**
 * Reads the zip64 extra field of a header from `at` to `end`. The field holds, in this order,
 * only the values that overflowed: `wanted` says which. Undefined when there is no such field.
 */
function zip64Extra(v: DataView, at: number, end: number, wanted: readonly boolean[]): (number | undefined)[] | undefined {
	while (at + 4 <= end) {
		const id = v.getUint16(at, true);
		const length = v.getUint16(at + 2, true);
		const next = at + 4 + length;
		if (next > end) throw new ZipError('bad extra field');
		if (id === 1) {
			let q = at + 4;
			return wanted.map((want) => {
				if (!want) return undefined;
				if (q + 8 > next) throw new ZipError('bad zip64 field');
				q += 8;
				return u64(v, q - 8);
			});
		}
		at = next;
	}
	return undefined;
}

/** The entries of the archive, in directory order. */
export async function readZip(file: Blob): Promise<ZipEntry[]> {
	// The end record is the last thing in the file, before a comment of at most 65535 bytes.
	const tailStart = Math.max(0, file.size - (22 + 0xffff));
	const tail = await view(file, tailStart, file.size - tailStart);
	let at = tail.byteLength - 22;
	while (at >= 0 && !(tail.getUint32(at, true) === EOCD && at + 22 + tail.getUint16(at + 20, true) === tail.byteLength)) at--;
	if (at < 0) throw new ZipError('not a zip archive');
	const endAt = tailStart + at;

	const disk = tail.getUint16(at + 4, true);
	const directoryDisk = tail.getUint16(at + 6, true);
	const onDisk = tail.getUint16(at + 8, true);
	let count = tail.getUint16(at + 10, true);
	let size = tail.getUint32(at + 12, true);
	let offset = tail.getUint32(at + 16, true);
	if (onDisk !== count) throw new ZipError('bad end record');
	/** Where the directory must end: the end record, or the zip64 one before it. */
	let directoryEnd = endAt;
	const locatorAt = endAt - 20;
	const hasLocator = locatorAt >= 0 && (await view(file, locatorAt, 4)).getUint32(0, true) === LOCATOR64;
	if (hasLocator || count === MAX16 || size === MAX32 || offset === MAX32) {
		const locator = await view(file, locatorAt, 20);
		if (locator.getUint32(0, true) !== LOCATOR64) throw new ZipError('zip64 locator missing');
		if (locator.getUint32(4, true) !== 0 || locator.getUint32(16, true) > 1) throw new ZipError('multi-disk archives are not supported');
		const end64At = u64(locator, 8);
		const end = await view(file, end64At, 56);
		if (end.getUint32(0, true) !== EOCD64) throw new ZipError('zip64 end record missing');
		if (end64At + 12 + u64(end, 4) !== locatorAt) throw new ZipError('bad zip64 end record');
		if (end.getUint32(16, true) !== 0 || end.getUint32(20, true) !== 0) throw new ZipError('multi-disk archives are not supported');
		const total = u64(end, 32);
		const size64 = u64(end, 40);
		const offset64 = u64(end, 48);
		// The end record holds each value again, or the mark that it overflowed.
		const agrees = (value: number, real: number, max: number) => value === max || value === real;
		const agreed =
			u64(end, 24) === total &&
			agrees(count, total, MAX16) &&
			agrees(size, size64, MAX32) &&
			agrees(offset, offset64, MAX32) &&
			agrees(disk, 0, MAX16) &&
			agrees(directoryDisk, 0, MAX16);
		if (!agreed) throw new ZipError('bad zip64 end record');
		count = total;
		size = size64;
		offset = offset64;
		directoryEnd = end64At;
	} else if (disk !== 0 || directoryDisk !== 0) {
		throw new ZipError('multi-disk archives are not supported');
	}
	if (offset + size !== directoryEnd) throw new ZipError('bad directory');

	const dir = await view(file, offset, size);
	const text = new TextDecoder();
	const entries: ZipEntry[] = [];
	let p = 0;
	for (let i = 0; i < count; i++) {
		if (p + 46 > dir.byteLength || dir.getUint32(p, true) !== CENTRAL) throw new ZipError('bad directory');
		const flags = dir.getUint16(p + 8, true);
		if (flags & 1) throw new ZipError('encrypted archives are not supported');
		if (dir.getUint16(p + 34, true) !== 0) throw new ZipError('multi-disk archives are not supported');
		const nameLength = dir.getUint16(p + 28, true);
		const extraLength = dir.getUint16(p + 30, true);
		const commentLength = dir.getUint16(p + 32, true);
		const extraEnd = p + 46 + nameLength + extraLength;
		if (extraEnd + commentLength > dir.byteLength) throw new ZipError('bad directory');
		const entry: ZipEntry = {
			name: text.decode(new Uint8Array(dir.buffer, dir.byteOffset + p + 46, nameLength)),
			method: dir.getUint16(p + 10, true),
			crc: dir.getUint32(p + 16, true),
			compressedSize: dir.getUint32(p + 20, true),
			size: dir.getUint32(p + 24, true),
			offset: dir.getUint32(p + 42, true),
			end: 0,
			version: dir.getUint16(p + 6, true),
			flags,
			modified: dir.getUint32(p + 12, true)
		};
		const big = zip64Extra(dir, p + 46 + nameLength, extraEnd, [entry.size === MAX32, entry.compressedSize === MAX32, entry.offset === MAX32]);
		if (big) {
			entry.size = big[0] ?? entry.size;
			entry.compressedSize = big[1] ?? entry.compressedSize;
			entry.offset = big[2] ?? entry.offset;
		}
		entries.push(entry);
		p = extraEnd + commentLength;
	}
	if (p !== dir.byteLength) throw new ZipError('bad directory');

	// The entries fill the file from its start to the directory, one after the other.
	const order = [...entries].sort((a, b) => a.offset - b.offset);
	if ((order[0]?.offset ?? offset) !== 0) throw new ZipError('bad directory');
	order.forEach((entry, i) => {
		entry.end = order[i + 1]?.offset ?? offset;
		if (entry.end <= entry.offset) throw new ZipError('bad directory');
	});
	return entries;
}

/**
 * The entry's packed bytes, as a slice of the file. Its local header and data descriptor are
 * checked against the directory first: a difference is damage.
 */
async function packed(file: Blob, entry: ZipEntry): Promise<Blob> {
	const damaged = (what: string) => new ZipError(`${entry.name}: the ${what} does not match the directory`);
	const local = await view(file, entry.offset, 30);
	if (local.getUint32(0, true) !== LOCAL) throw new ZipError(`bad entry ${entry.name}`);
	const nameLength = local.getUint16(26, true);
	const extraLength = local.getUint16(28, true);
	const start = entry.offset + 30 + nameLength + extraLength;
	const end = start + entry.compressedSize;
	if (end > entry.end) throw new ZipError(`${entry.name} runs into the next entry`);
	const rest = await view(file, entry.offset + 30, nameLength + extraLength);
	const name = new TextDecoder().decode(new Uint8Array(rest.buffer, rest.byteOffset, nameLength));
	const same =
		name === entry.name &&
		local.getUint16(4, true) === entry.version &&
		local.getUint16(6, true) === entry.flags &&
		local.getUint16(8, true) === entry.method &&
		local.getUint32(10, true) === entry.modified;
	if (!same) throw damaged('header');

	// The checksum and sizes, here or zero when a descriptor carries them.
	const deferred = (entry.flags & DEFERRED) !== 0;
	let size = local.getUint32(22, true);
	let compressedSize = local.getUint32(18, true);
	const big = zip64Extra(rest, nameLength, rest.byteLength, [size === MAX32, compressedSize === MAX32]);
	if (big) {
		size = big[0] ?? size;
		compressedSize = big[1] ?? compressedSize;
	}
	const agrees = (value: number, real: number) => value === real || (deferred && value === 0);
	if (!agrees(local.getUint32(14, true), entry.crc) || !agrees(compressedSize, entry.compressedSize) || !agrees(size, entry.size)) throw damaged('header');

	// After the bytes: nothing, or the descriptor. 12 to 24 bytes: its mark or not, sizes of 4 or 8 bytes.
	const after = entry.end - end;
	if (after !== 0 || deferred) {
		if (!deferred || ![12, 16, 20, 24].includes(after)) throw new ZipError(`${entry.name} is followed by stray bytes`);
		const d = await view(file, end, after);
		const q = after % 8 === 0 ? 4 : 0;
		if (q && d.getUint32(0, true) !== DESCRIPTOR) throw damaged('descriptor');
		const wide = after - q === 20;
		const descriptor = {
			crc: d.getUint32(q, true),
			compressedSize: wide ? u64(d, q + 4) : d.getUint32(q + 4, true),
			size: wide ? u64(d, q + 12) : d.getUint32(q + 8, true)
		};
		if (descriptor.crc !== entry.crc || descriptor.compressedSize !== entry.compressedSize || descriptor.size !== entry.size) throw damaged('descriptor');
	}
	return file.slice(start, end);
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

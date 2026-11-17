// The capture time of a picked file, read from the file: only the bytes that hold it, never a
// whole video. The rules are `captureTime.ts`; this reads slices of the file. Undefined when the
// file says nothing, or cannot be read: the caller then uses the moment it was picked.

import { boxAt, heifExifRange, heifExifTime, jpegTime, movieTime, sniff, tiffTime, type TimeOptions } from './captureTime';

/** The head of the file: a JPEG's Exif, a TIFF's IFDs and a HEIF's `meta` are in it. */
const HEAD = 256 * 1024;
/** A movie index larger than this is not read for a time. A two-hour clip's is a few MB. */
const MOOV_MAX = 64 * 1024 * 1024;
/** Top-level boxes walked before giving up. A movie has a handful. */
const MAX_BOXES = 64;

const read = async (file: Blob, start: number, end: number) => new Uint8Array(await file.slice(start, end).arrayBuffer());

/** Walks the top-level boxes by their headers to `moov`, wherever it is, and reads only it. */
async function movieAt(file: Blob, head: Uint8Array, options: TimeOptions): Promise<number | undefined> {
	let at = 0;
	for (let i = 0; i < MAX_BOXES && at + 8 <= file.size; i++) {
		const header = at + 16 <= head.length ? head.subarray(at, at + 16) : await read(file, at, at + 16);
		const box = boxAt(header, 0, file.size - at);
		if (!box) return undefined;
		if (box.type === 'moov') return box.size > MOOV_MAX ? undefined : movieTime(await read(file, at + box.header, at + box.size), options);
		at += box.size;
	}
	return undefined;
}

export async function readCaptureTime(file: Blob, options: TimeOptions = {}): Promise<number | undefined> {
	try {
		const head = await read(file, 0, HEAD);
		switch (sniff(head)) {
			case 'jpeg':
				return jpegTime(head, options);
			case 'tiff':
				return tiffTime(head, options);
			case 'heif': {
				const range = heifExifRange(head);
				return range ? heifExifTime(await read(file, range.offset, range.offset + range.length), options) : undefined;
			}
			case 'movie':
				return await movieAt(file, head, options);
			default:
				return undefined;
		}
	} catch {
		return undefined;
	}
}

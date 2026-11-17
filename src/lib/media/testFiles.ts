// Files for the tests, built byte by byte as the formats lay them out: EXIF 2.32 (CIPA DC-008),
// ISO/IEC 14496-12 (boxes), ISO/IEC 23008-12 (HEIF items), the QuickTime File Format (mvhd, keys,
// ilst). Tiny: a header and the metadata, no picture.

export const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));
export const u16 = (n: number, le = false) => (le ? [n & 255, n >> 8] : [n >> 8, n & 255]);
export const u32 = (n: number, le = false) => {
	const b = [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
	return le ? b.reverse() : b;
};
export const u64 = (n: number) => [...u32(Math.floor(n / 2 ** 32)), ...u32(n % 2 ** 32)];
export const bytes = (...parts: (number[] | Uint8Array)[]) => new Uint8Array(parts.flatMap((p) => [...p]));

export type Tag = { tag: number; text: string };

/** A TIFF holding IFD0, which points at an Exif IFD with these ASCII tags. */
export function tiff(tags: Tag[], le = true): Uint8Array {
	const ifd0At = 8;
	const exifAt = ifd0At + 2 + 12 + 4;
	let dataAt = exifAt + 2 + tags.length * 12 + 4;
	const data: number[] = [];
	const entries: number[] = [];
	for (const { tag, text } of tags) {
		const value = [...ascii(text), 0];
		entries.push(...u16(tag, le), ...u16(2, le), ...u32(value.length, le));
		if (value.length <= 4) entries.push(...value, ...new Array(4 - value.length).fill(0));
		else {
			entries.push(...u32(dataAt, le));
			data.push(...value);
			dataAt += value.length;
		}
	}
	return bytes(le ? ascii('II') : ascii('MM'), u16(42, le), u32(ifd0At, le), u16(1, le), u16(0x8769, le), u16(4, le), u32(1, le), u32(exifAt, le), u32(0, le), u16(tags.length, le), entries, u32(0, le), data);
}

/** DateTimeOriginal 2026-11-13 14:05:22.250 at -06:00: 20:05:22.250 UTC. */
export const ORIGINAL: Tag[] = [
	{ tag: 0x9003, text: '2026:11:13 14:05:22' },
	{ tag: 0x9011, text: '-06:00' },
	{ tag: 0x9291, text: '250' }
];
export const ORIGINAL_AT = Date.parse('2026-11-13T20:05:22.250Z');

/** A JPEG: JFIF, then the Exif segment if given, then an empty scan. */
export function jpeg(exif: Uint8Array | undefined): Uint8Array {
	const app0 = bytes([0xff, 0xe0], u16(16), ascii('JFIF'), [0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
	const app1 = exif ? bytes([0xff, 0xe1], u16(2 + 6 + exif.length), ascii('Exif'), [0, 0], exif) : bytes();
	return bytes([0xff, 0xd8], app0, app1, [0xff, 0xda], u16(4), [0, 0], [0xff, 0xd9]);
}

export const box = (type: string, ...parts: (number[] | Uint8Array)[]) => {
	const body = bytes(...parts);
	return bytes(u32(8 + body.length), ascii(type), body);
};
export const fullBox = (type: string, version: number, ...parts: (number[] | Uint8Array)[]) => box(type, [version, 0, 0, 0], ...parts);

/** A HEIF head whose `meta` lists an Exif item stored at `offset` in the file. `iloc` version 0 or 1. */
export function heifHead(offset: number, length: number, version = 0): Uint8Array {
	const infe = fullBox('infe', 2, u16(7), u16(0), ascii('Exif'), [0]);
	const other = fullBox('infe', 2, u16(1), u16(0), ascii('hvc1'), [0]);
	const iinf = fullBox('iinf', 0, u16(2), other, infe);
	const item = (id: number, off: number, len: number) =>
		version === 0 ? [...u16(id), ...u16(0), ...u32(0), ...u16(1), ...u32(off), ...u32(len)] : [...u16(id), ...u16(0), ...u16(0), ...u32(0), ...u16(1), ...u32(off), ...u32(len)];
	// offset_size 4, length_size 4, base_offset_size 4; version 1: index_size 0.
	const iloc = fullBox('iloc', version, [0x44, 0x40], u16(2), item(1, 9000, 400), item(7, offset, length));
	const meta = fullBox('meta', 0, fullBox('hdlr', 0, u32(0), ascii('pict'), u32(0), u32(0), u32(0), [0]), iinf, iloc);
	return bytes(box('ftyp', ascii('heic'), u32(0), ascii('mif1heic')), meta);
}

/** The Exif item of a HEIF: the offset of the TIFF header, "Exif\0\0", the TIFF. */
export const heifExifItem = (exif: Uint8Array) => bytes(u32(6), ascii('Exif'), [0, 0], exif);

/** A whole HEIF: the head, padding, then the Exif item `gap` bytes in. */
export function heif(exif: Uint8Array, gap: number): Uint8Array {
	const item = heifExifItem(exif);
	const head = heifHead(gap, item.length);
	return bytes(head, new Uint8Array(gap - head.length), item);
}

/** Seconds from 1904 to 1970. */
export const FROM_1904 = 2_082_844_800;

export const mvhd = (seconds: number, version = 0) =>
	version === 0 ? fullBox('mvhd', 0, u32(seconds), u32(seconds), u32(600), u32(6000)) : fullBox('mvhd', 1, u64(seconds), u64(seconds), u32(600), u64(6000));

/** Apple's metadata: `keys` names each entry, `ilst` holds them by 1-based index. */
export function appleMeta(entries: [string, string][], fullMeta = false): Uint8Array {
	const keys = fullBox('keys', 0, u32(entries.length), ...entries.map(([k]) => bytes(u32(8 + k.length), ascii('mdta'), ascii(k))));
	const ilst = box('ilst', ...entries.map(([, v], i) => box(String.fromCharCode(...u32(i + 1)), box('data', u32(1), u32(0), ascii(v)))));
	const hdlr = fullBox('hdlr', 0, u32(0), ascii('mdta'), u32(0), u32(0), u32(0), [0]);
	return fullMeta ? fullBox('meta', 0, hdlr, keys, ilst) : box('meta', hdlr, keys, ilst);
}

/**
 * A QuickTime movie as an iPhone writes it: ftyp, the movie data, then `moov` at the end, with
 * Apple's creation date. `data`: how many bytes of movie data.
 */
export function movie(creationDate: string, data = 1024): Uint8Array {
	const moov = box('moov', mvhd(FROM_1904 + 1_000_000), appleMeta([['com.apple.quicktime.creationdate', creationDate]]));
	return bytes(box('ftyp', ascii('qt  '), u32(0), ascii('qt  ')), box('wide'), box('mdat', new Uint8Array(data)), moov);
}

// When a photo or a video was taken, from the file's own metadata. A file picked from the photo
// library or Files carries it; the moment it was picked is not it. Pure: bytes in, an instant out.
// `readCaptureTime.ts` reads the bytes.
//
// - Photos: EXIF (CIPA DC-008, EXIF 2.32). DateTimeOriginal, else DateTimeDigitized, with their
//   OffsetTime and SubSecTime tags. In a JPEG it is the APP1 "Exif" segment; in a TIFF or DNG the
//   file itself; in a HEIF (HEIC) an item of type `Exif` that the `meta` box points at (ISO/IEC
//   23008-12, `iinf` and `iloc`).
// - Videos: QuickTime and MP4 (ISO/IEC 14496-12). Apple's `com.apple.quicktime.creationdate` in
//   `moov/meta`, which keeps the local offset and survives an export; else `©day` in `moov/udta`;
//   else `creation_time` of `mvhd`, seconds since 1904 in UTC.
//
// A time with no offset is the wall time where it was taken: read as the device's local time.

/** A wall-clock time with no offset. `month` from 1. */
export type LocalTime = { year: number; month: number; day: number; hour: number; minute: number; second: number; ms: number };

export type TimeOptions = {
	/** Epoch ms of a wall time with no offset. Default: the device's time zone. */
	local?: (time: LocalTime) => number;
};

const deviceLocal = (t: LocalTime) => new Date(t.year, t.month - 1, t.day, t.hour, t.minute, t.second, t.ms).getTime();

const text = (bytes: Uint8Array, start: number, length: number) => String.fromCharCode(...bytes.subarray(start, start + length));

/** Big-endian reads, bounds checked: undefined past the end. */
function reader(bytes: Uint8Array, littleEndian = false) {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const fits = (at: number, n: number) => at >= 0 && at + n <= bytes.length;
	return {
		u8: (at: number) => (fits(at, 1) ? view.getUint8(at) : undefined),
		u16: (at: number) => (fits(at, 2) ? view.getUint16(at, littleEndian) : undefined),
		u32: (at: number) => (fits(at, 4) ? view.getUint32(at, littleEndian) : undefined),
		u64: (at: number) => (fits(at, 8) ? view.getUint32(at, littleEndian) * 2 ** 32 + view.getUint32(at + 4, littleEndian) : undefined),
		/** An unsigned integer of `size` bytes (0, 4 or 8), as ISO boxes size their fields. */
		uint(at: number, size: number): number | undefined {
			if (size === 0) return 0;
			if (size === 4) return this.u32(at);
			if (size === 8) return this.u64(at);
			return undefined;
		}
	};
}

const isTime = (t: LocalTime) =>
	t.year >= 1970 && t.month >= 1 && t.month <= 12 && t.day >= 1 && t.day <= 31 && t.hour <= 23 && t.minute <= 59 && t.second <= 60;

/** `+HH:MM`, `-HHMM` or `Z` to minutes east of UTC. */
function offsetMinutes(offset: string | undefined): number | undefined {
	const value = offset?.trim();
	if (!value) return undefined;
	if (value === 'Z') return 0;
	const m = /^([+-])(\d{2}):?(\d{2})$/.exec(value);
	if (!m) return undefined;
	return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
}

function instant(t: LocalTime, offset: string | undefined, options: TimeOptions): number | undefined {
	if (!isTime(t)) return undefined;
	const minutes = offsetMinutes(offset);
	const at = minutes === undefined ? (options.local ?? deviceLocal)(t) : Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.second, t.ms) - minutes * 60_000;
	return Number.isFinite(at) ? at : undefined;
}

/** An EXIF time, `YYYY:MM:DD HH:MM:SS`, with its offset and fraction tags. */
export function exifInstant(value: string, offset: string | undefined, subsec: string | undefined, options: TimeOptions = {}): number | undefined {
	const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(value.trim());
	if (!m) return undefined;
	const fraction = /^\d+/.exec(subsec?.trim() ?? '')?.[0] ?? '';
	const ms = fraction ? Math.round(Number(`0.${fraction}`) * 1000) : 0;
	const [, year, month, day, hour, minute, second] = m.map(Number);
	return instant({ year, month, day, hour, minute, second, ms }, offset, options);
}

/** An ISO 8601 time as QuickTime keeps it: `2026-11-13T14:05:22-0600`. */
function isoInstant(value: string, options: TimeOptions): number | undefined {
	const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?\s*(Z|[+-]\d{2}:?\d{2})?/.exec(value.trim());
	if (!m) return undefined;
	const [year, month, day, hour, minute, second] = [m[1], m[2], m[3], m[4], m[5], m[6] ?? '0'].map(Number);
	const ms = m[7] ? Math.round(Number(`0.${m[7]}`) * 1000) : 0;
	return instant({ year, month, day, hour, minute, second, ms }, m[8], options);
}

// ------------------------------------------------------------------ EXIF

const EXIF_IFD = 0x8769;
const TAGS = {
	original: 0x9003,
	digitized: 0x9004,
	originalOffset: 0x9011,
	digitizedOffset: 0x9012,
	originalSubsec: 0x9291,
	digitizedSubsec: 0x9292
};
const ASCII = 2;
const LONG = 4;

/** The ASCII and LONG values of one IFD, by tag. */
function ifd(bytes: Uint8Array, at: number, le: boolean): Map<number, string | number> {
	const r = reader(bytes, le);
	const out = new Map<number, string | number>();
	const count = r.u16(at);
	if (count === undefined) return out;
	for (let i = 0; i < count; i++) {
		const entry = at + 2 + i * 12;
		const [tag, type, n] = [r.u16(entry), r.u16(entry + 2), r.u32(entry + 4)];
		if (tag === undefined || type === undefined || n === undefined) break;
		if (type === LONG && n === 1) {
			const value = r.u32(entry + 8);
			if (value !== undefined) out.set(tag, value);
		} else if (type === ASCII && n > 0) {
			const start = n <= 4 ? entry + 8 : r.u32(entry + 8);
			if (start === undefined || start + n > bytes.length) continue;
			out.set(tag, text(bytes, start, n).replace(/\0[\s\S]*$/, ''));
		}
	}
	return out;
}

/** The capture time in a TIFF structure: the EXIF block itself, a TIFF or a DNG. */
export function tiffTime(bytes: Uint8Array, options: TimeOptions = {}): number | undefined {
	const order = text(bytes, 0, 2);
	if (order !== 'II' && order !== 'MM') return undefined;
	const le = order === 'II';
	const r = reader(bytes, le);
	if (r.u16(2) !== 42) return undefined;
	const first = r.u32(4);
	if (first === undefined) return undefined;
	const pointer = ifd(bytes, first, le).get(EXIF_IFD);
	if (typeof pointer !== 'number') return undefined;
	const tags = ifd(bytes, pointer, le);
	const str = (tag: number) => {
		const v = tags.get(tag);
		return typeof v === 'string' ? v : undefined;
	};
	for (const [time, offset, subsec] of [
		[TAGS.original, TAGS.originalOffset, TAGS.originalSubsec],
		[TAGS.digitized, TAGS.digitizedOffset, TAGS.digitizedSubsec]
	]) {
		const value = str(time);
		const at = value ? exifInstant(value, str(offset), str(subsec), options) : undefined;
		if (at !== undefined) return at;
	}
	return undefined;
}

/** The capture time in a JPEG: its APP1 "Exif" segment, before the image data. */
export function jpegTime(bytes: Uint8Array, options: TimeOptions = {}): number | undefined {
	const r = reader(bytes);
	if (r.u16(0) !== 0xffd8) return undefined;
	let at = 2;
	for (;;) {
		const marker = r.u16(at);
		const length = r.u16(at + 2);
		// Start of scan: the metadata is behind.
		if (marker === undefined || length === undefined || marker === 0xffda || marker >> 8 !== 0xff) return undefined;
		if (marker === 0xffe1 && text(bytes, at + 4, 6) === 'Exif\0\0') {
			const found = tiffTime(bytes.subarray(at + 10, at + 2 + length), options);
			if (found !== undefined) return found;
		}
		at += 2 + length;
	}
}

// ------------------------------------------------------------------ boxes

export type BoxHeader = { type: string; size: number; header: number };

/**
 * The box header at `at`. `rest`: the bytes from `at` to the end of the file, for a box of size 0,
 * which runs to the end. A size of 1 is a 64-bit size after the type.
 */
export function boxAt(bytes: Uint8Array, at: number, rest: number): BoxHeader | undefined {
	const r = reader(bytes);
	const size32 = r.u32(at);
	if (size32 === undefined || at + 8 > bytes.length) return undefined;
	const type = text(bytes, at + 4, 4);
	if (size32 === 1) {
		const size = r.u64(at + 8);
		return size !== undefined && size >= 16 ? { type, size, header: 16 } : undefined;
	}
	if (size32 === 0) return { type, size: rest, header: 8 };
	return size32 >= 8 ? { type, size: size32, header: 8 } : undefined;
}

/** The boxes inside `bytes[start, end)`: type, where the content starts, where the box ends. */
function children(bytes: Uint8Array, start: number, end: number): { type: string; body: number; end: number }[] {
	const out = [];
	let at = start;
	while (at + 8 <= end) {
		const box = boxAt(bytes, at, end - at);
		if (!box || at + box.size > end) break;
		out.push({ type: box.type, body: at + box.header, end: at + box.size });
		at += box.size;
	}
	return out;
}

const child = (bytes: Uint8Array, start: number, end: number, type: string) => children(bytes, start, end).find((b) => b.type === type);

export type FileKind = 'jpeg' | 'tiff' | 'heif' | 'movie';

const HEIF_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'mif1', 'msf1', 'avif', 'avis']);

/** The kind of file, from its first bytes. */
export function sniff(head: Uint8Array): FileKind | undefined {
	if (head[0] === 0xff && head[1] === 0xd8) return 'jpeg';
	const start = text(head, 0, 4);
	if (start === 'II*\0' || start === 'MM\0*') return 'tiff';
	const first = boxAt(head, 0, head.length);
	if (!first) return undefined;
	if (first.type === 'ftyp') {
		const major = text(head, 8, 4);
		return HEIF_BRANDS.has(major) ? 'heif' : 'movie';
	}
	// An old QuickTime file may open on its movie data or a free box, with no ftyp.
	return ['moov', 'mdat', 'wide', 'free', 'skip'].includes(first.type) ? 'movie' : undefined;
}

// ------------------------------------------------------------------ HEIF

/** Where the Exif item of a HEIF is in the file, from the `meta` box in its head. */
export function heifExifRange(head: Uint8Array): { offset: number; length: number } | undefined {
	const r = reader(head);
	const meta = child(head, 0, head.length, 'meta');
	if (!meta) return undefined;
	// `meta` is a full box: version and flags first.
	const inMeta = children(head, meta.body + 4, meta.end);
	const iinf = inMeta.find((b) => b.type === 'iinf');
	const iloc = inMeta.find((b) => b.type === 'iloc');
	if (!iinf || !iloc) return undefined;

	const iinfVersion = r.u8(iinf.body);
	const entries = children(head, iinf.body + 4 + (iinfVersion === 0 ? 2 : 4), iinf.end);
	let exifId: number | undefined;
	for (const infe of entries) {
		if (infe.type !== 'infe') continue;
		const version = r.u8(infe.body) ?? 0;
		if (version < 2) continue;
		const id = version === 2 ? r.u16(infe.body + 4) : r.u32(infe.body + 4);
		const typeAt = infe.body + 4 + (version === 2 ? 2 : 4) + 2;
		if (id !== undefined && text(head, typeAt, 4) === 'Exif') exifId = id;
	}
	if (exifId === undefined) return undefined;

	const version = r.u8(iloc.body) ?? 0;
	let at = iloc.body + 4;
	const sizes = r.u8(at);
	const sizes2 = r.u8(at + 1);
	if (sizes === undefined || sizes2 === undefined) return undefined;
	const [offsetSize, lengthSize, baseSize] = [sizes >> 4, sizes & 15, sizes2 >> 4];
	const indexSize = version === 1 || version === 2 ? sizes2 & 15 : 0;
	at += 2;
	const count = version < 2 ? r.u16(at) : r.u32(at);
	if (count === undefined) return undefined;
	at += version < 2 ? 2 : 4;
	for (let i = 0; i < count; i++) {
		const id = version < 2 ? r.u16(at) : r.u32(at);
		at += version < 2 ? 2 : 4;
		let method = 0;
		if (version === 1 || version === 2) {
			method = (r.u16(at) ?? 0) & 15;
			at += 2;
		}
		at += 2; // data_reference_index
		const base = r.uint(at, baseSize);
		at += baseSize;
		const extents = r.u16(at);
		at += 2;
		if (id === undefined || base === undefined || extents === undefined) return undefined;
		for (let e = 0; e < extents; e++) {
			at += indexSize;
			const offset = r.uint(at, offsetSize);
			at += offsetSize;
			const length = r.uint(at, lengthSize);
			at += lengthSize;
			// Method 0: an offset in the file. The Exif item is one extent.
			if (id === exifId && e === 0 && method === 0 && offset !== undefined && length !== undefined && length > 0) return { offset: base + offset, length };
		}
	}
	return undefined;
}

/** The capture time in a HEIF's Exif item: the offset of the TIFF header, then the block. */
export function heifExifTime(item: Uint8Array, options: TimeOptions = {}): number | undefined {
	const skip = reader(item).u32(0);
	if (skip === undefined) return undefined;
	return tiffTime(item.subarray(4 + skip), options);
}

// ------------------------------------------------------------------ movies

/** Seconds from 1904-01-01 to 1970-01-01, both UTC. */
const FROM_1904 = 2_082_844_800;
const CREATION_DATE = 'com.apple.quicktime.creationdate';

/** Apple's creation date in `moov/meta`: `keys` names the entries, `ilst` holds them by index. */
function appleDate(moov: Uint8Array, options: TimeOptions): number | undefined {
	const r = reader(moov);
	const meta = child(moov, 0, moov.length, 'meta');
	if (!meta) return undefined;
	// In a QuickTime file `meta` has no version and flags; in an MP4 it is a full box.
	const start = text(moov, meta.body + 4, 4) === 'hdlr' ? meta.body : meta.body + 4;
	const inMeta = children(moov, start, meta.end);
	const keys = inMeta.find((b) => b.type === 'keys');
	const ilst = inMeta.find((b) => b.type === 'ilst');
	if (!keys || !ilst) return undefined;
	const count = r.u32(keys.body + 4) ?? 0;
	let at = keys.body + 8;
	let index: number | undefined;
	for (let i = 1; i <= count; i++) {
		const size = r.u32(at);
		if (size === undefined || size < 8) return undefined;
		if (text(moov, at + 8, size - 8) === CREATION_DATE) index = i;
		at += size;
	}
	if (index === undefined) return undefined;
	for (const item of children(moov, ilst.body, ilst.end)) {
		if (r.u32(item.body - 4) !== index) continue;
		const data = child(moov, item.body, item.end, 'data');
		// `data`: a type (1 is UTF-8) and a locale, then the value.
		if (data && r.u32(data.body) === 1) return isoInstant(text(moov, data.body + 8, data.end - data.body - 8), options);
	}
	return undefined;
}

/** `©day` in `moov/udta`: a length, a language, then the text. */
function udtaDay(moov: Uint8Array, options: TimeOptions): number | undefined {
	const udta = child(moov, 0, moov.length, 'udta');
	const day = udta ? child(moov, udta.body, udta.end, '\xa9day') : undefined;
	if (!day) return undefined;
	const length = reader(moov).u16(day.body) ?? 0;
	return isoInstant(text(moov, day.body + 4, Math.min(length, day.end - day.body - 4)), options);
}

/** `creation_time` of `mvhd`. Zero: never set. */
function headerTime(moov: Uint8Array): number | undefined {
	const r = reader(moov);
	const mvhd = child(moov, 0, moov.length, 'mvhd');
	if (!mvhd) return undefined;
	const version = r.u8(mvhd.body);
	const seconds = version === 1 ? r.u64(mvhd.body + 4) : r.u32(mvhd.body + 4);
	if (!seconds || seconds <= FROM_1904) return undefined;
	return (seconds - FROM_1904) * 1000;
}

/** The capture time of a movie, from the content of its `moov` box. */
export function movieTime(moov: Uint8Array, options: TimeOptions = {}): number | undefined {
	return appleDate(moov, options) ?? udtaDay(moov, options) ?? headerTime(moov);
}

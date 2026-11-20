import { describe, expect, it } from 'vitest';
import { boxAt, exifInstant, heifExifRange, heifExifTime, jpegTime, movieTime, sniff, tiffTime, type LocalTime } from './captureTime';
import { appleMeta, ascii, box, bytes, FROM_1904, fullBox, heifExifItem, heifHead, jpeg, mvhd, ORIGINAL, ORIGINAL_AT, tiff, u16, u32, u64 } from './testFiles';

/** Local wall time as UTC: the tests do not depend on the machine's time zone. */
const asUtc = (t: LocalTime) => Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.second, t.ms);
const opts = { local: asUtc };

describe('exifInstant', () => {
	it('reads the wall time at its offset', () => {
		expect(exifInstant('2026:11:13 14:05:22', '-06:00', undefined, opts)).toBe(Date.parse('2026-11-13T20:05:22Z'));
		expect(exifInstant('2026:11:13 14:05:22', '+01:00', '5', opts)).toBe(Date.parse('2026-11-13T13:05:22.500Z'));
	});

	it('reads a time with no offset as the device local time', () => {
		expect(exifInstant('2026:11:13 14:05:22', undefined, '123', opts)).toBe(Date.parse('2026-11-13T14:05:22.123Z'));
	});

	it('refuses a blank or impossible time', () => {
		expect(exifInstant('0000:00:00 00:00:00', undefined, undefined, opts)).toBeUndefined();
		expect(exifInstant('                   ', undefined, undefined, opts)).toBeUndefined();
		expect(exifInstant('2026:13:40 25:00:00', undefined, undefined, opts)).toBeUndefined();
	});
});

describe('tiffTime', () => {
	it('takes DateTimeOriginal with its offset and fraction, either byte order', () => {
		const at = Date.parse('2026-11-13T20:05:22.250Z');
		expect(tiffTime(tiff(ORIGINAL, true), opts)).toBe(at);
		expect(tiffTime(tiff(ORIGINAL, false), opts)).toBe(at);
	});

	it('falls back to DateTimeDigitized', () => {
		expect(tiffTime(tiff([{ tag: 0x9004, text: '2026:11:13 14:05:22' }, { tag: 0x9012, text: 'Z' }]), opts)).toBe(Date.parse('2026-11-13T14:05:22Z'));
	});

	it('finds nothing without a capture time, or in bytes that are not TIFF', () => {
		expect(tiffTime(tiff([{ tag: 0x9010, text: '+00:00' }]), opts)).toBeUndefined();
		expect(tiffTime(bytes(ascii('nothing at all here')), opts)).toBeUndefined();
		expect(tiffTime(tiff(ORIGINAL).slice(0, 20), opts)).toBeUndefined();
	});
});

describe('jpegTime', () => {
	it('reads the Exif segment after the JFIF one', () => {
		expect(jpegTime(jpeg(tiff(ORIGINAL)), opts)).toBe(Date.parse('2026-11-13T20:05:22.250Z'));
	});

	it('finds nothing in a JPEG with no Exif', () => {
		expect(jpegTime(jpeg(undefined), opts)).toBeUndefined();
	});
});

describe('sniff', () => {
	it('tells the kinds apart from the first bytes', () => {
		expect(sniff(jpeg(undefined))).toBe('jpeg');
		expect(sniff(tiff(ORIGINAL))).toBe('tiff');
		expect(sniff(box('ftyp', ascii('heic'), u32(0), ascii('mif1heic')))).toBe('heif');
		expect(sniff(box('ftyp', ascii('qt  '), u32(0), ascii('qt  ')))).toBe('movie');
		expect(sniff(box('ftyp', ascii('isom'), u32(0), ascii('isommp41')))).toBe('movie');
		expect(sniff(bytes(ascii('\x89PNG\r\n\x1a\n')))).toBeUndefined();
	});
});

describe('boxAt', () => {
	it('reads a box header, a 64-bit size, and a box to the end of the file', () => {
		expect(boxAt(box('moov', [1, 2, 3]), 0, 100)).toEqual({ type: 'moov', size: 11, header: 8 });
		expect(boxAt(bytes(u32(1), ascii('mdat'), u64(2 ** 33)), 0, 2 ** 34)).toEqual({ type: 'mdat', size: 2 ** 33, header: 16 });
		expect(boxAt(bytes(u32(0), ascii('mdat')), 0, 500)).toEqual({ type: 'mdat', size: 500, header: 8 });
	});

	it('refuses a header cut short or a size smaller than itself', () => {
		expect(boxAt(bytes(u32(20), ascii('mo')), 0, 100)).toBeUndefined();
		expect(boxAt(bytes(u32(4), ascii('moov')), 0, 100)).toBeUndefined();
	});
});

describe('HEIF', () => {
	it('finds the Exif item in the meta box', () => {
		expect(heifExifRange(heifHead(5000, 120))).toEqual({ offset: 5000, length: 120 });
		expect(heifExifRange(heifHead(5000, 120, 1))).toEqual({ offset: 5000, length: 120 });
	});

	it('finds nothing in a HEIF with no Exif item', () => {
		const iinf = fullBox('iinf', 0, u16(1), fullBox('infe', 2, u16(1), u16(0), ascii('hvc1'), [0]));
		expect(heifExifRange(bytes(box('ftyp', ascii('heic'), u32(0)), fullBox('meta', 0, iinf)))).toBeUndefined();
	});

	it('reads the item: an offset to the TIFF header, then the TIFF', () => {
		expect(heifExifTime(heifExifItem(tiff(ORIGINAL)), opts)).toBe(ORIGINAL_AT);
	});
});

describe('movieTime', () => {
	const moovBody = (...boxes: Uint8Array[]) => bytes(...boxes);

	it("prefers Apple's creation date, with its offset", () => {
		const meta = appleMeta([
			['com.apple.quicktime.make', 'Apple'],
			['com.apple.quicktime.creationdate', '2026-11-13T14:05:22-0600']
		]);
		expect(movieTime(moovBody(mvhd(FROM_1904 + 1_000_000), meta), opts)).toBe(Date.parse('2026-11-13T20:05:22Z'));
		expect(movieTime(moovBody(appleMeta([['com.apple.quicktime.creationdate', '2026-11-13T14:05:22+01:00']], true)), opts)).toBe(Date.parse('2026-11-13T13:05:22Z'));
	});

	it('reads the movie header otherwise: seconds since 1904, UTC, 32 or 64 bits', () => {
		const at = Date.parse('2026-11-13T20:05:22Z') / 1000;
		expect(movieTime(moovBody(mvhd(at + FROM_1904)), opts)).toBe(at * 1000);
		expect(movieTime(moovBody(mvhd(at + FROM_1904, 1)), opts)).toBe(at * 1000);
	});

	it('reads ©day in udta when there is no Apple date', () => {
		const day = box('\xa9day', u16(24), u16(0x55c4), ascii('2026-11-13T14:05:22+0000'));
		expect(movieTime(moovBody(mvhd(0), box('udta', day)), opts)).toBe(Date.parse('2026-11-13T14:05:22Z'));
	});

	it('finds nothing in an unset header', () => {
		expect(movieTime(moovBody(mvhd(0)), opts)).toBeUndefined();
		expect(movieTime(moovBody(), opts)).toBeUndefined();
	});
});

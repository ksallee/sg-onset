import { describe, expect, it } from 'vitest';
import type { LocalTime } from './captureTime';
import { readCaptureTime } from './readCaptureTime';
import { bytes, heif, jpeg, movie, ORIGINAL, ORIGINAL_AT, tiff } from './testFiles';

const opts = { local: (t: LocalTime) => Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.second, t.ms) };

/** A Blob that counts the bytes read from it. */
function counted(data: Uint8Array, type: string) {
	const file = new Blob([data as BlobPart], { type });
	const seen = { bytes: 0 };
	const slice = file.slice.bind(file);
	file.slice = (start?: number, end?: number, contentType?: string) => {
		const part = slice(start, end, contentType);
		seen.bytes += part.size;
		return part;
	};
	return { file, seen };
}

describe('readCaptureTime', () => {
	it('reads a JPEG photo', async () => {
		expect(await readCaptureTime(new Blob([jpeg(tiff(ORIGINAL)) as BlobPart]), opts)).toBe(ORIGINAL_AT);
	});

	it('reads a HEIF whose Exif item is past the head', async () => {
		expect(await readCaptureTime(new Blob([heif(tiff(ORIGINAL), 400_000) as BlobPart]), opts)).toBe(ORIGINAL_AT);
	});

	it('reads a movie with its index at the end, without reading the movie data', async () => {
		const { file, seen } = counted(movie('2026-11-13T14:05:22-0600', 3_000_000), 'video/quicktime');
		expect(await readCaptureTime(file, opts)).toBe(Date.parse('2026-11-13T20:05:22Z'));
		expect(seen.bytes).toBeLessThan(400_000);
	});

	it('finds nothing in a file with no time, or one it cannot read', async () => {
		expect(await readCaptureTime(new Blob([jpeg(undefined) as BlobPart]), opts)).toBeUndefined();
		expect(await readCaptureTime(new Blob([bytes([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]) as BlobPart]), opts)).toBeUndefined();
		expect(await readCaptureTime(new Blob([]), opts)).toBeUndefined();
		const broken = new Blob([jpeg(tiff(ORIGINAL)) as BlobPart]);
		broken.slice = () => {
			throw new Error('gone');
		};
		expect(await readCaptureTime(broken, opts)).toBeUndefined();
	});
});

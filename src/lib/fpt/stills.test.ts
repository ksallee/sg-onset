import { describe, expect, it } from 'vitest';
import { capturedAtOf, decodeStillRemote, encodeStillRemote, extensionOf, stillDisplayName, stillFilename, stillPrefix } from './stills';

describe('still remote id', () => {
	it('carries the take and what the Attachment will need', () => {
		const id = encodeStillRemote({ take: 900, capturedAt: '2026-11-11T10:22:33Z', caption: 'Chart, "wide"' });
		expect(typeof id).toBe('string');
		expect(decodeStillRemote(id)).toEqual({ take: 900, capturedAt: '2026-11-11T10:22:33Z', caption: 'Chart, "wide"' });
	});

	it('reads nothing from an id that is not one', () => {
		expect(decodeStillRemote(undefined)).toBeUndefined();
		expect(decodeStillRemote(42)).toBeUndefined();
		expect(decodeStillRemote('still:{"take":"x"}')).toBeUndefined();
		expect(decodeStillRemote('nonsense')).toBeUndefined();
	});
});

describe('still file name', () => {
	it('holds the still and the blob, so a lookup finds it', () => {
		expect(stillPrefix('ph1')).toBe('onset_ph1_');
		expect(stillFilename('ph1', 'b1', 'image/jpeg')).toBe('onset_ph1_b1.jpg');
		expect(stillFilename('ph1', 'b1', 'image/jpeg').startsWith(stillPrefix('ph1'))).toBe(true);
	});

	// corpus findings/135: a space is stored as `_`, and `is` and `starts_with` ignore case. A name
	// of ours holds neither a space nor a capital, so what is stored is what was sent, and two
	// photos never differ by case alone.
	it('holds no space and no capital', () => {
		expect(stillFilename('Ph 1', 'B1', 'image/jpeg')).toBe('onset_ph_1_b1.jpg');
		expect(stillPrefix('Ph 1')).toBe('onset_ph_1_');
		const uuid = '0f8e2a4c-6b1d-4e3f-9a7b-2c5d8e1f0a3b';
		expect(stillFilename(uuid, uuid, 'image/heic')).toBe(`onset_${uuid}_${uuid}.heic`);
		expect(stillFilename(uuid, uuid, 'image/heic').length).toBeLessThanOrEqual(200);
	});

	it('takes the extension from the type', () => {
		expect(extensionOf('image/jpeg')).toBe('jpg');
		expect(extensionOf('image/heic')).toBe('heic');
		expect(extensionOf('image/png')).toBe('png');
		expect(extensionOf('video/quicktime')).toBe('mov');
		expect(extensionOf('video/mp4')).toBe('mp4');
		expect(extensionOf('application/x-unknown')).toBe('bin');
		expect(extensionOf('')).toBe('bin');
	});
});

describe('still display name', () => {
	it('shows the capture time and gives it back', () => {
		expect(stillDisplayName('2026-11-11T10:22:33.456Z')).toBe('Photo 2026-11-11T10:22:33.456Z');
		expect(capturedAtOf('Photo 2026-11-11T10:22:33.456Z')).toBe('2026-11-11T10:22:33.456Z');
	});

	it('has a plain name with no capture time', () => {
		expect(stillDisplayName(undefined)).toBe('Photo');
		expect(capturedAtOf('Photo')).toBeUndefined();
		expect(capturedAtOf('holiday.jpg')).toBeUndefined();
		expect(capturedAtOf(null)).toBeUndefined();
	});
});

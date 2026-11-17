import { describe, expect, it } from 'vitest';
import { hasMessage } from '$lib/i18n/messages';
import { addedLabel, failedLabel, mediaKind, pickedAt, pickedType, removedLabel } from './library';

describe('mediaKind', () => {
	it('is a video for a video type, a photo otherwise', () => {
		expect(mediaKind('video/quicktime')).toBe('video');
		expect(mediaKind('video/mp4')).toBe('video');
		expect(mediaKind('image/heic')).toBe('photo');
		expect(mediaKind('image/png')).toBe('photo');
		expect(mediaKind('')).toBe('photo');
	});

	// #89: an audio note is stored as a photo is, its file audio.
	it('is an audio note for an audio type', () => {
		expect(mediaKind('audio/mp4')).toBe('audio');
		expect(mediaKind('Audio/WebM;codecs=opus')).toBe('audio');
	});
});

describe('pickedType', () => {
	it('keeps an image or video type, without parameters', () => {
		expect(pickedType('IMG_0001.HEIC', 'image/heic')).toBe('image/heic');
		expect(pickedType('clip.mov', 'Video/QuickTime; codecs=hvc1')).toBe('video/quicktime');
	});

	it('takes the extension when the picker gives no type', () => {
		expect(pickedType('IMG_0001.HEIC', '')).toBe('image/heic');
		expect(pickedType('A001C003.MOV', '')).toBe('video/quicktime');
		expect(pickedType('witness.mp4', 'application/octet-stream')).toBe('video/mp4');
		expect(pickedType('scan.dng', '')).toBe('image/x-adobe-dng');
	});

	it('refuses what is not a photo or a video', () => {
		expect(pickedType('notes.pdf', 'application/pdf')).toBeUndefined();
		expect(pickedType('take.wav', 'audio/wav')).toBeUndefined();
		expect(pickedType('README', '')).toBeUndefined();
		expect(pickedType('archive.zip', '')).toBeUndefined();
	});
});

describe('pickedAt', () => {
	it('is the time the file says, else the time it was picked', () => {
		expect(pickedAt(Date.parse('2026-11-13T20:05:22.250Z'), Date.parse('2026-11-17T10:00:00Z'))).toBe(Date.parse('2026-11-13T20:05:22.250Z'));
		expect(pickedAt(undefined, Date.parse('2026-11-17T10:00:00Z'))).toBe(Date.parse('2026-11-17T10:00:00Z'));
	});
});

describe('labels', () => {
	it('names what was added, one or many, photos, videos or both', () => {
		expect(addedLabel(['photo'], '3')).toEqual({ key: 'take.edit.photo', params: { take: '3' } });
		expect(addedLabel(['video'], '3')).toEqual({ key: 'take.edit.video', params: { take: '3' } });
		expect(addedLabel(['photo', 'photo'], '3')).toEqual({ key: 'take.edit.photos', params: { n: 2, take: '3' } });
		expect(addedLabel(['video', 'video', 'video'], '3')).toEqual({ key: 'take.edit.videos', params: { n: 3, take: '3' } });
		expect(addedLabel(['photo', 'video'], '3')).toEqual({ key: 'take.edit.media', params: { n: 2, take: '3' } });
		expect(addedLabel(['audio'], '3')).toEqual({ key: 'take.edit.audio', params: { take: '3' } });
	});

	it('names what did not save the same way', () => {
		expect(failedLabel(['photo'])).toEqual({ key: 'take.photo.failed', params: {} });
		expect(failedLabel(['video'])).toEqual({ key: 'take.video.failed', params: {} });
		expect(failedLabel(['photo', 'photo'])).toEqual({ key: 'take.photos.failed', params: { n: 2 } });
		expect(failedLabel(['video', 'video'])).toEqual({ key: 'take.videos.failed', params: { n: 2 } });
		expect(failedLabel(['video', 'photo', 'photo'])).toEqual({ key: 'take.media.failed', params: { n: 3 } });
		expect(failedLabel(['audio'])).toEqual({ key: 'take.audio.failed', params: {} });
	});

	it('names what was removed', () => {
		expect(removedLabel('photo', '3')).toEqual({ key: 'take.edit.photoRemoved', params: { take: '3' } });
		expect(removedLabel('video', '3')).toEqual({ key: 'take.edit.videoRemoved', params: { take: '3' } });
		expect(removedLabel('audio', '3')).toEqual({ key: 'take.edit.audioRemoved', params: { take: '3' } });
	});

	it('uses keys the catalogue has', () => {
		const kinds = [['photo'], ['video'], ['audio'], ['photo', 'photo'], ['video', 'video'], ['photo', 'video']] as const;
		for (const k of kinds) {
			expect(hasMessage(addedLabel([...k], '1').key), addedLabel([...k], '1').key).toBe(true);
			expect(hasMessage(failedLabel([...k]).key), failedLabel([...k]).key).toBe(true);
		}
		for (const k of ['photo', 'video', 'audio'] as const) expect(hasMessage(removedLabel(k, '1').key)).toBe(true);
	});
});

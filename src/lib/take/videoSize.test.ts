import { describe, expect, it } from 'vitest';
import { hasMessage, t } from '$lib/i18n/messages';
import { isLargeVideo, LARGE_VIDEO, sizeNotice } from './videoSize';

const MOV = 'video/quicktime';

describe('isLargeVideo', () => {
	// Kevin, 2026-11-17 (#94): a video over 100 MB gets the notice. Decimal, as iOS shows storage.
	it('is a video over 100 MB', () => {
		expect(LARGE_VIDEO).toBe(100_000_000);
		expect(isLargeVideo(MOV, 100_000_001)).toBe(true);
		expect(isLargeVideo('video/mp4', 1_200_000_000)).toBe(true);
		expect(isLargeVideo(MOV, 100_000_000)).toBe(false);
		expect(isLargeVideo(MOV, 40_000_000)).toBe(false);
	});

	it('is never a photo, however large', () => {
		expect(isLargeVideo('image/x-adobe-dng', 300_000_000)).toBe(false);
		expect(isLargeVideo('image/heic', 150_000_000)).toBe(false);
	});

	// #89: at 128 kbps, high for speech, an hour is about 58 MB. An audio
	// note gets no notice.
	it('is never an audio note, however long', () => {
		expect(isLargeVideo('audio/mp4', 230_000_000)).toBe(false);
		expect(isLargeVideo('audio/webm', 120_000_000)).toBe(false);
		expect(sizeNotice([{ type: 'audio/mp4', size: 230_000_000 }])).toBeUndefined();
	});
});

describe('sizeNotice', () => {
	it('says the size of one large video', () => {
		const notice = sizeNotice([{ type: MOV, size: 1_200_000_000 }])!;
		expect(notice).toEqual({ key: 'take.video.large', params: { size: '1.2 GB' } });
		expect(t(notice.key, notice.params)).toBe('This video is 1.2 GB. It takes room on this iPad and a long time to sync.');
	});

	it('says how many and their size together for several', () => {
		const notice = sizeNotice([
			{ type: MOV, size: 1_200_000_000 },
			{ type: 'image/jpeg', size: 4_000_000 },
			{ type: 'video/mp4', size: 340_000_000 },
			{ type: MOV, size: 20_000_000 }
		])!;
		expect(notice).toEqual({ key: 'take.videos.large', params: { n: 2, size: '1.5 GB' } });
		expect(t(notice.key, notice.params)).toBe('These 2 videos are 1.5 GB. They take room on this iPad and a long time to sync.');
	});

	it('says nothing for photos and small videos', () => {
		expect(sizeNotice([{ type: 'image/jpeg', size: 9_000_000 }, { type: MOV, size: 99_000_000 }])).toBeUndefined();
		expect(sizeNotice([])).toBeUndefined();
	});

	it('uses keys the catalogue has', () => {
		expect(hasMessage('take.video.large')).toBe(true);
		expect(hasMessage('take.videos.large')).toBe(true);
	});
});

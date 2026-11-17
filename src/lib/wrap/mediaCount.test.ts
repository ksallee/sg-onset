import { describe, expect, it } from 'vitest';
import { hasMessage } from '$lib/i18n/messages';
import { addCount, COUNTED, countedAs, countLine, totalOf } from './mediaCount';

// Kevin, 2026-11-17 (#89): each kind is counted and named as itself, a video never as a photo.
describe('countedAs', () => {
	it('counts a photo, a video and an audio note each as itself', () => {
		expect(countedAs('photo')).toBe('photo');
		expect(countedAs('video')).toBe('video');
		expect(countedAs('audio')).toBe('audio');
	});

	// An annotated copy goes with its photo; the setup diagram is the slate's own.
	it('does not count an annotated copy or a setup diagram', () => {
		expect(countedAs('annotated')).toBeUndefined();
		expect(countedAs('diagram')).toBeUndefined();
	});
});

describe('addCount and totalOf', () => {
	it('adds one of a kind, and nothing for a kind not counted', () => {
		let counts = addCount({}, 'photo');
		counts = addCount(counts, 'photo');
		counts = addCount(counts, 'audio');
		counts = addCount(counts, 'annotated');
		expect(counts).toEqual({ photo: 2, audio: 1 });
		expect(totalOf(counts)).toBe(3);
		expect(totalOf({})).toBe(0);
	});
});

describe('countLine', () => {
	it('names each kind with its number, photos first, then videos, then audio notes', () => {
		expect(countLine({ audio: 1, photo: 2, video: 1 })).toBe('2 photos, 1 video, 1 audio note');
		expect(countLine({ video: 3 })).toBe('3 videos');
		expect(countLine({ audio: 2 })).toBe('2 audio notes');
		expect(countLine({ photo: 1 })).toBe('1 photo');
	});

	it('says how many of the first kind asked when there is none', () => {
		expect(countLine({})).toBe('0 photos');
		expect(countLine({ photo: 0 }, ['audio'])).toBe('0 audio notes');
		expect(countLine({ audio: 4, photo: 1 }, ['photo', 'video'])).toBe('1 photo');
	});

	it('uses words the catalogue has', () => {
		for (const kind of COUNTED) for (const n of ['one', 'other']) expect(hasMessage(`wrap.count.${kind}.${n}`)).toBe(true);
	});
});

import { describe, expect, it } from 'vitest';
import { AUDIO_TYPES, audioExtension, audioType, isAudio, pickAudioType } from './audioFormat';

/** A browser that writes these types. */
const writes =
	(...types: string[]) =>
	(type: string) =>
		types.includes(type);

describe('pickAudioType', () => {
	// Kevin, 2026-11-17 (#89): kept as the browser writes it. AAC in MP4 first: QuickTime and every
	// browser play it. Opus in WebM where the browser has no AAC.
	it('asks Safari for AAC in MP4', () => {
		expect(pickAudioType(writes('audio/mp4', 'audio/mp4;codecs=mp4a.40.2'))).toBe('audio/mp4;codecs=mp4a.40.2');
	});

	it('asks a browser with no AAC for Opus in WebM', () => {
		expect(pickAudioType(writes('audio/webm', 'audio/webm;codecs=opus'))).toBe('audio/webm;codecs=opus');
		expect(pickAudioType(writes('audio/webm'))).toBe('audio/webm');
	});

	// A bare MP4 may hold Opus in Chrome, which QuickTime does not play: WebM before it.
	it('takes WebM before an MP4 that does not say AAC', () => {
		expect(pickAudioType(writes('audio/mp4', 'audio/webm;codecs=opus'))).toBe('audio/webm;codecs=opus');
		expect(pickAudioType(writes('audio/mp4'))).toBe('audio/mp4');
	});

	it('leaves the type to the browser when it writes none of them', () => {
		expect(pickAudioType(() => false)).toBeUndefined();
	});

	it('asks only for audio types', () => {
		expect(AUDIO_TYPES.every(isAudio)).toBe(true);
	});
});

describe('audioType', () => {
	it('stores the type the browser wrote, without its codecs', () => {
		expect(audioType('audio/mp4;codecs=mp4a.40.2')).toBe('audio/mp4');
		expect(audioType('audio/webm; codecs="opus"')).toBe('audio/webm');
		expect(audioType('Audio/Ogg')).toBe('audio/ogg');
	});

	// findings/152: Flow PT reads an Opus WebM as video/webm. The app decides, from what it recorded.
	it('stores a WebM or MP4 said to be video as audio: the microphone gave it no picture', () => {
		expect(audioType('video/webm;codecs=opus')).toBe('audio/webm');
		expect(audioType('video/mp4')).toBe('audio/mp4');
	});

	it('falls back to the type asked for, then to AAC in MP4', () => {
		expect(audioType('', 'audio/webm;codecs=opus')).toBe('audio/webm');
		expect(audioType(undefined, undefined)).toBe('audio/mp4');
		expect(audioType('application/octet-stream', 'audio/mp4;codecs=mp4a.40.2')).toBe('audio/mp4');
	});

	it('is always an audio type', () => {
		for (const t of ['audio/mp4', 'video/webm', '', 'text/plain']) expect(isAudio(audioType(t))).toBe(true);
	});
});

describe('audioExtension', () => {
	it('names M4A, WebM and the rest by their usual extension', () => {
		expect(audioExtension('audio/mp4')).toBe('m4a');
		expect(audioExtension('audio/mp4;codecs=mp4a.40.2')).toBe('m4a');
		expect(audioExtension('audio/webm')).toBe('webm');
		expect(audioExtension('audio/ogg')).toBe('ogg');
		expect(audioExtension('audio/aac')).toBe('aac');
		expect(audioExtension('audio/mpeg')).toBe('mp3');
		expect(audioExtension('audio/x-unheard')).toBeUndefined();
	});
});

describe('isAudio', () => {
	it('is an audio type, whatever its case and codecs', () => {
		expect(isAudio('audio/mp4')).toBe(true);
		expect(isAudio(' AUDIO/webm;codecs=opus')).toBe(true);
		expect(isAudio('video/webm')).toBe(false);
		expect(isAudio('')).toBe(false);
	});
});

import { describe, expect, it } from 'vitest';
import { stillPrefix } from './stills';
import { capturedAtOfCode, movieOf, retimedCode, versionCode, versionData, versionFilename, versionKind, type TakeMedia } from './versions';

const MEDIA: TakeMedia = { recordId: 'V1', blobId: 'B1', type: 'video/quicktime', take: 900, capturedAt: '2026-11-13T20:05:22Z' };

describe('versionKind', () => {
	// Kevin, 2026-11-17: videos go up as Versions, photos stay Attachments.
	it('sends a video as a Version, a photo not', () => {
		expect(versionKind('video/quicktime')).toBe('video');
		expect(versionKind('Video/MP4; codecs=avc1')).toBe('video');
		expect(versionKind('image/jpeg')).toBeUndefined();
		expect(versionKind('image/heic')).toBeUndefined();
		expect(versionKind('')).toBeUndefined();
	});

	// Kevin, 2026-11-17 (#89): an audio note goes up as a Version too, kept as the browser recorded it.
	it('sends an audio note as a Version, M4A from Safari and WebM from Chrome alike', () => {
		expect(versionKind('audio/mp4')).toBe('audio');
		expect(versionKind('audio/webm;codecs=opus')).toBe('audio');
		expect(versionKind('audio/ogg')).toBe('audio');
	});
});

describe('versionFilename', () => {
	it('names the kind, the record and the file, with no space and no capital', () => {
		expect(versionFilename(MEDIA)).toBe('onset_video_v1_b1.mov');
		expect(versionFilename({ ...MEDIA, type: 'video/mp4' })).toBe('onset_video_v1_b1.mp4');
		expect(versionFilename({ ...MEDIA, type: 'audio/mp4' })).toBe('onset_audio_v1_b1.m4a');
		expect(versionFilename({ ...MEDIA, type: 'audio/webm' })).toBe('onset_audio_v1_b1.webm');
	});

	// A photo's lookup is `filename starts_with onset_<id>_`: the file of a Version, and the
	// transcodes the server names after it (findings/123), never match it.
	it('never starts as the file of a photo does', () => {
		const id = '0f8e2a4c-6b1d-4e3f-9a7b-2c5d8e1f0a3b';
		expect(versionFilename({ ...MEDIA, recordId: id }).startsWith(stillPrefix(id))).toBe(false);
	});
});

describe('versionCode', () => {
	it('is the kind and the capture time, as a photo is shown, and reads back', () => {
		expect(versionCode(MEDIA)).toBe('Video 2026-11-13T20:05:22Z');
		expect(capturedAtOfCode('Video 2026-11-13T20:05:22Z')).toBe('2026-11-13T20:05:22Z');
		expect(versionCode({ ...MEDIA, capturedAt: undefined })).toBe('Video');
		expect(capturedAtOfCode('Video')).toBeUndefined();
		expect(capturedAtOfCode('sh010_v001')).toBeUndefined();
		expect(capturedAtOfCode(null)).toBeUndefined();
	});

	it('names an audio note as Flow PT shows it, and reads it back', () => {
		const note = { ...MEDIA, type: 'audio/mp4' };
		expect(versionCode(note)).toBe('Audio note 2026-11-13T20:05:22Z');
		expect(capturedAtOfCode('Audio note 2026-11-13T20:05:22Z')).toBe('2026-11-13T20:05:22Z');
		expect(versionCode({ ...note, capturedAt: undefined })).toBe('Audio note');
	});
});

describe('retimedCode', () => {
	it('keeps the kind of a name we wrote and changes its time', () => {
		expect(retimedCode('Video 2026-11-13T20:05:22Z', '2026-11-13T21:00:00Z')).toBe('Video 2026-11-13T21:00:00Z');
		expect(retimedCode('Video', undefined)).toBe('Video');
		expect(retimedCode('New Version 812', '2026-11-13T21:00:00Z')).toBe('Video 2026-11-13T21:00:00Z');
		expect(retimedCode('Audio note 2026-11-13T20:05:22Z', '2026-11-13T21:00:00Z')).toBe('Audio note 2026-11-13T21:00:00Z');
		expect(retimedCode('Audio note', undefined)).toBe('Audio note');
	});
});

describe('versionData', () => {
	const where = { projectId: 70, takeType: 'CustomEntity09', uuidField: 'sg_onset_uuid' };

	// entity_types/Version.md: `project` is required, `code` is not unique, `entity` takes {type, id}.
	it('links the take, carries the project and the client UUID, and names the Version', () => {
		expect(versionData(MEDIA, where)).toEqual({
			project: { type: 'Project', id: 70 },
			entity: { type: 'CustomEntity09', id: 900 },
			code: 'Video 2026-11-13T20:05:22Z',
			sg_onset_uuid: 'V1'
		});
	});

	it('puts a caption in the description', () => {
		expect(versionData({ ...MEDIA, caption: 'Witness cam B' }, where)).toMatchObject({ description: 'Witness cam B' });
	});
});

describe('movieOf', () => {
	// entity_types/Version.md: an object with url, name, content_type, link_type, type and id.
	it('reads the file a Version holds', () => {
		const value = { url: 'https://bucket/x?sig', name: 'onset_video_v1_b1.mov', content_type: 'video/quicktime', link_type: 'upload', type: 'Attachment', id: 31 };
		expect(movieOf(value)).toEqual({ id: 31, name: 'onset_video_v1_b1.mov', url: 'https://bucket/x?sig' });
	});

	it('finds none in an empty field or a placeholder', () => {
		expect(movieOf(null)).toBeUndefined();
		expect(movieOf('https://site/images/status/transient/thumbnail_pending.png')).toBeUndefined();
		expect(movieOf({ name: 'x.mov' })).toBeUndefined();
	});
});

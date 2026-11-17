// A take's media that go to Flow PT as a Version linked to the take, its file in
// `sg_uploaded_movie`: videos (#94) and audio notes (#89), both decided by Kevin, 2026-11-17.
// Photos stay Attachments (stills.ts). Pure: which files, their names, the create, the file read back.
// `takeVersions.ts` does the calls; the transport hands it every upload whose type is here.
//
// From the corpus:
// - A Version needs `project` only; `code` is generated when absent and is not unique, so `id`
//   is the key (entity_types/Version.md). Ours also carries the client UUID, in a field created
//   unique (findings/127): a create sent twice is refused, not made twice.
// - `sg_uploaded_movie` holds one file, and a new upload replaces it. The server transcodes it
//   to `_mp4` (findings/022) and adds two Attachments of its own named after it (findings/123).
// - `Version.entity` takes a custom entity row, as a Take is: 201, read back as sent
//   (findings/151). A slot whose Versions are turned on also lists the Version in `sg_versions`.
// - Audio on `sg_uploaded_movie`, M4A and Opus WebM alike, becomes an AAC mp4 with no picture and
//   no thumbnail (findings/152). Its stored `content_type` is the server's choice: an Opus WebM
//   reads `video/webm`. So the kind is decided here, from the type the device stored.

import { extensionOf, safe } from './stills';

export const VERSION = 'Version';
/** The Version's file. One file: a new upload replaces it (findings/022). */
export const MOVIE = 'sg_uploaded_movie';

export type VersionKind = 'video' | 'audio';

/**
 * The media that go up as a Version, by file type, with the word Flow PT shows for each. The
 * first is what a name we did not write is taken for (`retimedCode`).
 */
const KINDS: readonly { kind: VersionKind; matches: (type: string) => boolean; shown: string }[] = [
	{ kind: 'video', matches: (type) => type.startsWith('video/'), shown: 'Video' },
	{ kind: 'audio', matches: (type) => type.startsWith('audio/'), shown: 'Audio note' }
];

/** The kind of Version a file goes up as. Undefined: not a Version (a photo is an Attachment). */
export function versionKind(type: string): VersionKind | undefined {
	const bare = type.split(';')[0].trim().toLowerCase();
	return KINDS.find((k) => k.matches(bare))?.kind;
}

const shownOf = (type: string) => KINDS.find((k) => k.kind === versionKind(type))?.shown ?? 'Media';

/**
 * A take's file to send as a Version: the record on the device and its file, the take on the
 * server, what the Version says. Not tied to one table: a video is a still today, and an audio
 * note may be its own record.
 */
export type TakeMedia = { recordId: string; blobId: string; type: string; take: number; capturedAt?: string; caption?: string };

/**
 * The file name a Version's file goes up under: `onset_video_<record>_<blob>.mov`,
 * `onset_audio_<record>_<blob>.m4a`. The name of
 * the file in `sg_uploaded_movie` is how a check knows the file is ours. It never starts as a
 * photo's does (`stillPrefix`), so a photo's lookup by file name never finds it.
 */
export function versionFilename(media: TakeMedia): string {
	const kind = versionKind(media.type) ?? 'media';
	return `onset_${kind}_${safe(media.recordId)}_${safe(media.blobId)}.${extensionOf(media.type)}`;
}

/** The Version's name: the kind and the capture time, as a photo's display name is (stills.ts). */
export function versionCode(media: Pick<TakeMedia, 'type' | 'capturedAt'>): string {
	const shown = shownOf(media.type);
	return media.capturedAt ? `${shown} ${media.capturedAt}` : shown;
}

/** The capture time out of a name we wrote. */
export function capturedAtOfCode(code: unknown): string | undefined {
	if (typeof code !== 'string') return undefined;
	for (const { shown } of KINDS) {
		if (!code.startsWith(`${shown} `)) continue;
		const text = code.slice(shown.length + 1);
		return Number.isNaN(Date.parse(text)) ? undefined : text;
	}
	return undefined;
}

/**
 * The name of a Version with another capture time, kept to its kind. A change of a record carries
 * no file type: the kind is read from the name there. One we did not write is named as a video.
 */
export function retimedCode(code: unknown, capturedAt: string | undefined): string {
	const shown = KINDS.find((k) => typeof code === 'string' && (code === k.shown || code.startsWith(`${k.shown} `)))?.shown ?? KINDS[0].shown;
	return capturedAt ? `${shown} ${capturedAt}` : shown;
}

/** The `data` of the Version's create: the project, the take, the name and the client UUID. */
export function versionData(media: TakeMedia, where: { projectId: number; takeType: string; uuidField: string }): Record<string, unknown> {
	return {
		project: { type: 'Project', id: where.projectId },
		entity: { type: where.takeType, id: media.take },
		code: versionCode(media),
		[where.uuidField]: media.recordId,
		...(media.caption ? { description: media.caption } : {})
	};
}

export type Movie = { id: number; name: string; url: string };

/**
 * `sg_uploaded_movie` as a read answers it: an object with the file's url, name and Attachment id
 * (entity_types/Version.md). The url is signed for a few minutes: used once, never kept.
 */
export function movieOf(value: unknown): Movie | undefined {
	if (value === null || typeof value !== 'object') return undefined;
	const v = value as Record<string, unknown>;
	if (typeof v.url !== 'string' || typeof v.name !== 'string' || typeof v.id !== 'number') return undefined;
	return { id: v.id, name: v.name, url: v.url };
}

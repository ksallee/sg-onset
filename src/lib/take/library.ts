// Photos and videos picked from the photo library or Files, from the take sheet: which files are
// taken and as what type, the time each was taken, and the words for what was added, lost or
// removed. Each lands on the take as a photo from the camera does (marks.ts), and so does an
// audio note (#89, audioNote.ts). Pure.

import type { MessageKey } from '$lib/i18n/messages';

export type MediaKind = 'photo' | 'video' | 'audio';

/** A video for a video type, an audio note for an audio type, a photo for anything else. */
export function mediaKind(type: string): MediaKind {
	const t = type.trim().toLowerCase();
	return t.startsWith('video/') ? 'video' : t.startsWith('audio/') ? 'audio' : 'photo';
}

/** What Files may hand over with no type. The kinds a camera or a phone writes. */
const BY_EXTENSION: Record<string, string> = {
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	png: 'image/png',
	heic: 'image/heic',
	heif: 'image/heif',
	webp: 'image/webp',
	tif: 'image/tiff',
	tiff: 'image/tiff',
	dng: 'image/x-adobe-dng',
	mov: 'video/quicktime',
	mp4: 'video/mp4',
	m4v: 'video/x-m4v'
};

/**
 * The type of a picked file, or undefined when it is not a photo or a video. A file from Files can
 * come with no type, or a generic one: its extension says.
 */
export function pickedType(name: string, type: string): string | undefined {
	const given = type.split(';')[0].trim().toLowerCase();
	if (given.startsWith('image/') || given.startsWith('video/')) return given;
	if (given && given !== 'application/octet-stream') return undefined;
	const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase();
	return ext ? BY_EXTENSION[ext] : undefined;
}

/** When a picked file was taken: the time it carries, else the moment it was picked, as a photo. */
export function pickedAt(fromFile: number | undefined, now: number): number {
	return fromFile ?? now;
}

export type KindLabel = { key: MessageKey; params: Record<string, string | number> };

/** One kind alone, or several: an audio note comes alone, from the microphone. */
function byKinds(kinds: readonly MediaKind[]): MediaKind | 'photos' | 'videos' | 'media' {
	if (kinds.length === 1) return kinds[0];
	if (kinds.every((k) => k === 'photo')) return 'photos';
	return kinds.every((k) => k === 'video') ? 'videos' : 'media';
}

const one = (which: ReturnType<typeof byKinds>): which is MediaKind => which === 'photo' || which === 'video' || which === 'audio';

/** The undo label for files added to a take in one go. */
export function addedLabel(kinds: readonly MediaKind[], take: string): KindLabel {
	const which = byKinds(kinds);
	const n = kinds.length;
	return one(which) ? { key: `take.edit.${which}`, params: { take } } : { key: `take.edit.${which}`, params: { n, take } };
}

/** The notice for files that did not save. */
export function failedLabel(kinds: readonly MediaKind[]): KindLabel {
	const which = byKinds(kinds);
	return one(which) ? { key: `take.${which}.failed`, params: {} } : { key: `take.${which}.failed`, params: { n: kinds.length } };
}

/** The undo label for a photo, video or audio note taken off a take. */
export function removedLabel(kind: MediaKind, take: string): KindLabel {
	return { key: `take.edit.${kind}Removed`, params: { take } };
}

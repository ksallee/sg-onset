// Photos and videos picked from the photo library or Files, from the take sheet: which files are
// taken and as what type, the time each was taken, and the words for what was added or lost.
// Each lands on the take as a photo from the camera does (marks.ts). Pure.

import type { MessageKey } from '$lib/i18n/messages';

export type MediaKind = 'photo' | 'video';

/** A video for a video type, a photo for anything else. */
export function mediaKind(type: string): MediaKind {
	return type.trim().toLowerCase().startsWith('video/') ? 'video' : 'photo';
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

function byKinds(kinds: readonly MediaKind[]): 'photo' | 'video' | 'photos' | 'videos' | 'media' {
	const videos = kinds.filter((k) => k === 'video').length;
	if (kinds.length === 1) return videos ? 'video' : 'photo';
	if (videos === 0) return 'photos';
	return videos === kinds.length ? 'videos' : 'media';
}

/** The undo label for files added to a take in one go. */
export function addedLabel(kinds: readonly MediaKind[], take: string): KindLabel {
	const which = byKinds(kinds);
	const n = kinds.length;
	return which === 'photo' || which === 'video' ? { key: `take.edit.${which}`, params: { take } } : { key: `take.edit.${which}`, params: { n, take } };
}

/** The notice for files that did not save. */
export function failedLabel(kinds: readonly MediaKind[]): KindLabel {
	const which = byKinds(kinds);
	return which === 'photo' || which === 'video' ? { key: `take.${which}.failed`, params: {} } : { key: `take.${which}.failed`, params: { n: kinds.length } };
}

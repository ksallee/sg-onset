// Stills. A still is a record on the device and an Attachment on the server, and the server makes
// an Attachment only when a file is uploaded: there is no row to create first (corpus
// findings/entity_types/Attachment.md: a created Attachment has no file and can never get one).
// So the create of a still sends nothing, and what the upload will need rides in the still's
// remote id. Pure.

import type { RemoteId } from '$lib/outbox/types';

/** What the upload of a still needs: the take to attach to, and what to write on the Attachment. */
export type StillRemote = { take: number; capturedAt?: string; caption?: string };

const PREFIX = 'still:';

/** The remote id of a still. An id, never a URL: it names the take by its server id. */
export function encodeStillRemote(remote: StillRemote): string {
	return PREFIX + JSON.stringify(remote);
}

export function decodeStillRemote(id: RemoteId | undefined): StillRemote | undefined {
	if (typeof id !== 'string' || !id.startsWith(PREFIX)) return undefined;
	try {
		const value = JSON.parse(id.slice(PREFIX.length)) as Partial<StillRemote> | null;
		if (!value || typeof value.take !== 'number') return undefined;
		return {
			take: value.take,
			...(typeof value.capturedAt === 'string' ? { capturedAt: value.capturedAt } : {}),
			...(typeof value.caption === 'string' ? { caption: value.caption } : {})
		};
	} catch {
		return undefined;
	}
}

const EXTENSIONS: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/heic': 'heic',
	'image/heif': 'heif',
	'image/webp': 'webp',
	'image/tiff': 'tif',
	'image/x-adobe-dng': 'dng',
	'video/quicktime': 'mov',
	'video/mp4': 'mp4'
};

export function extensionOf(type: string): string {
	return EXTENSIONS[type.split(';')[0].trim().toLowerCase()] ?? 'bin';
}

/** What every file name of a still starts with. A lookup by client UUID searches for it. */
export function stillPrefix(stillId: string): string {
	return `onset_${stillId}_`;
}

/**
 * The file name a still is uploaded under. `Attachment.filename` is set by the upload and is
 * read-only afterwards (entity_types/Attachment.md), so it is the one identity that is there
 * from the moment the row exists.
 */
export function stillFilename(stillId: string, blobId: string, type: string): string {
	return `${stillPrefix(stillId)}${blobId}.${extensionOf(type)}`;
}

const SHOWN = 'Photo';

/** What a person sees for the file: the capture time. `filename` keeps the ids. */
export function stillDisplayName(capturedAt: string | undefined): string {
	return capturedAt ? `${SHOWN} ${capturedAt}` : SHOWN;
}

/** The capture time out of a display name we wrote. */
export function capturedAtOf(displayName: unknown): string | undefined {
	if (typeof displayName !== 'string' || !displayName.startsWith(`${SHOWN} `)) return undefined;
	const text = displayName.slice(SHOWN.length + 1);
	return Number.isNaN(Date.parse(text)) ? undefined : text;
}

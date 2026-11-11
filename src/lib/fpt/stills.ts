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

/**
 * An id as it goes in a file name. The server stores each space as `_`, and `is` and
 * `starts_with` ignore case (corpus findings/135_attachment_custom_field_filename.md): a name
 * of ours holds only lowercase letters, digits, `-` and `_`, so what is stored is what was sent
 * and no two photos differ by case alone. Our ids are lowercase UUIDs, unchanged by this.
 */
const safe = (id: string) => id.toLowerCase().replace(/[^a-z0-9-]/g, '_');

/** What every file name of a still starts with. A lookup by client UUID searches for it. */
export function stillPrefix(stillId: string): string {
	return `onset_${safe(stillId)}_`;
}

/**
 * The file name a still is uploaded under. `Attachment.filename` is set by the upload and is
 * read-only afterwards (entity_types/Attachment.md), so it is the one identity that is there
 * from the moment the row exists. About 90 characters for two UUIDs; 200 are kept (findings/135).
 */
export function stillFilename(stillId: string, blobId: string, type: string): string {
	return `${stillPrefix(stillId)}${safe(blobId)}.${extensionOf(type)}`;
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

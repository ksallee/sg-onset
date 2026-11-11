// The upload numbers and the two bodies the presigned flow needs. Pure.

import type { SentPart } from '$lib/outbox/transport';

/**
 * How long an upload URL is used. It is signed for 900 s: a PUT at 840 s passed and one at 910 s
 * was refused (corpus findings/125_upload_host_cors.md). 840 s is the last moment measured good.
 */
export const URL_LIFE_MS = 840_000;

const MIB = 1024 * 1024;

/**
 * The largest file sent in one PUT. The largest single PUT ever measured was 7.7 MB and the cap
 * is unmeasured (findings/125), so anything larger goes in parts.
 */
export const SINGLE_PUT_MAX = 8 * MIB;

/** Every part but the last must be at least 5 MiB (corpus findings/044_multipart_upload.md). */
export const PART_SIZE = 8 * MIB;

export type UploadSizes = { singlePutMax: number; partSize: number };
export const UPLOAD_SIZES: UploadSizes = { singlePutMax: SINGLE_PUT_MAX, partSize: PART_SIZE };

/** The switch is ours: nothing in the API refuses a single PUT for being large (findings/044). */
export function isMultipart(size: number, sizes: UploadSizes = UPLOAD_SIZES): boolean {
	return size > sizes.singlePutMax;
}

/**
 * A part link pointed at another part. The server hands out the link to the next part only; the
 * link to mint a URL again for a part already passed is the same link with its `part_number`
 * changed (`part_number=1` answers 200: corpus endpoints/get_entity_type_id_field_upload_multipart.md).
 */
export function partLink(link: string, partNumber: number): string {
	return link.replace(/([?&]part_number=)\d+/, `$1${partNumber}`);
}

/**
 * `upload_info` for the completion: the init reply verbatim, plus the ETag of every part in part
 * order when the init was multipart (corpus endpoints/post_entity_type_id_field_upload.md).
 */
export function completionInfo(info: Record<string, unknown>, parts: readonly SentPart[]): Record<string, unknown> {
	if (info.multipart_upload !== true) return info;
	const etags = [...parts]
		.sort((a, b) => a.index - b.index)
		.map((part) => {
			if (!part.etag) throw new Error(`part ${part.index + 1} has no ETag`);
			return part.etag;
		});
	return { ...info, etags };
}

// The Versions of a take's media on the site: found by client UUID, made when missing, their file
// checked. The calls behind versions.ts. The transport hands every upload whose type is a Version
// kind here: a video (#94) or an audio note (#89). What it needs is a `TakeMedia`: the
// record, its file, the take on the server. Nothing here knows which table the record is in.
//
// The upload itself is the transport's, as for a photo: `target` says where the file goes, the
// presigned calls are the same (findings/044, 125, 140), and `verify` is the check after.

import type { EntityRow } from 'sg-widgets-core';
import { TransportError } from '$lib/outbox/transport';
import { ApiRefusal, type Api } from './api';
import { isUniqueRefusal } from './errors';
import type { Resolution } from './schema';
import { MOVIE, movieOf, VERSION, versionData, versionFilename, type TakeMedia } from './versions';

/** What a check of a Version's file found. `remoteId`: the Version, when there is one. */
export type VersionCheck = { verified: boolean; remoteId?: number };

/** Where a file goes in the presigned upload: the entity, the row, the field, the file name. */
export type UploadTarget = { entityType: string; id: number; field: string; filename: string };

const READ = ['code', 'description', 'entity', MOVIE];

export type TakeVersions = ReturnType<typeof takeVersions>;

export function takeVersions(api: Api, projectId: number) {
	/** The Versions of records, by client UUID. A deleted one is not found (findings/136). */
	async function find(res: Resolution, recordIds: readonly string[], signal?: AbortSignal): Promise<Map<string, EntityRow>> {
		const out = new Map<string, EntityRow>();
		if (!recordIds.length) return out;
		const uuid = res.versionUuid;
		// `in` on text ignores case, as the unique check does (findings/127, field_types/text.md).
		const rows = await api.search(VERSION, [uuid, 'in', [...recordIds]], [uuid, ...READ], recordIds.length + 5, signal);
		for (const id of recordIds) {
			const row = rows.find((r) => String(r.attributes[uuid] ?? '').trim().toLowerCase() === id.toLowerCase());
			if (row) out.set(id, row);
		}
		return out;
	}

	/**
	 * The Version a take's file goes on: the one an earlier try made, else a new one. A create that
	 * landed and was not answered is refused when sent again (findings/127), and then found.
	 */
	async function ensure(res: Resolution, media: TakeMedia, signal?: AbortSignal): Promise<number> {
		const found = (await find(res, [media.recordId], signal)).get(media.recordId);
		if (found) return found.id;
		const data = versionData(media, { projectId, takeType: res.entities.take, uuidField: res.versionUuid });
		try {
			const [row] = await api.batch([{ request_type: 'create', entity: VERSION, data }], signal);
			if (row?.request_type === 'create') return row.data.id;
			throw new TransportError('failed', 'Flow Production Tracking made no Version');
		} catch (error) {
			if (!(error instanceof ApiRefusal)) throw error;
			if (isUniqueRefusal(error.failure)) {
				const again = (await find(res, [media.recordId], signal)).get(media.recordId);
				if (again) return again.id;
			}
			throw new TransportError('failed', error.failure.title);
		}
	}

	/** Where the file goes: the Version's movie field. One file there; a new upload replaces it (findings/022). */
	function target(version: number, media: TakeMedia): UploadTarget {
		return { entityType: VERSION, id: version, field: MOVIE, filename: versionFilename(media) };
	}

	/**
	 * Is the file on the site: the Version's movie is this file, and whole. A 201 proves nothing
	 * (findings/039): the stored file is fetched and its size compared. The link to the take is read
	 * back, and put back if it is not there (entity_types/Version.md).
	 */
	async function verify(res: Resolution, media: TakeMedia, size: number, signal?: AbortSignal): Promise<VersionCheck> {
		const row = (await find(res, [media.recordId], signal)).get(media.recordId);
		if (!row) return { verified: false };
		const movie = movieOf(row.attributes[MOVIE]);
		if (!movie || movie.name !== versionFilename(media)) return { verified: false, remoteId: row.id };
		if ((await api.fileSize(movie.url, signal)) !== size) return { verified: false, remoteId: row.id };
		const entity = row.relationships.entity?.data as { type?: string; id?: number } | null | undefined;
		if (entity?.type !== res.entities.take || entity.id !== media.take) {
			await api.update(VERSION, row.id, { entity: { type: res.entities.take, id: media.take } }, signal);
		}
		return { verified: true, remoteId: row.id };
	}

	return { find, ensure, target, verify };
}

// The outbox's Transport over the Flow Production Tracking REST API. The edge: it holds no rules
// of its own. What a record becomes is payload.ts, what a refusal means is errors.ts, what the
// site's schema is called is schema.ts.
//
// Behaviour relied on, from the sg-groundtruth corpus:
// - `_batch` is all or nothing and cannot link rows it creates (recipes/002_batch.md): one
//   dependency level per push, which the runner guarantees.
// - A create whose client UUID is there is refused, 400 code 104, in a batch too, and the batch
//   rolls back (findings/127_retry_and_client_uuid.md). That is `refused: duplicate`.
// - A batch with no answer may have committed (findings/127): `timeout`, never resent blind.
// - An upload is three calls and the last one's 201 proves nothing (findings/039_upload_silent_failures.md).
// - A `_batch` create on a custom entity takes a float as a numeric string and honours
//   `created_at`, as a single POST does (findings/137_batch_create_coercion.md). It also takes
//   what a single POST refuses, so payload.ts checks every value before it is sent.
// - A deleted row frees its client UUID, and reviving it after the UUID was taken again fails
//   with 400 code 104 (findings/136_unique_scope_retired.md). So nothing here revives a row: an
//   undone delete is a create, a new row under the same client UUID. A lookup sees live rows only.
// - No rate limit seen at 28 mixed requests a second for 10 s (findings/144_rate_limit_burst.md):
//   429 and 5xx stay `failed`, and the runner's backoff is the answer.
// - A refusal for want of rights is 400 code 104 naming the type (findings/143_nonadmin_rows.md):
//   said once in plain words, and that kind of change waits for the session.

import type { BatchRequest, EntityRow } from 'sg-widgets-core';
import {
	TransportError,
	type BlobRef,
	type Found,
	type PushOp,
	type PushResult,
	type ReadRequest,
	type Refusal,
	type SentPart,
	type ServerRecord,
	type Transport,
	type UploadSession
} from '$lib/outbox/transport';
import type { RecordRef, RemoteId } from '$lib/outbox/types';
import { ApiRefusal, createApi, type Filter, type FptOptions } from './api';
import { resolutionKey } from './cache';
import { hasMessage, t as message, type MessageKey } from '$lib/i18n/messages';
import { blamedField, isUniqueRefusal, missingRecord, rowRefusal, type ApiFailure } from './errors';
import { ENTITY_SCOPES, isEntityScope, STILLS, type EntityScope } from './mapping';
import { slugOf } from './names';
import { createData, fromRow, readFields, updateData, uuidField, type Row } from './payload';
import { fieldName, type Resolution } from './schema';
import { loadResolution } from './setup';
import { capturedAtOf, decodeStillRemote, encodeStillRemote, stillDisplayName, stillFilename, stillPrefix, type StillRemote } from './stills';
import { completionInfo, isMultipart, partLink, UPLOAD_SIZES, URL_LIFE_MS, type UploadSizes } from './uploadPlan';

export type FptTransportOptions = FptOptions & {
	/**
	 * The FPT project this device syncs with. Every record is written into it. The app's project
	 * record stands for it: the transport never creates, renames or deletes a project.
	 */
	projectId: number;
	now?: () => number;
	/** The upload sizes. For tests: the storage floor is 5 MiB a part. */
	upload?: Partial<UploadSizes>;
};

const PROJECT = 'project';
const STILL = 'still';
const ATTACHMENT = 'Attachment';
const STILL_KEYS = ['takeId', 'capturedAt', 'caption'];

type Token = {
	ref: BlobRef;
	meta: StillRemote;
	takeType: string;
	field: string;
	filename: string;
	/** The init reply's `data`, whole: it is the `upload_info` of the completion. */
	info: Record<string, unknown>;
	completeUpload: string;
	multipart: boolean;
	/** Presigned URLs by part number, from 1. Never stored: they die in 15 minutes. */
	urls: Map<number, string>;
	/** The link that mints the URL of a part, by part number. */
	chain: Map<number, string>;
	sent: Set<number>;
};

type InitReply = { data: Record<string, unknown>; links: { upload: string; complete_upload: string; get_next_part?: string } };
type PartReply = { links: { upload: string; get_next_part?: string } };

type Denied = 'create' | 'update' | 'delete';

const groupBy =<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> => {
	const out = new Map<string, T[]>();
	for (const item of items) out.set(key(item), [...(out.get(key(item)) ?? []), item]);
	return out;
};
const text = (value: unknown): string | undefined => (typeof value === 'string' && value !== '' ? value : undefined);

export function createFptTransport(options: FptTransportOptions): Transport {
	const api = createApi(options);
	const now = options.now ?? Date.now;
	const sizes: UploadSizes = { ...UPLOAD_SIZES, ...options.upload };
	const { projectId } = options;
	let resolution: Resolution | undefined;

	/** The site's schema: from memory, the device, or the site. Throws `failed` while the site is not set up. */
	async function resolved(signal?: AbortSignal): Promise<Resolution> {
		resolution ??= await loadResolution(api, options, signal);
		return resolution;
	}

	/**
	 * Kinds of change the site refused for want of rights, as `<table>:<create|update|delete>`.
	 * Kept for the life of the transport: a new sign-in or a new link makes a new one.
	 */
	const forbidden = new Set<string>();

	/** Our table of an entity type the site named. */
	function tableOf(entityType: string): string | undefined {
		if (entityType === ATTACHMENT) return STILL;
		return resolution ? ENTITY_SCOPES.find((scope) => resolution!.entities[scope] === entityType) : undefined;
	}

	/** Why waiting changes are not sent: the account's rights. */
	function deniedText(table: string, action: Denied): string {
		const things = hasMessage(`sync.things.${table}`) ? message(`sync.things.${table}` as MessageKey) : table;
		return message(`sync.refused.${action}`, { things });
	}

	/** A field the site no longer has: the schema on the device is stale. The next call reads it again. */
	async function forget(): Promise<void> {
		resolution = undefined;
		await options.schemaCache.delete(resolutionKey(options.site.replace(/\/+$/, '')));
	}

	// ------------------------------------------------------------------ stills

	/**
	 * The Attachments of each still, newest first. A still is found by the file name it was uploaded
	 * under, which the server sets and nothing can change (entity_types/Attachment.md).
	 */
	async function attachmentsOf(stillIds: readonly string[], signal?: AbortSignal): Promise<Map<string, EntityRow[]>> {
		const out = new Map<string, EntityRow[]>();
		if (!stillIds.length) return out;
		const conditions = stillIds.map((id): Filter => ['filename', 'starts_with', stillPrefix(id)]);
		// `attachment_links` names the take the photo was uploaded to (findings/134).
		const rows = await api.search(ATTACHMENT, { logical_operator: 'or', conditions }, ['filename', 'display_name', 'description', 'attachment_links'], 500, signal);
		for (const id of stillIds) {
			const prefix = stillPrefix(id).toLowerCase();
			const mine = rows.filter((row) => String(row.attributes.filename ?? '').toLowerCase().startsWith(prefix)).sort((a, b) => b.id - a.id);
			if (mine.length) out.set(id, mine);
		}
		return out;
	}

	const stillsField = (res: Resolution) => fieldName(res, 'take', STILLS);

	/** The ids of the Attachments in the stills field of a take. */
	async function stillIds(res: Resolution, take: number, signal?: AbortSignal): Promise<number[]> {
		const [row] = await api.search(res.entities.take, ['id', 'is', take], [stillsField(res)], 1, signal);
		const links = (row?.relationships[stillsField(res)]?.data ?? []) as { id: number }[];
		return Array.isArray(links) ? links.map((link) => link.id) : [];
	}

	/**
	 * Adds Attachments to the stills field of a take, in place: a bare list would replace the
	 * field, and the mode must go in the body (corpus recipes/009_multi_entity_safely.md).
	 */
	async function link(res: Resolution, take: number, ids: readonly number[], signal?: AbortSignal): Promise<void> {
		const held = await stillIds(res, take, signal);
		const missing = [...new Set(ids)].filter((id) => !held.includes(id));
		if (!missing.length) return;
		const value = missing.map((id) => ({ type: ATTACHMENT, id }));
		await api.update(res.entities.take, take, { [stillsField(res)]: { multi_entity_update_mode: 'add', value } }, signal);
	}

	// ------------------------------------------------------------------ push

	type Planned = { refusals: Refusal[]; remoteIds: Record<string, RemoteId>; requests: BatchRequest[]; owners: PushOp[] };

	async function plan(ops: readonly PushOp[], signal?: AbortSignal): Promise<Planned> {
		const out: Planned = { refusals: [], remoteIds: {}, requests: [], owners: [] };
		const refuse = (o: PushOp, reason: Refusal['reason'], message?: string) => out.refusals.push({ entryId: o.entryId, reason, ...(message ? { message } : {}) });
		const request = (o: PushOp, r: BatchRequest) => {
			out.requests.push(r);
			out.owners.push(o);
		};
		const res = ops.some((o) => isEntityScope(o.op.table)) ? await resolved(signal) : undefined;
		const stills = ops.filter((o) => o.op.table === STILL && o.op.kind !== 'create').map((o) => o.op.recordId);
		const attachments = await attachmentsOf(stills, signal);

		for (const o of ops) {
			const op = o.op;
			// A kind of change the site refused for want of rights waits: the answer would be the same.
			if (forbidden.has(`${op.table}:${op.kind}`)) {
				refuse(o, 'invalid', deniedText(op.table, op.kind as Denied));
				continue;
			}
			if (op.table === PROJECT) {
				// The project is the one the transport was given. Nothing is sent for it.
				if (op.kind === 'create') out.remoteIds[o.entryId] = projectId;
				if (op.kind === 'update') refuse(o, 'invalid', 'A project is renamed in Flow Production Tracking, not here.');
			} else if (op.table === STILL) {
				if (op.kind === 'create') {
					// No Attachment exists before its file: the create sends nothing (stills.ts).
					const stray = Object.keys(op.fields).find((key) => !STILL_KEYS.includes(key));
					const take = typeof op.fields.takeId === 'string' ? o.links[op.fields.takeId] : undefined;
					if (stray) refuse(o, 'invalid', `still.${stray} has no field in Flow Production Tracking`);
					else if (typeof take !== 'number') refuse(o, 'invalid', 'still.takeId: the take is not on the server yet');
					else {
						const capturedAt = text(op.fields.capturedAt);
						const caption = text(op.fields.caption);
						out.remoteIds[o.entryId] = encodeStillRemote({ take, ...(capturedAt ? { capturedAt } : {}), ...(caption ? { caption } : {}) });
					}
					continue;
				}
				const found = attachments.get(op.recordId);
				if (!found) refuse(o, 'gone');
				else if (op.kind === 'delete') for (const row of found) request(o, { request_type: 'delete', entity: ATTACHMENT, record_id: row.id });
				else {
					const data: Record<string, unknown> = {};
					for (const [key, edit] of Object.entries(op.changes)) {
						if (key === 'caption') data.description = text(edit.value) ?? null;
						else if (key === 'capturedAt') data.display_name = stillDisplayName(text(edit.value));
						else return { ...out, refusals: [...out.refusals, { entryId: o.entryId, reason: 'invalid', message: `still.${key} cannot change on the server` }] };
					}
					request(o, { request_type: 'update', entity: ATTACHMENT, record_id: found[0].id, data });
				}
			} else if (isEntityScope(op.table) && res) {
				const entity = res.entities[op.table];
				if (op.kind === 'create') {
					const built = createData(res, op.table, op.recordId, op.fields, o.links, projectId);
					if (built.ok) request(o, { request_type: 'create', entity, data: built.data });
					else refuse(o, 'invalid', built.message);
				} else if (typeof o.remoteId !== 'number') refuse(o, 'invalid', `${op.table} ${op.recordId} has no server id`);
				else if (op.kind === 'delete') request(o, { request_type: 'delete', entity, record_id: o.remoteId });
				else {
					const built = updateData(res, op.table, op.changes, o.links, projectId);
					if (!built.ok) refuse(o, 'invalid', built.message);
					else if (Object.keys(built.data).length) request(o, { request_type: 'update', entity, record_id: o.remoteId, data: built.data });
				}
			} else refuse(o, 'invalid', `${op.table} is not a table Flow Production Tracking holds`);
		}
		return out;
	}

	/** What a refused batch means for its operations. Nothing landed (recipes/002). */
	async function refused(failure: ApiFailure, planned: Planned, signal?: AbortSignal): Promise<Refusal[]> {
		const { requests, owners } = planned;
		const named = (match: (r: BatchRequest) => boolean, reason: Refusal['reason'], message?: string): Refusal[] => {
			const hit = [...new Set(owners.filter((_, i) => match(requests[i])))];
			return hit.map((o) => ({ entryId: o.entryId, reason, ...(message ? { message } : {}) }));
		};

		if (isUniqueRefusal(failure)) {
			// The title names the field, not the request: look every create up, and the ones the
			// server has are the duplicates (corpus recipes/025_retry_safe_create.md).
			const creates = owners.filter((o, i) => requests[i].request_type === 'create' && isEntityScope(o.op.table));
			const found = new Set((await transport.lookup(creates.map((o) => ({ table: o.op.table, id: o.op.recordId })), signal)).map((f) => f.id));
			const duplicates = creates.filter((o) => found.has(o.op.recordId));
			if (duplicates.length) return duplicates.map((o) => ({ entryId: o.entryId, reason: 'duplicate' as const }));
			// Refused as not unique, and no live record holds the id. A deleted one does not hold it
			// (findings/136), so this is a site rule we do not know. One create can be named; several
			// cannot be told apart.
			return creates.length === 1 ? [{ entryId: creates[0].entryId, reason: 'invalid', message: failure.title }] : [];
		}

		// The account may not make this kind of change: 400 code 104 naming the type (findings/143).
		// Said once in plain words, and that kind is paused for the session (see `plan`).
		const denied = rowRefusal(failure);
		if (denied) {
			const table = tableOf(denied.entityType);
			if (table) {
				forbidden.add(`${table}:${denied.action}`);
				const hit = named((r) => r.request_type === denied.action && r.entity === denied.entityType, 'invalid', deniedText(table, denied.action));
				if (hit.length) return hit;
			}
		}

		const gone = missingRecord(failure);
		if (gone) {
			const hit = named((r) => r.request_type !== 'create' && r.entity === gone.entityType && r.record_id === gone.id, 'gone');
			if (hit.length) return hit;
		}

		// The site named a field it does not have: the schema kept on the device is stale.
		if (/does not exist or user does not have access/.test(failure.title)) await forget();
		const blamed = blamedField(failure);
		if (blamed) {
			const hit = named((r) => r.request_type !== 'delete' && r.entity === blamed.entityType && blamed.field in r.data, 'invalid', failure.title);
			if (hit.length) return hit;
		}
		// A refusal that names no operation. Every one of them is shown it, rather than none.
		return named(() => true, 'invalid', failure.title);
	}

	// ------------------------------------------------------------------ uploads

	const tokenOf = (session: UploadSession) => session.token as Token;
	const uploadPath = (t: Token) => `/api/v1/entity/${slugOf(t.takeType)}/${t.meta.take}/${t.field}/_upload`;

	/** Step one: the ticket (corpus endpoints/get_entity_type_id_field_upload.md, findings/044 for multipart). */
	async function begin(ref: BlobRef, signal?: AbortSignal): Promise<UploadSession> {
		const meta = ref.table === STILL ? decodeStillRemote(ref.recordRemoteId) : undefined;
		if (!meta) throw new TransportError('failed', `the file ${ref.blobId} has no still on a take the server holds`);
		const res = await resolved(signal);
		const multipart = isMultipart(ref.size, sizes);
		const t: Token = {
			ref,
			meta,
			takeType: res.entities.take,
			field: stillsField(res),
			filename: stillFilename(ref.recordId, ref.blobId, ref.type),
			info: {},
			completeUpload: '',
			multipart,
			urls: new Map(),
			chain: new Map(),
			sent: new Set()
		};
		let reply: InitReply;
		try {
			// `filename` is required. `multipart_upload=true` opens the multipart upload at once.
			reply = (await api.get(uploadPath(t), { filename: t.filename, ...(multipart ? { multipart_upload: 'true' } : {}) }, signal)) as InitReply;
		} catch (error) {
			if (error instanceof ApiRefusal) throw new TransportError('failed', error.failure.title);
			throw error;
		}
		t.info = reply.data;
		t.completeUpload = reply.links.complete_upload;
		t.urls.set(1, reply.links.upload);
		if (reply.links.get_next_part) t.chain.set(2, reply.links.get_next_part);
		// The URL is signed for 900 s from this call (corpus findings/125_upload_host_cors.md).
		return { token: t, expiresAt: now() + URL_LIFE_MS, ...(multipart ? { partSize: sizes.partSize } : {}) };
	}

	/** A fresh URL for part `n` of a multipart upload, by walking the chain (findings/044). */
	async function mint(t: Token, n: number, signal?: AbortSignal): Promise<string> {
		const any = t.chain.values().next().value;
		const path = t.chain.get(n) ?? (any ? partLink(any, n) : undefined);
		if (!path) throw new TransportError('expired', 'no link to mint an upload URL from');
		const reply = (await api.get(path, undefined, signal)) as PartReply;
		t.urls.set(n, reply.links.upload);
		if (reply.links.get_next_part) t.chain.set(n + 1, reply.links.get_next_part);
		return reply.links.upload;
	}

	/** Closes a multipart upload we give up on. Left open, it stays on storage and nothing lists it (findings/044). */
	async function abort(t: Token, signal?: AbortSignal): Promise<void> {
		if (!t.multipart) return;
		// The abort takes `upload_info` flat at the top level, not wrapped (findings/044).
		await api.post(`${uploadPath(t)}/multipart_abort`, t.info, signal).catch(() => undefined);
	}

	/** The Attachment rows uploaded under a file name, newest first. */
	const uploaded = (filename: string, signal?: AbortSignal) =>
		api.search(ATTACHMENT, ['filename', 'is', filename], ['filename', 'description', 'this_file'], 50, signal).then((rows) => rows.sort((a, b) => b.id - a.id));

	async function caption(row: EntityRow, meta: StillRemote, signal?: AbortSignal): Promise<void> {
		if (meta.caption && !text(row.attributes.description)) await api.update(ATTACHMENT, row.id, { description: meta.caption }, signal);
	}

	// ------------------------------------------------------------------ the transport

	const transport: Transport = {
		async push(ops: PushOp[], signal?: AbortSignal): Promise<PushResult> {
			const planned = await plan(ops, signal);
			if (planned.refusals.length) return { outcome: 'refused', refusals: planned.refusals };
			if (!planned.requests.length) return { outcome: 'applied', remoteIds: planned.remoteIds };
			let rows;
			try {
				rows = await api.batch(planned.requests, signal);
			} catch (error) {
				if (!(error instanceof ApiRefusal)) throw error;
				return { outcome: 'refused', refusals: await refused(error.failure, planned, signal) };
			}
			// One row per request, in request order: paired by position (recipes/002).
			rows.forEach((row, i) => {
				const owner = planned.owners[i];
				if (owner?.op.kind === 'create' && row.request_type === 'create') planned.remoteIds[owner.entryId] = row.data.id;
			});
			return { outcome: 'applied', remoteIds: planned.remoteIds };
		},

		async lookup(refs: RecordRef[], signal?: AbortSignal): Promise<Found[]> {
			const found: Found[] = [];
			for (const [table, group] of groupBy(refs, (r) => r.table)) {
				if (table === PROJECT) found.push(...group.map((r) => ({ ...r, remoteId: projectId })));
				else if (table === STILL) {
					const res = await resolved(signal);
					const attachments = await attachmentsOf(group.map((r) => r.id), signal);
					const newest = [...attachments].map(([id, rows]) => ({ id, row: rows[0] }));
					// The take each Attachment hangs on: the remote id of a still names its take. The upload
					// lists the take in the Attachment's `attachment_links` (findings/134): no second search.
					for (const { id, row } of newest) {
						const links = (row.relationships.attachment_links?.data ?? []) as { type?: string; id: number }[];
						const take = Array.isArray(links) ? links.find((l) => l.type === res.entities.take) : undefined;
						if (!take) continue;
						const capturedAt = capturedAtOf(row.attributes.display_name);
						const description = text(row.attributes.description);
						const remoteId = encodeStillRemote({ take: take.id, ...(capturedAt ? { capturedAt } : {}), ...(description ? { caption: description } : {}) });
						found.push({ table, id, remoteId });
					}
				} else if (isEntityScope(table)) {
					const res = await resolved(signal);
					const field = uuidField(res, table);
					// `is` and `in` on text ignore case, as the unique check does (findings/127, field_types/text.md).
					const rows = await api.search(res.entities[table], [field, 'in', group.map((r) => r.id)], [field], group.length + 5, signal);
					for (const r of group) {
						const row = rows.find((x) => String(x.attributes[field] ?? '').trim().toLowerCase() === r.id.toLowerCase());
						if (row) found.push({ ...r, remoteId: row.id });
					}
				}
			}
			return found;
		},

		async read(requests: ReadRequest[], signal?: AbortSignal): Promise<ServerRecord[]> {
			const records: ServerRecord[] = [];
			for (const [table, group] of groupBy(requests, (r) => r.table)) {
				if (table === PROJECT) {
					const [row] = await api.search('Project', ['id', 'is', projectId], ['name'], 1, signal);
					const name = text(row?.attributes.name);
					if (row) records.push(...group.map((r) => ({ table, id: r.id, remoteId: projectId, fields: name && r.keys.includes('name') ? { name } : {} })));
				} else if (table === STILL) {
					const attachments = await attachmentsOf(group.map((r) => r.id), signal);
					for (const r of group) {
						const row = attachments.get(r.id)?.[0];
						if (!row) continue;
						const fields: Record<string, unknown> = {};
						const description = text(row.attributes.description);
						const capturedAt = capturedAtOf(row.attributes.display_name);
						if (r.keys.includes('caption') && description) fields.caption = description;
						if (r.keys.includes('capturedAt') && capturedAt) fields.capturedAt = capturedAt;
						records.push({ table, id: r.id, remoteId: r.remoteId ?? row.id, fields });
					}
				} else if (isEntityScope(table)) {
					const res = await resolved(signal);
					const scope: EntityScope = table;
					const uuid = uuidField(res, scope);
					const byId = group.filter((r) => typeof r.remoteId === 'number');
					const byUuid = group.filter((r) => typeof r.remoteId !== 'number');
					const conditions: Filter[] = [];
					if (byId.length) conditions.push(['id', 'in', byId.map((r) => r.remoteId)]);
					if (byUuid.length) conditions.push([uuid, 'in', byUuid.map((r) => r.id)]);
					const fields = [uuid, ...readFields(res, scope, [...new Set(group.flatMap((r) => r.keys))])];
					// A retired row is not returned by a search: a record the server no longer has is left out.
					const rows = await api.search(res.entities[scope], { logical_operator: 'or', conditions }, [...new Set(fields)], group.length + 5, signal);
					for (const r of group) {
						const row = rows.find((x) =>
							typeof r.remoteId === 'number' ? x.id === r.remoteId : String(x.attributes[uuid] ?? '').trim().toLowerCase() === r.id.toLowerCase()
						);
						if (row) records.push({ table, id: r.id, remoteId: row.id, fields: fromRow(res, scope, row as Row, r.keys) });
					}
				}
			}
			return records;
		},

		beginUpload: (blob: BlobRef, signal?: AbortSignal) => begin(blob, signal),

		async renewUpload(session: UploadSession, signal?: AbortSignal): Promise<UploadSession> {
			const t = tokenOf(session);
			// One PUT holds the whole file: a fresh ticket is the whole renewal.
			if (!t.multipart) return begin(t.ref, signal);
			// The parts sent stay on storage under the upload id. Only the URLs die.
			t.urls.clear();
			const next = t.sent.size ? Math.max(...t.sent) + 1 : 1;
			try {
				await mint(t, next, signal);
			} catch (error) {
				if (!(error instanceof ApiRefusal)) throw error;
				// The upload cannot be continued: close it, and the runner starts again from part one.
				await abort(t, signal);
				throw new TransportError('expired', error.failure.title);
			}
			return { ...session, expiresAt: now() + URL_LIFE_MS };
		},

		async uploadPart(session: UploadSession, part: { index: number; data: Blob }, signal?: AbortSignal): Promise<SentPart> {
			const t = tokenOf(session);
			const n = part.index + 1;
			let url = t.urls.get(n);
			if (!url && t.multipart) {
				try {
					// Minted when the bytes are ready to go, not before: it is good for 15 minutes (findings/125).
					url = await mint(t, n, signal);
				} catch (error) {
					if (error instanceof ApiRefusal) throw new TransportError('expired', error.failure.title);
					throw error;
				}
			}
			if (!url) throw new TransportError('expired', 'the upload has no URL for this part');
			// A single PUT sets the stored file's type: the photo's own, not `binary/octet-stream`
			// (findings/141). Whether a part's header sets anything is unmeasured: a part sends none,
			// as the runner's slices always did, and a multipart file may be served untyped.
			const etag = await api.putBytes(url, part.data, signal, t.multipart ? '' : t.ref.type || part.data.type);
			// The completion of a multipart upload needs the ETag of every part (findings/044).
			if (t.multipart && !etag) throw new TransportError('failed', 'storage answered no ETag');
			t.sent.add(n);
			return { index: part.index, ...(etag ? { etag } : {}) };
		},

		async finishUpload(session: UploadSession, parts: SentPart[], signal?: AbortSignal): Promise<{ remoteId?: RemoteId }> {
			const t = tokenOf(session);
			let info: Record<string, unknown>;
			try {
				info = completionInfo(t.info, parts);
			} catch (error) {
				throw new TransportError('failed', error instanceof Error ? error.message : 'bad parts');
			}
			try {
				// `upload_info` is the init reply verbatim; `upload_data` is required, and sets the display name.
				await api.post(t.completeUpload, { upload_info: info, upload_data: { display_name: stillDisplayName(t.meta.capturedAt) } }, signal);
			} catch (error) {
				if (!(error instanceof ApiRefusal)) throw error;
				await abort(t, signal);
				throw new TransportError('failed', error.failure.title);
			}
			// The completion landed. Its answer is one space and names no row (findings/039), so the row
			// is found by its file name. The upload to the field added the photo to it, beside the
			// earlier ones, and gave it the take's project (findings/134): nothing to put back. What
			// follows is best effort: `verifyUpload` does it again.
			try {
				const [row] = await uploaded(t.filename, signal);
				if (!row) return {};
				await caption(row, t.meta, signal);
				return { remoteId: row.id };
			} catch {
				return {};
			}
		},

		async verifyUpload(blob: BlobRef, _remoteId?: RemoteId, signal?: AbortSignal): Promise<{ verified: boolean; remoteId?: RemoteId }> {
			const meta = blob.table === STILL ? decodeStillRemote(blob.recordRemoteId) : undefined;
			if (!meta) return { verified: false };
			const res = await resolved(signal);
			for (const row of await uploaded(stillFilename(blob.recordId, blob.blobId, blob.type), signal)) {
				// The url is presigned and re-minted on every read: used once, never kept (field_types/url.md).
				const url = (row.attributes.this_file as { url?: unknown } | null)?.url;
				if (typeof url !== 'string') continue;
				const size = await api.fileSize(url, signal);
				if (size === 'missing') {
					// A row over bytes that never arrived (findings/039). It cannot be repaired: `this_file`
					// is create-only (entity_types/Attachment.md). Removed, so the next upload is the only one.
					await api.remove(ATTACHMENT, row.id, signal).catch(() => undefined);
					continue;
				}
				if (size !== blob.size) continue;
				await link(res, meta.take, [row.id], signal);
				await caption(row, meta, signal);
				return { verified: true, remoteId: row.id };
			}
			return { verified: false };
		}
	};
	return transport;
}

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
import { DIAGRAM_SHOWN, diagramFilename, diagramPrefix } from './diagrams';
import { DIAGRAMS, ENTITY_SCOPES, isRecordScope, SET_SHOT_KEY, SET_SHOT_MATCHED, SET_SHOT_SHOTS, SET_SHOTS, SHOTS, STILLS, REFERENCE_SLATES, type RecordScope } from './mapping';
import { referenceSlatesWrite, type ReferenceSlates } from './referenceSlates';
import { slugOf } from './names';
import { createData, fromRow, readFields, updateData, uuidField, type Row } from './payload';
import { fieldName, type Resolution } from './schema';
import { loadResolution } from './setup';
import { keyCode, linkIdsOf, matches, missingCodes, setShotData, setShotFilter, setShotKey, setShotsOf, severalCodes, slateWrites, toMatch, type SetShotRow } from './setShots';
import { codesOf, linkValue, SHOT, shotChange, shotCodes, shotFilter, shotsOf, type ShotRow } from './shots';
import { capturedAtOf, decodeStillRemote, encodeStillRemote, stillDisplayName, stillFilename, stillPrefix, variantOf, type StillRemote } from './stills';
import { takeVersions, type UploadTarget } from './takeVersions';
import { completionInfo, isMultipart, partLink, UPLOAD_SIZES, URL_LIFE_MS, type UploadSizes } from './uploadPlan';
import { capturedAtOfCode, retimedCode, VERSION, versionKind, type TakeMedia } from './versions';

/** One slate Flow PT holds, and the VFX shot codes it holds now. */
export type SlateCodes = { slate: string; remoteId: number; codes: readonly string[] };

/**
 * What a sync of links read of one slate: its codes whose Set Shot holds more than one Shot of
 * that code, for someone to clean up (Kevin, #96). Read at each sync, never kept.
 */
export type ShotResult = { slate: string; several: string[] };

export type FptTransportOptions = FptOptions & {
	/**
	 * The FPT project this device syncs with. Every record is written into it. The app's project
	 * record stands for it: the transport never creates, renames or deletes a project.
	 */
	projectId: number;
	now?: () => number;
	/** The upload sizes. For tests: the storage floor is 5 MiB a part. */
	upload?: Partial<UploadSizes>;
	/** Told, once a push has linked the slates whose codes it touched, what it read of them. */
	onShots?: (results: ShotResult[]) => unknown;
};

/** The transport, and the links of records the server already holds. */
export interface FptTransport extends Transport {
	/**
	 * Brings these slates' Set Shots and Shots in line with their codes. Never throws. Undefined when
	 * the site could not be asked or has no Set Shot: the links wait.
	 */
	linkShots(slates: SlateCodes[], signal?: AbortSignal): Promise<ShotResult[] | undefined>;
	/**
	 * Sets the Slates field of these set references to the slates each shows on, where it differs
	 * (#107, referenceSlates.ts). Never throws. Answers the references whose write did not land;
	 * undefined when the site could not be asked.
	 */
	linkReferenceSlates(items: readonly ReferenceSlates[], signal?: AbortSignal): Promise<string[] | undefined>;
}

/**
 * The codes of the Shots of an FPT project, each once, in order: what the slate's VFX shots field
 * suggests. Every page is read. Throws a `TransportError` when the site cannot be asked.
 */
export async function readShotCodes(options: FptOptions, projectId: number, signal?: AbortSignal): Promise<string[]> {
	const api = createApi(options);
	// Shot reads are not scoped by the endpoint: the project filter is ours (entity_types/Shot.md).
	return codesOf(await api.searchAll(SHOT, ['project', 'is', { type: 'Project', id: projectId }], ['code'], signal));
}

const PROJECT = 'project';
const STILL = 'still';
const ATTACHMENT = 'Attachment';
const STILL_KEYS = ['takeId', 'capturedAt', 'caption'];

type Token = {
	ref: BlobRef;
	/** A still's: what its Attachment needs. None for a slate's setup diagram. */
	meta?: StillRemote;
	/** Where the file goes: the take's photos field, or a Version's movie field. */
	target: UploadTarget;
	/** The Version the file goes on, for a video (versions.ts). */
	version?: number;
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

export function createFptTransport(options: FptTransportOptions): FptTransport {
	const api = createApi(options);
	const now = options.now ?? Date.now;
	const sizes: UploadSizes = { ...UPLOAD_SIZES, ...options.upload };
	const { projectId } = options;
	const versions = takeVersions(api, projectId);
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
		// A photo is an Attachment, a video a Version (versions.ts): both are stills on the device.
		if (entityType === ATTACHMENT || entityType === VERSION) return STILL;
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

	/**
	 * A photo drawn on again has several annotated copies on Flow PT: one per drawing sent. The take
	 * shows only the newest, the one uploaded last; the older ones leave its photos field and stay
	 * as Attachments (an Artist may not delete one, findings/143). Add and remove go in one batch,
	 * in order, the mode in the body (recipes/009, findings/154): the field never shows none or two.
	 */
	async function keepNewestCopy(res: Resolution, take: number, stillId: string, signal?: AbortSignal): Promise<void> {
		const copies = ((await attachmentsOf([stillId], signal)).get(stillId) ?? []).filter((row) => variantOf(row.attributes.filename) === 'annotated');
		await keepNewest(res.entities.take, take, stillsField(res), copies, signal);
	}

	/**
	 * Of `rows` (Attachments of one family, newest first), only the newest in `field` of the record:
	 * the older ones leave it, and the newest goes in if it is missing. One batch, in order.
	 */
	async function keepNewest(entity: string, id: number, field: string, rows: readonly EntityRow[], signal?: AbortSignal): Promise<void> {
		const [newest, ...older] = rows;
		if (!newest) return;
		const [row] = await api.search(entity, ['id', 'is', id], [field], 1, signal);
		const links = (row?.relationships[field]?.data ?? []) as { id: number }[];
		const held = Array.isArray(links) ? links.map((link) => link.id) : [];
		const edit = (mode: 'add' | 'remove', ids: number[]): BatchRequest => ({
			request_type: 'update',
			entity,
			record_id: id,
			data: { [field]: { multi_entity_update_mode: mode, value: ids.map((x) => ({ type: ATTACHMENT, id: x })) } }
		});
		const stale = older.filter((r) => held.includes(r.id)).map((r) => r.id);
		const requests = [...(held.includes(newest.id) ? [] : [edit('add', [newest.id])]), ...(stale.length ? [edit('remove', stale)] : [])];
		if (requests.length) await api.batch(requests, signal);
	}

	/** The Attachments whose file name starts with `prefix`, newest first. */
	async function family(prefix: string, signal?: AbortSignal): Promise<EntityRow[]> {
		const rows = await api.search(ATTACHMENT, ['filename', 'starts_with', prefix], ['filename'], 500, signal);
		return rows.filter((r) => String(r.attributes.filename ?? '').toLowerCase().startsWith(prefix)).sort((a, b) => b.id - a.id);
	}

	const diagramsField = (res: Resolution) => fieldName(res, 'slate', DIAGRAMS);

	/** A still's file the app made: its annotated copy. */
	const stillVariant = (ref: Pick<BlobRef, 'variant'>) => (ref.variant === 'annotated' ? ref.variant : undefined);

	/** The slate's server id, for a slate's setup diagram image (#87). */
	const diagramSlate = (ref: BlobRef): number | undefined => (ref.table === 'slate' && ref.variant === 'diagram' && typeof ref.recordRemoteId === 'number' ? ref.recordRemoteId : undefined);

	// ------------------------------------------------------------------ shots

	/** Tells the app what the links of the slates of a push read. */
	async function tell(results: ShotResult[]): Promise<void> {
		if (!results.length || !options.onShots) return;
		try {
			await options.onShots(results);
		} catch {
			// The links are on the server; a word the app could not keep changes nothing there.
		}
	}

	type SetShotFields = { type: string; key: string; shots: string; matched: string };

	/** The Set Shots of these codes, by key, in the project. */
	async function readSetShots(f: SetShotFields, codes: readonly string[], signal?: AbortSignal): Promise<SetShotRow[]> {
		if (!codes.length) return [];
		return setShotsOf(await api.searchAll(f.type, setShotFilter(projectId, f.key, codes), [f.key, 'code', f.shots, f.matched], signal), f);
	}

	/**
	 * Files each code as a new Set Shot, in one `_batch`, with the project and the key. The key is
	 * unique: if another device filed one of the codes since the lookup, the batch is refused whole
	 * (findings/127, recipes/002); a batch with no answer may have landed (findings/127). Either way
	 * the codes are looked up again, never sent blind. What is still missing is filed at a later
	 * sync. Never throws.
	 */
	async function fileSetShots(f: SetShotFields, codes: readonly string[], signal?: AbortSignal): Promise<SetShotRow[]> {
		if (!codes.length) return [];
		const requests: BatchRequest[] = codes.map((code) => ({ request_type: 'create', entity: f.type, data: setShotData(projectId, code, f.key) }));
		try {
			const rows = await api.batch(requests, signal);
			// One row per request, in request order (recipes/002).
			return rows.flatMap((row, i) => (row.request_type === 'create' ? [{ id: row.data.id, key: setShotKey(projectId, codes[i]), code: codes[i].trim(), shots: [], matched: false }] : []));
		} catch {
			return readSetShots(f, codes, signal).catch(() => []);
		}
	}

	/**
	 * Matches the Set Shots never matched that hold no Shot: one search for the Shots of their codes,
	 * then per Set Shot one `_batch` that adds the Shots and ticks the flag, in that order, together
	 * or not at all (findings/154). A Set Shot no Shot has the code of is tried at the next sync.
	 * Never throws: what did not land is tried again.
	 */
	async function matchSetShots(f: SetShotFields, setShots: SetShotRow[], signal?: AbortSignal): Promise<SetShotRow[]> {
		const candidates = toMatch(setShots);
		if (!candidates.length) return setShots;
		let shots: ShotRow[];
		try {
			shots = shotsOf(await api.searchAll(SHOT, shotFilter(projectId, candidates.map((c) => keyCode(c.key))), ['code'], signal));
		} catch {
			return setShots;
		}
		const made = new Map<number, ShotRow[]>();
		for (const match of matches(candidates, shots)) {
			try {
				await api.batch(
					[
						{ request_type: 'update', entity: f.type, record_id: match.id, data: { [f.shots]: linkValue('add', match.shots.map((s) => s.id)) } },
						{ request_type: 'update', entity: f.type, record_id: match.id, data: { [f.matched]: true } }
					],
					signal
				);
				made.set(match.id, match.shots);
			} catch {
				// Read again at the next sync: landed or not, it is matched once.
			}
		}
		return setShots.map((s) => (made.has(s.id) ? { ...s, shots: made.get(s.id)!, matched: true } : s));
	}

	/** The Set Shots and Shots each slate holds on Flow PT now, by its id. A slate Flow PT lacks is left out. */
	async function slateLinks(res: Resolution, ids: readonly number[], signal?: AbortSignal): Promise<Map<number, { setShots: number[]; shots: number[] }>> {
		const setShotsField = fieldName(res, 'slate', SET_SHOTS);
		const shotsField = fieldName(res, 'slate', SHOTS);
		const out = new Map<number, { setShots: number[]; shots: number[] }>();
		for (let i = 0; i < ids.length; i += 500) {
			const rows = await api.searchAll(res.entities.slate, ['id', 'in', ids.slice(i, i + 500)], [setShotsField, shotsField], signal);
			for (const row of rows) out.set(row.id, { setShots: linkIdsOf(row, setShotsField), shots: linkIdsOf(row, shotsField) });
		}
		return out;
	}

	/**
	 * Brings each slate's Set Shots and Shots in line with its codes (setShots.ts):
	 * 1. Reads what the slates link now, and the Set Shots of their codes, by key.
	 * 2. Files every code that has no Set Shot, in one batch. Never two for a code.
	 * 3. Matches the Set Shots never matched that hold no Shot (`matchSetShots`).
	 * 4. Per slate, sets each field that differs: its Set Shots are those of its codes, its Shots
	 *    those of its Set Shots. One `PUT` a field, the mode in the body (recipes/009). The mode
	 *    works in a `_batch` update too (findings/154); kept apart, a refused field does not hold
	 *    back the other. Two fields with the mode in one `PUT` are not measured.
	 * Nothing is kept on the device: what did not land is worked out again at the next sync. Never
	 * throws. Undefined when the site could not be asked, or has no Set Shot: then the links wait,
	 * and the codes on the slates say what they will be (Kevin, #117). A Shot is never created or
	 * changed; a Set Shot is never deleted.
	 */
	async function writeShots(slates: readonly SlateCodes[], signal?: AbortSignal): Promise<ShotResult[] | undefined> {
		if (!slates.length) return [];
		let res: Resolution;
		try {
			res = await resolved(signal);
		} catch {
			return undefined;
		}
		const type = res.entities.setShot;
		// An optional entity is in the resolution only with all its fields and the slate's link to it (schema.ts).
		if (!type) return undefined;
		const f: SetShotFields = {
			type,
			key: fieldName(res, 'setShot', SET_SHOT_KEY),
			shots: fieldName(res, 'setShot', SET_SHOT_SHOTS),
			matched: fieldName(res, 'setShot', SET_SHOT_MATCHED)
		};
		const codes = shotCodes(slates.flatMap((s) => s.codes));
		let current: Map<number, { setShots: number[]; shots: number[] }>;
		let setShots: SetShotRow[];
		try {
			current = await slateLinks(res, slates.map((s) => s.remoteId), signal);
			setShots = await readSetShots(f, codes, signal);
		} catch {
			return undefined;
		}
		setShots = [...setShots, ...(await fileSetShots(f, missingCodes(projectId, codes, setShots), signal))];
		setShots = await matchSetShots(f, setShots, signal);

		let reachable = true;
		/** One PUT. No answer, or no session: the rest would fare the same. A refusal is this slate's alone. */
		const write = async (id: number, field: string, value: unknown): Promise<void> => {
			if (!reachable) return;
			try {
				await api.update(res.entities.slate, id, { [field]: value }, signal);
			} catch (error) {
				if (error instanceof TransportError && error.kind !== 'failed') reachable = false;
			}
		};
		const out: ShotResult[] = [];
		for (const slate of slates) {
			const now = current.get(slate.remoteId);
			if (!now) continue;
			const writes = slateWrites(projectId, slate.codes, now, setShots);
			if (writes.setShots) await write(slate.remoteId, fieldName(res, 'slate', SET_SHOTS), linkValue('set', writes.setShots, type));
			if (writes.shots) await write(slate.remoteId, fieldName(res, 'slate', SHOTS), linkValue('set', writes.shots));
			out.push({ slate: slate.slate, several: severalCodes(projectId, slate.codes, setShots) });
		}
		return out;
	}

	// ------------------------------------------------------------------ the slates of a set reference

	/**
	 * Sets each set reference's Slates field to the slates it shows on (#107, referenceSlates.ts):
	 * reads what the rows hold now, then one `PUT` in `set` mode, the mode in the body
	 * (recipes/009), for each that differs. A slate linked by hand in Flow PT is overwritten, as on
	 * a slate's Shots (Kevin, #102). Nothing is kept on the device: what did not land is worked out
	 * again at the next sync. A refusal is that reference's alone; no answer stops the rest.
	 */
	async function writeReferenceSlates(items: readonly ReferenceSlates[], signal?: AbortSignal): Promise<string[] | undefined> {
		if (!items.length) return [];
		let res: Resolution;
		const current = new Map<number, number[]>();
		try {
			res = await resolved(signal);
			const field = fieldName(res, 'reference', REFERENCE_SLATES);
			const ids = items.map((i) => i.remoteId);
			for (let i = 0; i < ids.length; i += 500) {
				const rows = await api.searchAll(res.entities.reference, ['id', 'in', ids.slice(i, i + 500)], [field], signal);
				for (const row of rows) current.set(row.id, linkIdsOf(row, field));
			}
		} catch {
			return undefined;
		}
		const field = fieldName(res, 'reference', REFERENCE_SLATES);
		const failed: string[] = [];
		let reachable = true;
		for (const item of items) {
			const now = current.get(item.remoteId);
			// A row Flow PT no longer has: its delete is the outbox's business.
			if (!now) continue;
			const slates = referenceSlatesWrite(item.slates, now);
			if (!slates) continue;
			if (!reachable) {
				failed.push(item.reference);
				continue;
			}
			try {
				await api.update(res.entities.reference, item.remoteId, { [field]: linkValue('set', slates, res.entities.slate) }, signal);
			} catch (error) {
				// No answer, or no session: the rest would fare the same.
				if (error instanceof TransportError && error.kind !== 'failed') reachable = false;
				failed.push(item.reference);
			}
		}
		return failed;
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
		const stills = ops.filter((o) => o.op.table === STILL && o.op.kind !== 'create').map((o) => o.op.recordId);
		const res = ops.some((o) => isRecordScope(o.op.table)) || stills.length ? await resolved(signal) : undefined;
		const attachments = await attachmentsOf(stills, signal);
		// A still with no Attachment may be a video: its Version, by client UUID (versions.ts).
		const videos = res ? await versions.find(res, stills.filter((id) => !attachments.has(id)), signal) : new Map<string, EntityRow>();

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
				const video = videos.get(op.recordId);
				if (!found && video) {
					// A video: its Version. The movie and the server's transcodes are the Version's own.
					if (op.kind === 'delete') request(o, { request_type: 'delete', entity: VERSION, record_id: video.id });
					else {
						const data: Record<string, unknown> = {};
						for (const [key, edit] of Object.entries(op.changes)) {
							if (key === 'caption') data.description = text(edit.value) ?? null;
							else if (key === 'capturedAt') data.code = retimedCode(video.attributes.code, text(edit.value));
							else return { ...out, refusals: [...out.refusals, { entryId: o.entryId, reason: 'invalid', message: `still.${key} cannot change on the server` }] };
						}
						request(o, { request_type: 'update', entity: VERSION, record_id: video.id, data });
					}
				} else if (!found) refuse(o, 'gone');
				else if (op.kind === 'delete') for (const row of found) request(o, { request_type: 'delete', entity: ATTACHMENT, record_id: row.id });
				else {
					const stray = Object.keys(op.changes).find((key) => key !== 'caption' && key !== 'capturedAt');
					if (stray) return { ...out, refusals: [...out.refusals, { entryId: o.entryId, reason: 'invalid', message: `still.${stray} cannot change on the server` }] };
					// Every file of the still: the photo and its annotated copy, each keeping its own name.
					for (const row of found) {
						const data: Record<string, unknown> = {};
						for (const [key, edit] of Object.entries(op.changes)) {
							if (key === 'caption') data.description = text(edit.value) ?? null;
							else data.display_name = stillDisplayName(text(edit.value), variantOf(row.attributes.filename));
						}
						request(o, { request_type: 'update', entity: ATTACHMENT, record_id: row.id, data });
					}
				}
			} else if (isRecordScope(op.table) && res) {
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
			const creates = owners.filter((o, i) => requests[i].request_type === 'create' && isRecordScope(o.op.table));
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
	const uploadPath = (t: Token) => `/api/v1/entity/${slugOf(t.target.entityType)}/${t.target.id}/${t.target.field}/_upload`;

	/** A still's file as a take's media: what its Version needs (versions.ts). */
	const mediaOf = (ref: Pick<BlobRef, 'recordId' | 'blobId' | 'type'>, meta: StillRemote): TakeMedia => ({
		recordId: ref.recordId,
		blobId: ref.blobId,
		type: ref.type,
		take: meta.take,
		...(meta.capturedAt ? { capturedAt: meta.capturedAt } : {}),
		...(meta.caption ? { caption: meta.caption } : {})
	});

	/**
	 * Step one: the ticket (corpus endpoints/get_entity_type_id_field_upload.md, findings/044 for
	 * multipart). A photo goes to the take's photos field. A video goes to its Version's movie
	 * field: the Version is found by client UUID or made first (takeVersions.ts).
	 */
	async function begin(ref: BlobRef, signal?: AbortSignal): Promise<UploadSession> {
		const diagram = diagramSlate(ref);
		const meta = ref.table === STILL ? decodeStillRemote(ref.recordRemoteId) : undefined;
		if (!meta && diagram === undefined) throw new TransportError('failed', `the file ${ref.blobId} has no still on a take, nor a slate, the server holds`);
		const res = await resolved(signal);
		const multipart = isMultipart(ref.size, sizes);
		let target: UploadTarget = meta
			? { entityType: res.entities.take, id: meta.take, field: stillsField(res), filename: stillFilename(ref.recordId, ref.blobId, ref.type, stillVariant(ref)) }
			: { entityType: res.entities.slate, id: diagram!, field: diagramsField(res), filename: diagramFilename(ref.recordId, ref.blobId) };
		let version: number | undefined;
		if (meta && versionKind(ref.type)) {
			const media = mediaOf(ref, meta);
			version = await versions.ensure(res, media, signal);
			target = versions.target(version, media);
		}
		const t: Token = {
			ref,
			meta,
			target,
			...(version !== undefined ? { version } : {}),
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
			reply = (await api.get(uploadPath(t), { filename: t.target.filename, ...(multipart ? { multipart_upload: 'true' } : {}) }, signal)) as InitReply;
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

	const transport: FptTransport = {
		linkShots: (items, signal) => writeShots(items, signal),
		linkReferenceSlates: (items, signal) => writeReferenceSlates(items, signal),

		async push(ops: PushOp[], signal?: AbortSignal): Promise<PushResult> {
			const planned = await plan(ops, signal);
			if (planned.refusals.length) return { outcome: 'refused', refusals: planned.refusals };
			if (!planned.requests.length) return { outcome: 'applied', remoteIds: planned.remoteIds };
			// The slates whose codes change: their links follow once the batch has landed.
			const touched = [...new Set(planned.owners)].flatMap((o) => {
				const codes = shotChange(o.op);
				return codes ? [{ owner: o, codes }] : [];
			});
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
			const slates = touched.flatMap(({ owner, codes }) => {
				const remoteId = owner.op.kind === 'create' ? planned.remoteIds[owner.entryId] : owner.remoteId;
				return typeof remoteId === 'number' ? [{ slate: owner.op.recordId, remoteId, codes }] : [];
			});
			if (slates.length) {
				const results = await writeShots(slates, signal);
				if (results) await tell(results);
			}
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
					// The rest may be videos: each a Version, linked to its take by `entity` (versions.ts).
					const rest = group.map((r) => r.id).filter((id) => !attachments.has(id));
					for (const [id, row] of await versions.find(res, rest, signal)) {
						const take = row.relationships.entity?.data as { type?: string; id: number } | null | undefined;
						if (!take || take.type !== res.entities.take) continue;
						const capturedAt = capturedAtOfCode(row.attributes.code);
						const description = text(row.attributes.description);
						found.push({ table, id, remoteId: encodeStillRemote({ take: take.id, ...(capturedAt ? { capturedAt } : {}), ...(description ? { caption: description } : {}) }) });
					}
				} else if (isRecordScope(table)) {
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
					// A still with no Attachment may be a video: its Version (versions.ts).
					const rest = group.map((r) => r.id).filter((id) => !attachments.has(id));
					const videos = rest.length ? await versions.find(await resolved(signal), rest, signal) : new Map<string, EntityRow>();
					for (const r of group) {
						const row = attachments.get(r.id)?.[0];
						const video = videos.get(r.id);
						if (!row && !video) continue;
						const fields: Record<string, unknown> = {};
						const description = text((row ?? video)!.attributes.description);
						const capturedAt = row ? capturedAtOf(row.attributes.display_name) : capturedAtOfCode(video!.attributes.code);
						if (r.keys.includes('caption') && description) fields.caption = description;
						if (r.keys.includes('capturedAt') && capturedAt) fields.capturedAt = capturedAt;
						records.push({ table, id: r.id, remoteId: r.remoteId ?? (row ?? video)!.id, fields });
					}
				} else if (isRecordScope(table)) {
					const res = await resolved(signal);
					const scope: RecordScope = table;
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
			// `upload_info` is the init reply verbatim; `upload_data` is required. For a photo it sets the
			// display name; a Version's movie takes it empty, as measured (findings/013, 022).
			const data = t.version !== undefined ? {} : { display_name: t.meta ? stillDisplayName(t.meta.capturedAt, stillVariant(t.ref)) : DIAGRAM_SHOWN };
			try {
				await api.post(t.completeUpload, { upload_info: info, upload_data: data }, signal);
			} catch (error) {
				if (!(error instanceof ApiRefusal)) throw error;
				await abort(t, signal);
				throw new TransportError('failed', error.failure.title);
			}
			// A video: the file is in its Version's movie field, and the Version is the id kept.
			if (t.version !== undefined) return { remoteId: t.version };
			// The completion landed. Its answer is one space and names no row (findings/039), so the row
			// is found by its file name. The upload to the field added the photo to it, beside the
			// earlier ones, and gave it the take's project (findings/134): nothing to put back. What
			// follows is best effort: `verifyUpload` does it again.
			try {
				const [row] = await uploaded(t.target.filename, signal);
				if (!row) return {};
				if (t.meta) await caption(row, t.meta, signal);
				return { remoteId: row.id };
			} catch {
				return {};
			}
		},

		async verifyUpload(blob: BlobRef, _remoteId?: RemoteId, signal?: AbortSignal): Promise<{ verified: boolean; remoteId?: RemoteId }> {
			const diagram = diagramSlate(blob);
			const meta = blob.table === STILL ? decodeStillRemote(blob.recordRemoteId) : undefined;
			if (!meta && diagram === undefined) return { verified: false };
			const res = await resolved(signal);
			if (meta && versionKind(blob.type)) return versions.verify(res, mediaOf(blob, meta), blob.size, signal);
			const filename = meta ? stillFilename(blob.recordId, blob.blobId, blob.type, stillVariant(blob)) : diagramFilename(blob.recordId, blob.blobId);
			for (const row of await uploaded(filename, signal)) {
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
				// A slate's diagram, an annotated copy: the record shows the newest one only. A photo: on the
				// take, whatever else is.
				if (!meta) await keepNewest(res.entities.slate, diagram!, diagramsField(res), await family(diagramPrefix(blob.recordId), signal), signal);
				else if (blob.variant === 'annotated') await keepNewestCopy(res, meta.take, blob.recordId, signal);
				else await link(res, meta.take, [row.id], signal);
				if (meta) await caption(row, meta, signal);
				return { verified: true, remoteId: row.id };
			}
			return { verified: false };
		}
	};
	return transport;
}

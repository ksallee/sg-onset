// A Flow Production Tracking site behind a `fetch`, for the tests. It answers in the shapes and
// with the refusals the sg-groundtruth corpus measured, and each rule names its entry. It holds
// what a real site holds: a schema, rows, stored files. Tests tell it what to do wrong.
//
// - Schema: endpoints/get_schema.md, get_schema_type_fields.md, post_schema_type_fields.md.
// - Search: endpoints/post_entity_type_search.md. Batch: endpoints/post_entity_batch.md, recipes/002_batch.md.
// - Values: findings/field_types/*.md. Unique: findings/127_retry_and_client_uuid.md.
// - Upload: endpoints/get_entity_type_id_field_upload.md, get_entity_type_id_field_upload_multipart.md,
//   put_links_upload.md, post_entity_type_id_field_upload.md, findings/039, 044, 123, 125, 134, 141.
// - Bearer refusals: findings/133_bearer_expiry.md. Field-create refusal: findings/132.
//   Row refusals: findings/143_nonadmin_rows.md. Reverse fields: findings/142_reverse_field.md.

import { codeName, reverseField, slugOf } from './names';
import type { RawField, RawFields, SchemaTypes } from './schema';
import { completeFields, siteTypes, SITE_URL, stockFields, TYPES } from './testkit';

type Ref = { type: string; id: number };
export type FakeRow = { type: string; id: number; values: Record<string, unknown>; retired?: boolean };
type Request = { host: 'site' | 'storage'; method: string; path: string; query: URLSearchParams; headers: Headers; body: unknown; raw: BodyInit | null | undefined };
/**
 * - `{ status }`: answer this instead of handling the request.
 * - `'network'`: the request never arrives.
 * - `{ after: 'network' }`: the request is handled, and the answer never arrives.
 */
export type Fault = { status: number; body?: unknown } | 'network' | { after: 'network' };
type Upload = { key: string; type: string; id: number; field: string; filename: string; uploadId: string | null; timestamp: string };

export const STORAGE = 'https://bucket.s3-accelerate.amazonaws.com';
export const BEARER = 'good-bearer';

const VENDOR = ['application/vnd+shotgun.api3_array+json', 'application/vnd+shotgun.api3_hash+json'];

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
const refuse = (status: number, title: string, code = 103, extra: Record<string, unknown> = {}) =>
	json(status, { errors: [{ id: 'x', status, code, title, source: null, detail: null, meta: null, ...extra }] });

class Refusal extends Error {
	constructor(
		readonly status: number,
		readonly title: string,
		readonly code = 103
	) {
		super(title);
	}
}

export type FakeFpt = ReturnType<typeof fakeFpt>;

export function fakeFpt(options: { fields?: 'complete' | 'bare' } = {}) {
	const clock = { t: Date.UTC(2026, 10, 11, 10, 0, 0) };
	const types: SchemaTypes = siteTypes();
	const fields: Record<string, RawFields> = {};
	const complete = completeFields();
	for (const [scope, type] of Object.entries(TYPES)) {
		fields[type] = options.fields === 'bare' ? stockFields() : complete[scope as keyof typeof complete];
	}
	fields.Attachment = {
		display_name: { name: { value: 'File Display Name' }, data_type: { value: 'text' } },
		description: { name: { value: 'Description' }, data_type: { value: 'text' } },
		filename: { name: { value: 'File Name' }, data_type: { value: 'text' }, editable: { value: false } },
		project: { name: { value: 'Project' }, data_type: { value: 'entity' }, properties: { valid_types: { value: ['Project'] } } },
		attachment_links: { name: { value: 'Links' }, data_type: { value: 'multi_entity' }, editable: { value: false } },
		this_file: { name: { value: 'File' }, data_type: { value: 'url' }, editable: { value: false } }
	};
	fields.Project = { name: { name: { value: 'Project Name' }, data_type: { value: 'text' } } };

	const rows = new Map<string, FakeRow>();
	/** Stored files, by key: the bytes each part holds. */
	const objects = new Map<string, Map<number, number>>();
	const uploads = new Map<string, Upload>();
	/** The stored Content-Type of each object. */
	const storedTypes = new Map<string, string>();
	const faults: { match: (r: Request) => boolean; fault: Fault }[] = [];
	let nextId = 1000;
	let nextKey = 1;

	const fpt = {
		site: SITE_URL,
		clock,
		types,
		fields,
		rows,
		objects,
		storedTypes,
		/** Every request, in order. */
		requests: [] as Request[],
		/** False: every site call answers 401, `detail` null, as for no token (findings/133). */
		bearerValid: true,
		/** Bearers past their `exp`: answered 401 code 102, `detail` `Token Expired` (findings/133). */
		expired: new Set<string>(),
		/** Rights the signed-in person lacks: `create:<Type>`, `update:<Type>`, `delete:<Type>` (findings/143). */
		forbidden: new Set<string>(),
		/** False: no request arrives anywhere. */
		online: true,
		/** False: a field create is refused, as for an Artist: 500 code 105 (findings/132). */
		canCreateFields: true,
		/** A presigned URL dies after this (findings/125). */
		urlLifeMs: 900_000,
		/** Every part but the last must be this large (findings/044). */
		partFloor: 5 * 1024 * 1024,
		/** The next completion answers 201 and keeps no bytes (findings/039). */
		loseNextUpload: false,

		failNext(match: (r: Request) => boolean, fault: Fault, times = 1) {
			for (let i = 0; i < times; i++) faults.push({ match, fault });
		},
		seed(type: string, values: Record<string, unknown> = {}): number {
			const id = nextId++;
			rows.set(`${type}:${id}`, { type, id, values: { ...values } });
			return id;
		},
		live(type: string): FakeRow[] {
			return [...rows.values()].filter((r) => r.type === type && !r.retired);
		},
		/** The live row of a type holding this client UUID. */
		byUuid(type: string, uuid: string): FakeRow | undefined {
			return fpt.live(type).find((r) => r.values.sg_onset_uuid === uuid);
		},
		count(match: (r: Request) => boolean): number {
			return fpt.requests.filter(match).length;
		},
		fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
			const headers = new Headers(init?.headers);
			let body: unknown;
			if (typeof init?.body === 'string') {
				try {
					body = JSON.parse(init.body);
				} catch {
					body = init.body;
				}
			}
			const request: Request = {
				host: url.origin === STORAGE ? 'storage' : 'site',
				method: (init?.method ?? 'GET').toUpperCase(),
				path: url.pathname,
				query: url.searchParams,
				headers,
				body,
				raw: init?.body
			};
			fpt.requests.push(request);
			if (init?.signal?.aborted) throw new DOMException('aborted', 'AbortError');
			if (!fpt.online) throw new TypeError('Failed to fetch');
			const at = faults.findIndex((f) => f.match(request));
			const fault = at >= 0 ? faults.splice(at, 1)[0].fault : undefined;
			if (fault === 'network') throw new TypeError('Failed to fetch');
			if (fault && 'status' in fault) return typeof fault.body === 'string' ? new Response(fault.body, { status: fault.status }) : refuseWith(fault);
			const response = request.host === 'storage' ? storage(request) : site(request);
			if (fault) throw new TypeError('Failed to fetch');
			return response;
		}) as typeof fetch
	};

	const refuseWith = (fault: { status: number; body?: unknown }) =>
		fault.body !== undefined ? json(fault.status, fault.body) : fault.status === 401 ? refuse(401, 'Unauthorized', 102) : refuse(fault.status, `HTTP ${fault.status}`);

	// ---------------------------------------------------------------- values

	const typeOfSlug = (slug: string): string => {
		const found = Object.keys(types).find((t) => slugOf(t) === slug || t.toLowerCase() === slug.toLowerCase());
		if (!found) throw new Refusal(404, `Entity type '${slug}' does not exist.`);
		return found;
	};
	const fieldOf = (type: string, name: string): RawField | undefined => fields[type]?.[name];
	const get = (type: string, id: number): FakeRow => {
		const row = rows.get(`${type}:${id}`);
		if (!row || row.retired) throw new Refusal(404, `Entity of type [${type}] with id=${id} does not exist.`);
		return row;
	};
	const isRef = (v: unknown): v is Ref => v !== null && typeof v === 'object' && typeof (v as Ref).type === 'string' && typeof (v as Ref).id === 'number';
	const legal = (type: string, name: string, ref: Ref) => {
		const target = rows.get(`${ref.type}:${ref.id}`);
		if (!target || target.retired) throw new Refusal(400, `Invalid field value, update failed [5 - Update failed for [${type}.${name}]: Value is not legal.]`);
	};

	/** A value as the field stores it, or the refusal the data type answers (findings/field_types). */
	function stored(type: string, name: string, value: unknown, row: FakeRow | undefined, verb: 'create' | 'update'): unknown {
		const where = `API ${verb}() ${type}.${name}`;
		if (name === 'created_at') {
			// Stored as sent on a create; `editable on create only` on an update (findings/070).
			if (verb === 'update') throw new Refusal(400, `${where} is editable on create only.`);
			return dateTime(value);
		}
		const field = fieldOf(type, name);
		if (!field) throw new Refusal(400, `Invalid field value, update failed [2 - Invalid field name: field [${type}.${name}] does not exist or user does not have access permission.]`);
		if (field.editable?.value === false) throw new Refusal(400, `${where} is read only.`);
		const got = (kind: string) => new Refusal(400, `${where} expected ${kind} data type(s) but got ${value === null ? 'NilClass: nil' : `${typeof value}: ${JSON.stringify(value)}`}`);
		switch (field.data_type.value) {
			case 'text': {
				if (value === null) return null;
				if (typeof value !== 'string') throw got('[String, NilClass]');
				return value.trim() === '' ? null : value.trim();
			}
			case 'float': {
				if (value === null) return null;
				if (typeof value === 'number' && Number.isInteger(value)) throw got('[String, BigDecimal, Float, NilClass]');
				const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : typeof value === 'number' ? value : NaN;
				if (!Number.isFinite(n)) throw new Refusal(400, `Invalid data for 'float' data type. Value: ${String(value)}`);
				return Number(n.toFixed(6));
			}
			case 'number': {
				if (value === null) return null;
				if (typeof value === 'number' && !Number.isInteger(value)) throw got('[String, Integer, NilClass]');
				const n = typeof value === 'string' ? Number(value) : value;
				if (typeof n !== 'number' || !Number.isInteger(n)) throw new Refusal(400, `Invalid data for 'number' data type. Value: ${String(value)}`);
				return n;
			}
			case 'checkbox':
				if (typeof value !== 'boolean') throw got('[String, FalseClass, TrueClass]');
				return value;
			case 'date':
				if (value === null) return null;
				if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Refusal(400, `Invalid date format: ${String(value)}. Correct format is: 2011-01-21`);
				return value;
			case 'date_time':
				return dateTime(value);
			case 'entity': {
				if (value === null) return null;
				if (!isRef(value)) throw got('[Hash, NilClass]');
				legal(type, name, value);
				return { type: value.type, id: value.id };
			}
			case 'multi_entity': {
				const mode = value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as { multi_entity_update_mode?: string }).multi_entity_update_mode : 'set';
				const list = Array.isArray(value) ? value : (value as { value?: unknown } | null)?.value;
				if (!Array.isArray(list) || !list.every(isRef)) throw got('[Array]');
				list.forEach((ref) => legal(type, name, ref));
				// A bare list replaces the whole set; a mode in the body adds or removes in place (recipes/009).
				const now = mode === 'add' || mode === 'remove' ? ((row?.values[name] as Ref[] | undefined) ?? []) : [];
				const same = (a: Ref, b: Ref) => a.type === b.type && a.id === b.id;
				if (mode === 'remove') return now.filter((r) => !list.some((x) => same(x, r)));
				return [...now, ...list.filter((x) => !now.some((r) => same(x, r))).map((r) => ({ type: r.type, id: r.id }))];
			}
			default:
				throw new Refusal(400, `${where} cannot be written.`);
		}
	}

	function dateTime(value: unknown): unknown {
		if (value === null) return null;
		const bad = new Refusal(400, `Invalid date time format: ${String(value)}. Correct format is 2011-01-21T13:26:09Z (UTC), 2011-01-21T13:26:09-07:00 (UTC Offset) or any ISO8601 compatible string.`);
		if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2})?)?$/.test(value)) throw bad;
		const time = Date.parse(/T/.test(value) && !/(Z|[+-]\d{2}:\d{2})$/.test(value) ? `${value}Z` : value);
		if (Number.isNaN(time)) throw bad;
		return new Date(time).toISOString().slice(0, 19) + 'Z';
	}

	/** Refuses a value another live row of the type holds in a unique field: case and outer spaces ignored (findings/127). */
	function unique(type: string, values: Record<string, unknown>, among: FakeRow[]) {
		for (const [name, value] of Object.entries(values)) {
			const field = fieldOf(type, name);
			if (!field?.unique?.value || typeof value !== 'string') continue;
			const key = value.trim().toLowerCase();
			if (among.some((r) => r.type === type && !r.retired && String(r.values[name] ?? '').trim().toLowerCase() === key)) {
				throw new Refusal(400, `Create failed for [${type}]: The value for the ${field.name.value} field is required to be unique. <br> `, 104);
			}
		}
	}

	// ---------------------------------------------------------------- reading

	function thisFile(row: FakeRow) {
		const key = row.values.__object as string;
		return {
			url: `${STORAGE}/${key}?X-Amz-Date=${clock.t}&X-Amz-Expires=900&X-Amz-Signature=read`,
			name: row.values.filename,
			content_type: 'image/jpeg',
			link_type: 'upload',
			type: 'Attachment',
			id: row.id
		};
	}

	/** A row as `_search` answers it: attributes for values, relationships for links (findings/004, field_types/entity.md). */
	function shown(row: FakeRow, asked: string[]) {
		const attributes: Record<string, unknown> = {};
		const relationships: Record<string, unknown> = {};
		for (const name of asked) {
			const [head, via, leaf] = name.split('.');
			if (leaf) {
				// A dotted path reads through a single link, typed (field_types/entity.md).
				const link = row.values[head] as Ref | null | undefined;
				const target = isRef(link) && link.type === via ? rows.get(`${link.type}:${link.id}`) : undefined;
				attributes[name] = target?.values[leaf] ?? null;
				continue;
			}
			const field = fieldOf(row.type, name);
			if (!field && name !== 'created_at') continue;
			const value = row.values[name] ?? null;
			const dataType = field?.data_type.value;
			if (dataType === 'entity') relationships[name] = { data: isRef(value) ? { ...value, name: 'x' } : null, links: {} };
			else if (dataType === 'multi_entity') {
				const live = ((value as Ref[] | null) ?? []).filter((r) => rows.get(`${r.type}:${r.id}`) && !rows.get(`${r.type}:${r.id}`)!.retired);
				relationships[name] = { data: live.map((r) => ({ ...r, name: 'x' })), links: {} };
			} else if (dataType === 'float') attributes[name] = value === null ? null : Number.isInteger(value) ? (value as number).toFixed(1) : String(value);
			else if (dataType === 'checkbox') attributes[name] = value === true;
			else if (dataType === 'url') attributes[name] = row.values.__object ? thisFile(row) : null;
			else attributes[name] = value;
		}
		return { type: row.type, attributes, relationships, id: row.id, links: { self: `/api/v1/entity/${slugOf(row.type)}/${row.id}` } };
	}

	function matches(row: FakeRow, filter: unknown): boolean {
		if (Array.isArray(filter) && typeof filter[0] === 'string') {
			const [path, relation, value] = filter as [string, string, unknown];
			const have = path === 'id' ? row.id : row.values[path];
			const text = (v: unknown) => String(v ?? '').toLowerCase();
			const sameRef = (a: unknown, b: unknown) => isRef(a) && isRef(b) && a.type === b.type && a.id === b.id;
			const hit = (v: unknown) => (Array.isArray(have) ? have.some((h) => sameRef(h, v)) : isRef(have) || isRef(v) ? sameRef(have, v) : typeof have === 'number' ? have === v : text(have) === text(v));
			// A text filter is case-blind (field_types/text.md).
			if (relation === 'is') return hit(value);
			if (relation === 'in') return (Array.isArray(value) ? value : [value]).some(hit);
			if (relation === 'starts_with') return text(have).startsWith(text(value));
			throw new Refusal(400, `API read() ${row.type}.${path}'s data type doesn't support '${relation}' 'relation'`);
		}
		if (Array.isArray(filter)) return filter.every((f) => matches(row, f));
		const group = filter as { logical_operator?: string; conditions?: unknown[] };
		const results = (group.conditions ?? []).map((c) => matches(row, c));
		return group.logical_operator === 'or' ? results.some(Boolean) : results.every(Boolean);
	}

	// ---------------------------------------------------------------- writing

	type Write = { request_type: string; entity: string; record_id?: number; data?: Record<string, unknown> };

	/** One write against a staging copy. A create in a batch skips the project check (recipes/002). */
	function apply(write: Write, staged: Map<string, FakeRow>, made: FakeRow[]) {
		const type = write.entity;
		if (!types[type]) throw new Refusal(400, `Invalid entity type: entity type [] does not exist.`);
		rights(write.request_type, type, Object.keys(write.data ?? {}));
		if (write.request_type === 'create') {
			const values: Record<string, unknown> = {};
			for (const [name, value] of Object.entries(write.data ?? {})) values[name] = stored(type, name, value, undefined, 'create');
			unique(type, values, [...staged.values()]);
			const row: FakeRow = { type, id: nextId++, values: { created_at: dateTime(new Date(clock.t).toISOString()), ...values } };
			staged.set(`${type}:${row.id}`, row);
			made.push(row);
			return { data: shown(row, Object.keys(values)) };
		}
		const row = staged.get(`${type}:${write.record_id}`);
		if (!row || row.retired) throw new Refusal(404, `Entity of type [${type}] with id=${write.record_id ?? 0} does not exist.`);
		if (write.request_type === 'delete') {
			staged.set(`${type}:${row.id}`, { ...row, retired: true });
			return { request_type: 'delete', type, id: row.id, uuid: 'generated', did_delete: true };
		}
		const next = { ...row, values: { ...row.values } };
		for (const [name, value] of Object.entries(write.data ?? {})) next.values[name] = stored(type, name, value, row, 'update');
		staged.set(`${type}:${row.id}`, next);
		return { data: shown(next, Object.keys(write.data ?? {})), links: {}, status: 200 };
	}

	/** The refusals of findings/143, as an Artist gets them: 400 code 104 naming the type or the field. */
	function rights(action: string, type: string, names: string[]) {
		if (action === 'create' && fpt.forbidden.has(`create:${type}`)) throw new Refusal(400, `Entity of type ${type} cannot be created by this user.`, 104);
		if (action === 'delete' && fpt.forbidden.has(`delete:${type}`)) throw new Refusal(400, `Entity of type ${type} can not be deleted by this user.`, 104);
		if (action === 'update' && fpt.forbidden.has(`update:${type}`)) {
			const name = names.find((n) => n !== 'sg_status_list');
			if (name) throw new Refusal(400, `The field is not editable for this user: [${type}.${name}].`, 104);
		}
	}

	function commit(staged: Map<string, FakeRow>) {
		rows.clear();
		for (const [key, row] of staged) rows.set(key, row);
	}

	// ---------------------------------------------------------------- the site

	function site(r: Request): Response {
		try {
			// Any path under /api/v1 needs a bearer. Every refusal is 401 code 102 `Unauthorized`; only
			// `detail` differs (findings/133).
			const sent = (r.headers.get('authorization') ?? '').replace(/^Bearer\s*/, '');
			if (fpt.expired.has(sent)) return refuse(401, 'Unauthorized', 102, { detail: 'Token Expired' });
			if (!fpt.bearerValid || !sent) return refuse(401, 'Unauthorized', 102);
			if (sent !== BEARER) return refuse(401, 'Unauthorized', 102, { detail: 'Token invalid' });
			const path = r.path.replace(/^\/api\/v1/, '');
			if (path === r.path) return refuse(404, 'Not Found');
			const parts = path.split('/').filter(Boolean);
			const contentType = (r.headers.get('content-type') ?? '').split(';')[0];

			if (parts[0] === 'schema') {
				if (parts.length === 1 && r.method === 'GET') return json(200, { data: types });
				const type = parts[1];
				if (!types[type]) return refuse(404, 'Not Found', 103, { detail: `Entity type '${type}' does not exist.` });
				if (parts[2] === 'fields' && parts.length === 3 && r.method === 'GET') return json(200, { data: fields[type] ?? {} });
				if (parts[2] === 'fields' && parts.length === 3 && r.method === 'POST') return createField(type, r);
			}

			if (parts[0] === 'entity' && parts[1] === '_batch' && r.method === 'POST') {
				// Plain JSON: the vendor type is a 415 here (recipes/002).
				if (contentType !== 'application/json') return refuse(415, `Unsupported Content-Type '${contentType}'`);
				const requests = (r.body as { requests?: Write[] } | undefined)?.requests;
				if (!Array.isArray(requests)) return refuse(400, 'Request Parameters invalid.', 103, { source: { requests: ['requests is missing'] } });
				// Atomic: one bad request rolls the whole batch back (endpoints/post_entity_batch.md).
				const staged = new Map([...rows].map(([key, row]) => [key, { ...row, values: { ...row.values } }]));
				const data = requests.map((write) => apply(write, staged, []));
				commit(staged);
				return json(200, { data });
			}

			if (parts[0] === 'entity' && parts[2] === '_search' && r.method === 'POST') {
				// The vendor type is required; application/json is a 415 (endpoints/post_entity_type_search.md).
				if (!VENDOR.includes(contentType)) return refuse(415, `Unsupported Content-Type '${contentType}'`);
				const type = typeOfSlug(parts[1]);
				const body = r.body as { filters?: unknown; fields?: string | string[]; page?: { size?: number } };
				const asked = typeof body.fields === 'string' ? body.fields.split(',') : (body.fields ?? []);
				const found = fpt.live(type).filter((row) => matches(row, body.filters ?? []));
				return json(200, { data: found.slice(0, body.page?.size ?? 500).map((row) => shown(row, asked)), links: {} });
			}

			if (parts[0] === 'entity' && parts.includes('_upload')) return upload(parts, r, contentType);

			if (parts[0] === 'entity' && parts.length === 3) {
				const type = typeOfSlug(parts[1]);
				const id = Number(parts[2]);
				if (r.method === 'DELETE') {
					rights('delete', type, []);
					get(type, id).retired = true;
					return new Response(null, { status: 204 });
				}
				if (r.method === 'PUT') {
					if (contentType !== 'application/json') return refuse(415, `Unsupported Content-Type '${contentType}'`);
					const staged = new Map(rows);
					const answer = apply({ request_type: 'update', entity: type, record_id: id, data: r.body as Record<string, unknown> }, staged, []);
					commit(staged);
					return json(200, answer);
				}
			}
			return refuse(404, 'Not Found');
		} catch (error) {
			if (error instanceof Refusal) return refuse(error.status, error.title, error.code);
			throw error;
		}
	}

	function createField(type: string, r: Request): Response {
		// An Artist: 500 code 105, a RuntimeError title and a traceback in `detail` (findings/132).
		if (!fpt.canCreateFields) {
			return refuse(500, "API schema_field_create() RuntimeError: User doesn't have permission to create a Field", 105, {
				detail: "{traceback: \"/var/rails/shotgun/current/app/models/display_column.rb:2764:in 'block in DisplayColumn.create_column'\"}"
			});
		}
		const body = r.body as { data_type: string; properties: { property_name: string; value: unknown }[] };
		const prop = (name: string) => body.properties.find((p) => p.property_name === name)?.value;
		const display = String(prop('name'));
		if (body.data_type === 'checkbox' && prop('default_value') === undefined) return refuse(500, 'Only true or false allowed in checkbox');
		if ((body.data_type === 'entity' || body.data_type === 'multi_entity') && !Array.isArray(prop('valid_types'))) {
			return refuse(400, `API schema_field_create() missing required 'properties' ["valid_types"]`);
		}
		// A display name already in use is a 201 for `<name>_1`, with no warning (post_schema_type_fields).
		let name = codeName(display);
		if (fields[type][name]) name = `${name}_1`;
		fields[type][name] = {
			name: { value: display },
			data_type: { value: body.data_type },
			editable: { value: true },
			unique: { value: prop('unique') === true },
			properties: prop('valid_types') ? { valid_types: { value: prop('valid_types') } } : {}
		};
		// A link field makes a visible, editable multi_entity on each type it links (findings/142).
		if (body.data_type === 'entity' || body.data_type === 'multi_entity') {
			for (const target of prop('valid_types') as string[]) {
				if (!fields[target]) continue;
				const reverse = reverseField(type, types[type].name.value, name, display, body.data_type);
				fields[target][reverse.name] = {
					name: { value: reverse.displayName },
					data_type: { value: 'multi_entity' },
					editable: { value: true },
					unique: { value: false },
					properties: { valid_types: { value: [type] } }
				};
			}
		}
		return json(201, { data: fields[type][name], links: { self: `/api/v1/schema/${type}/fields/${name}` } });
	}

	// ---------------------------------------------------------------- uploads

	const signed = (key: string, part?: number) => `${STORAGE}/${key}?X-Amz-Date=${clock.t}&X-Amz-Expires=900${part ? `&partNumber=${part}` : ''}&X-Amz-Signature=sig`;

	function upload(parts: string[], r: Request, contentType: string): Response {
		const type = typeOfSlug(parts[1]);
		const id = Number(parts[2]);
		const field = parts[3] === '_upload' ? '' : parts[3];
		const base = `/api/v1/entity/${parts[1]}/${id}${field ? `/${field}` : ''}/_upload`;
		get(type, id);
		if (field && !fieldOf(type, field)) return refuse(404, 'Not Found', 103, { detail: `Field '${type}.${field}' does not exist.` });
		const tail = parts[parts.length - 1];

		if (tail === '_upload' && r.method === 'GET') {
			const filename = r.query.get('filename');
			if (!filename) return refuse(400, 'Request Parameters invalid.', 103, { source: { filename: ['filename is missing'] } });
			const multipart = r.query.get('multipart_upload') === 'true';
			const key = `obj-${nextKey++}`;
			const timestamp = new Date(clock.t).toISOString().slice(0, 19) + 'Z';
			const uploadId = multipart ? `upload-${key}` : null;
			uploads.set(key, { key, type, id, field, filename, uploadId, timestamp });
			const data = { timestamp, upload_type: 'Attachment', upload_id: uploadId, storage_service: 's3', original_filename: filename, multipart_upload: multipart, __key: key };
			const next = `${base}/multipart?filename=${encodeURIComponent(filename)}&part_number=2&timestamp=${encodeURIComponent(timestamp)}&upload_id=${uploadId}&upload_type=Attachment`;
			return json(200, { data, links: { upload: signed(key, multipart ? 1 : undefined), complete_upload: base, ...(multipart ? { get_next_part: next } : {}) } });
		}

		if (tail === 'multipart' && r.method === 'GET') {
			const uploadId = r.query.get('upload_id');
			const part = Number(r.query.get('part_number'));
			if (!uploadId) return refuse(400, 'Could not generate upload url. Check the site settings.');
			const found = [...uploads.values()].find((u) => u.uploadId === uploadId);
			const q = new URLSearchParams(r.query);
			q.set('part_number', String(part + 1));
			return json(200, { links: { upload: signed(found?.key ?? 'nowhere', part), get_next_part: `${base}/multipart?${q.toString()}` } });
		}

		if (tail === 'multipart_abort' && r.method === 'POST') {
			// The abort takes `upload_info` flat at the top level (findings/044).
			const info = r.body as { upload_id?: string };
			const found = [...uploads.values()].find((u) => u.uploadId && u.uploadId === info.upload_id);
			if (!found) return refuse(400, 'Failed to abort S3 multipart upload');
			uploads.delete(found.key);
			objects.delete(found.key);
			return new Response(null, { status: 204 });
		}

		if (tail === '_upload' && r.method === 'POST') {
			// The completion takes plain JSON; the vendor type is a 415 (findings/014).
			if (contentType !== 'application/json') return refuse(415, `Unsupported Content-Type '${contentType}'`);
			const body = r.body as { upload_info?: Record<string, unknown>; upload_data?: { display_name?: string } };
			const info = body.upload_info;
			if (!info || !body.upload_data) return refuse(400, 'Request Parameters invalid.');
			const found = uploads.get(String(info.__key));
			if (!found) return refuse(400, 'Request Parameters invalid.');
			if (found.uploadId) {
				const etags = info.etags;
				if (!Array.isArray(etags)) return refuse(400, "'multipart_upload' is True but no 'etags' send with request.", 103, { source: { etags: 'missing and required for multipart uploads.' } });
				const stored = objects.get(found.key) ?? new Map<number, number>();
				const sizes = etags.map((_, i) => stored.get(i + 1));
				const good = etags.every((etag, i) => sizes[i] !== undefined && etag === `etag-${found.key}-${i + 1}-${sizes[i]}`);
				const floor = sizes.slice(0, -1).every((size) => (size ?? 0) >= fpt.partFloor);
				if (!good || !floor || stored.size !== etags.length) return refuse(400, 'Error completing multipart upload.');
			}
			uploads.delete(found.key);
			// A 201 whether or not the bytes were ever PUT (findings/039).
			if (fpt.loseNextUpload) {
				fpt.loseNextUpload = false;
				objects.delete(found.key);
			}
			const owner = get(found.type, found.id);
			// Each space of a file name is stored as `_` (findings/135). The Attachment gets the row's
			// project and lists the row in `attachment_links` (findings/134).
			const attachment = fpt.seed('Attachment', {
				filename: found.filename.replace(/ /g, '_'),
				project: owner.values.project ?? null,
				attachment_links: [{ type: found.type, id: found.id }],
				original_fname: found.filename,
				display_name: body.upload_data.display_name ?? found.filename,
				description: null,
				__object: found.key
			});
			if (found.field) {
				// A second upload to the field adds (findings/134).
				const held = (owner.values[found.field] as Ref[] | undefined) ?? [];
				owner.values[found.field] = [...held, { type: 'Attachment', id: attachment }];
			}
			// One space, declared as JSON, and it never names the row it made (findings/039).
			return new Response(' ', { status: 201, headers: { 'content-type': 'application/json; charset=utf-8' } });
		}
		return refuse(404, 'Not Found');
	}

	function storage(r: Request): Response {
		const key = r.path.slice(1);
		// The URL is signed for GET: HEAD is refused (findings/141).
		if (r.method === 'HEAD') return new Response('<Error><Code>AccessDenied</Code></Error>', { status: 403 });
		// No Authorization on the presigned host: the signature covers the request (put_links_upload).
		if (r.headers.has('authorization')) return new Response('<Error><Code>InvalidRequest</Code></Error>', { status: 400 });
		if (clock.t - Number(r.query.get('X-Amz-Date')) > fpt.urlLifeMs) {
			return new Response('<Error><Code>AccessDenied</Code><Message>Request has expired</Message><X-Amz-Expires>900</X-Amz-Expires></Error>', { status: 403 });
		}
		if (r.method === 'PUT') {
			const part = Number(r.query.get('partNumber') ?? 1);
			const size = r.raw instanceof Blob ? r.raw.size : 0;
			if (!objects.has(key)) objects.set(key, new Map());
			objects.get(key)!.set(part, size);
			// The stored type is what a single PUT sent, or S3's `binary/octet-stream` (findings/141).
			if (!r.query.get('partNumber')) storedTypes.set(key, r.headers.get('content-type') ?? 'binary/octet-stream');
			// ETag is exposed to a page (findings/125).
			return new Response(null, { status: 200, headers: { ETag: `"etag-${key}-${part}-${size}"` } });
		}
		if (r.method === 'GET') {
			const held = objects.get(key);
			if (!held) return new Response('<Error><Code>NoSuchKey</Code></Error>', { status: 404 });
			const size = [...held.values()].reduce((sum, n) => sum + n, 0);
			return new Response(new Uint8Array(size), { status: 200, headers: { 'content-length': String(size), 'content-type': storedTypes.get(key) ?? 'binary/octet-stream' } });
		}
		return new Response(null, { status: 405 });
	}

	return fpt;
}

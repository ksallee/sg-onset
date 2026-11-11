// The calls to a Flow Production Tracking site, and what each failure is. The edge: this is the
// only module of the folder that calls `fetch`.
//
// The browser calls `/api/v1` itself with a bearer: every path under it answers CORS for any
// origin (corpus findings/062_cors.md). Records and schema go through sg-widgets-core's clients,
// which already know the wire: the content type of each endpoint, the batch envelope, where a
// created field's name is. The presigned upload is not in them in the shape the outbox needs
// (part by part, renewable), so its calls are here.

import { RestClient, RestSchemaClient, SgApiError, type BatchRequest, type BatchResult, type EntityRow } from 'sg-widgets-core';
import { TransportError } from '$lib/outbox/transport';
import type { KeyValue } from './cache';
import { bearerRefusal, failureOf, isSessionRefusal, networkKind, statusKind, type ApiFailure } from './errors';
import { renewDue } from './token';
import type { CreateInput, RawFields, SchemaTypes } from './schema';

export type FptOptions = {
	/** The site's origin, `https://<host>`. */
	site: string;
	/**
	 * A bearer for `/api/v1`. `bearer` of `$lib/auth/session.svelte`. It lasts 600 s; asked per
	 * call. `{ renew: true }` asks for a new one, not the one held: sent when the held one is
	 * within a minute of its `exp`, or the site answered `Token Expired` (corpus findings/133).
	 */
	bearer: (request?: { renew?: boolean }) => Promise<string>;
	/** The clock, for the bearer's `exp`. Default: `Date.now`. */
	now?: () => number;
	fetch?: typeof fetch;
	/** Where the resolved schema of the site is kept on the device. */
	schemaCache: KeyValue;
	/** Is there a network. Default: `navigator.onLine`. Decides what a request with no answer means. */
	online?: () => boolean;
};

/** The site answered, and the answer is a refusal. */
export class ApiRefusal extends Error {
	constructor(readonly failure: ApiFailure) {
		super(failure.title);
		this.name = 'ApiRefusal';
	}
}

export type Filter = [string, string, unknown] | { logical_operator: 'and' | 'or'; conditions: Filter[] };
type Mode = 'read' | 'write';

export type Api = ReturnType<typeof createApi>;

export function createApi(options: FptOptions) {
	const root = options.site.replace(/\/+$/, '');
	// Bound: the default `fetch` called as a method of another object is an Illegal invocation.
	const base: typeof fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
	const online = options.online ?? (() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
	const now = options.now ?? Date.now;

	const noAnswer = (mode: Mode, signal?: AbortSignal) => new TransportError(networkKind({ online: online(), aborted: signal?.aborted ?? false, mode }));

	/** What a 401 says, read from a copy of its body. No `WWW-Authenticate` is sent (findings/133). */
	async function bearerTrouble(response: Response): Promise<'expired' | 'invalid' | undefined> {
		const body: unknown = await response
			.clone()
			.json()
			.catch(() => null);
		return bearerRefusal(failureOf(response.status, body));
	}

	/**
	 * `fetch` that throws a TransportError for everything that is not an answer about the request.
	 * A bearer the site calls expired is renewed and the request sent once more, inside this one
	 * call: the runner counts no attempt for it (corpus findings/133_bearer_expiry.md). A bearer it
	 * calls invalid, or none, is `unauthorized`. `pass` lists statuses handed to the caller to read.
	 */
	function guarded(mode: Mode, signal?: AbortSignal, pass: readonly number[] = []): typeof fetch {
		const send = async (input: RequestInfo | URL, init: RequestInit | undefined): Promise<Response> => {
			try {
				return await base(input, { ...init, ...(signal ? { signal } : {}) });
			} catch {
				throw noAnswer(mode, signal);
			}
		};
		return async (input, init) => {
			let response = await send(input, init);
			if (response.status === 401 && (await bearerTrouble(response)) === 'expired' && new Headers(init?.headers).has('Authorization')) {
				const headers = new Headers(init?.headers);
				headers.set('Authorization', `Bearer ${await token(true)}`);
				response = await send(input, { ...init, headers });
			}
			if (response.status === 401 && (await bearerTrouble(response))) throw new TransportError('unauthorized', `HTTP 401`);
			const kind = statusKind(response.status, mode);
			if (kind && !pass.includes(response.status)) throw new TransportError(kind, `HTTP ${response.status}`);
			return response;
		};
	}

	/**
	 * The bearer, or why there is none. Signed out, or a session the site refuses (400 code 102,
	 * corpus findings/126_session_idle.md), is `unauthorized`. A mint that got no answer is
	 * `unreachable`: nothing was sent to the API yet. A bearer a minute from its `exp` is renewed
	 * before it is sent: it worked 20 s before `exp` and not 5 s after (findings/133, token.ts).
	 */
	async function token(renew = false): Promise<string> {
		const held = await mint(renew);
		return !renew && renewDue(held, now()) ? mint(true) : held;
	}

	async function mint(renew: boolean): Promise<string> {
		try {
			return await (renew ? options.bearer({ renew: true }) : options.bearer());
		} catch (error) {
			if (error instanceof TransportError) throw error;
			if (error instanceof TypeError || (error instanceof Error && error.name === 'AbortError')) throw new TransportError('unreachable');
			const status = (error as { status?: unknown } | null)?.status;
			if (typeof status === 'number') {
				const failure = failureOf(status, (error as { body?: unknown }).body);
				if (!isSessionRefusal(failure) && status !== 401 && (status === 429 || status >= 500)) throw new TransportError('failed', failure.title);
			}
			throw new TransportError('unauthorized', error instanceof Error ? error.message : 'no session');
		}
	}

	/** Runs a call of one of the core clients, and sorts what it throws. */
	async function run<T>(call: () => Promise<T>): Promise<T> {
		try {
			return await call();
		} catch (error) {
			if (error instanceof TransportError) throw error;
			if (error instanceof SgApiError) throw refusal(error.status, error.body);
			// An answer that is not what the endpoint answers: a proxy's page, a cut body.
			throw new TransportError('failed', error instanceof Error ? error.message : String(error));
		}
	}

	function refusal(status: number, body: unknown): Error {
		const failure = failureOf(status, body);
		return isSessionRefusal(failure) ? new TransportError('unauthorized', failure.title) : new ApiRefusal(failure);
	}

	const rest = (mode: Mode, signal?: AbortSignal) => new RestClient({ siteUrl: root, token: () => token(), fetch: guarded(mode, signal) });
	const schema = (mode: Mode, signal?: AbortSignal, pass: readonly number[] = []) => new RestSchemaClient({ siteUrl: root, token: () => token(), fetch: guarded(mode, signal, pass) });

	/** A call to a link the site handed out. Links come back with `/api/v1` already on them (corpus findings/039). */
	async function link(method: 'GET' | 'POST', path: string, mode: Mode, signal: AbortSignal | undefined, body?: unknown, params?: Record<string, string>): Promise<unknown> {
		const url = new URL(path, root);
		for (const [key, value] of Object.entries(params ?? {})) url.searchParams.set(key, value);
		const headers: Record<string, string> = { Accept: 'application/json', Authorization: `Bearer ${await token()}` };
		// The completion and the abort take plain JSON; the vendor type is a 415 (corpus findings/014).
		if (body !== undefined) headers['Content-Type'] = 'application/json';
		const response = await guarded(mode, signal)(url, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
		const text = await response.text().catch(() => '');
		let parsed: unknown = null;
		try {
			// The completion answers one space, declared as JSON (corpus endpoints/post_links_complete_upload.md).
			parsed = text.trim() ? JSON.parse(text) : null;
		} catch {
			parsed = text;
		}
		if (!response.ok) throw refusal(response.status, parsed);
		return parsed;
	}

	return {
		/** `GET /schema`: the enabled types and their display names (corpus endpoints/get_schema.md). */
		async types(signal?: AbortSignal): Promise<SchemaTypes> {
			const list = await run(() => rest('read', signal).entityTypes());
			return Object.fromEntries(list.map((t) => [t.name, { name: { value: t.displayName } }]));
		},

		/** `GET /schema/<Type>/fields`. About 48 KB a type (corpus endpoints/get_schema_type_fields.md). */
		fields(entityType: string, signal?: AbortSignal): Promise<RawFields> {
			return run(() => schema('read', signal).readRawFields(entityType)) as Promise<RawFields>;
		},

		/**
		 * `POST /schema/<Type>/fields`. Answers the name the server gave the field, which is only in
		 * `links.self` (corpus endpoints/post_schema_type_fields.md). A 500 is passed on as a refusal,
		 * to be read: a person who may not create fields gets 500 code 105, and retrying it would
		 * never end (findings/132_field_create_rights.md). A 401 that is not about the bearer is
		 * passed on too: "Must sudo as Administrator" (findings/027_auth_permissions.md).
		 */
		async createField(entityType: string, input: CreateInput, signal?: AbortSignal): Promise<string> {
			const made = await run(() => schema('write', signal, [401, 500]).createField(entityType, { dataType: input.dataType, displayName: input.displayName, properties: input.properties }));
			return made.name;
		},

		/** `POST /entity/<type>/_search`, in the vendor content type (corpus endpoints/post_entity_type_search.md). */
		async search(entityType: string, filters: Filter, fields: string[], size: number, signal?: AbortSignal): Promise<EntityRow[]> {
			const group = Array.isArray(filters) ? { logical_operator: 'and' as const, conditions: [filters] } : filters;
			const found = await run(() => rest('read', signal).search(entityType, { filters: group as never, fields, page: { size: Math.max(1, Math.min(size, 500)) } }));
			return found.data;
		},

		/** `POST /entity/_batch`: all or nothing, results in request order (corpus recipes/002_batch.md). */
		batch(requests: BatchRequest[], signal?: AbortSignal): Promise<BatchResult[]> {
			return run(() => rest('write', signal).batch(requests));
		},

		/** `PUT /entity/<type>/<id>`. */
		async update(entityType: string, id: number, patch: Record<string, unknown>, signal?: AbortSignal): Promise<void> {
			await run(() => rest('write', signal).update(entityType, id, patch));
		},

		/** `DELETE /entity/<type>/<id>`. */
		async remove(entityType: string, id: number, signal?: AbortSignal): Promise<void> {
			await run(() => rest('write', signal).delete(entityType, id));
		},

		/** A read of a link, or of a path under `/api/v1`, with query parameters. */
		get(path: string, params?: Record<string, string>, signal?: AbortSignal): Promise<unknown> {
			return link('GET', path, 'read', signal, undefined, params);
		},

		/** A write to a link. The answer is not read for meaning: a completion answers one space. */
		async post(path: string, body: unknown, signal?: AbortSignal): Promise<void> {
			await link('POST', path, 'write', signal, body);
		},

		/**
		 * `PUT <links.upload>`: the bytes, to storage, with no Authorization: the signature covers the
		 * request (corpus endpoints/put_links_upload.md). The host answers any origin and exposes
		 * `ETag` (findings/125_upload_host_cors.md). Returns the ETag, quotes stripped.
		 * A 403 is a dead URL: `expired`. Any other refusal, or no answer, is `failed`: a part is
		 * safe to send again.
		 * `contentType` is what the stored file is served as: without one it is `binary/octet-stream`
		 * whatever the name says, and the header is not signed, so it may be sent (findings/141, 125).
		 */
		async putBytes(url: string, data: Blob, signal?: AbortSignal, contentType = data.type): Promise<string | undefined> {
			let response: Response;
			try {
				response = await base(url, {
					method: 'PUT',
					body: data,
					credentials: 'omit',
					...(contentType ? { headers: { 'Content-Type': contentType } } : {}),
					...(signal ? { signal } : {})
				});
			} catch {
				if (!online()) throw new TransportError('unreachable');
				throw new TransportError(signal?.aborted ? 'timeout' : 'failed', 'the upload got no answer');
			}
			if (response.status === 403) throw new TransportError('expired', 'the upload URL has expired');
			if (!response.ok) throw new TransportError('failed', `storage answered ${response.status}`);
			return response.headers.get('ETag')?.replace(/"/g, '') || undefined;
		},

		/**
		 * The size of a stored file, or `missing`. Fetching the file is the only proof it is there:
		 * nothing on the Attachment row says (corpus findings/039_upload_silent_failures.md; `file_size`
		 * stays null, findings/140). The body is not read: the length is in the headers, and the read
		 * is cancelled (findings/141: `Content-Length` is sent and readable under CORS, a closed body
		 * leaves the URL usable).
		 * Never `HEAD`: the URL is signed for GET and a HEAD is 403 (findings/141). Not a ranged GET
		 * either: the total is then only in `Content-Range`, which the storage does not expose to a
		 * page (only `ETag` is exposed, findings/141).
		 */
		async fileSize(url: string, signal?: AbortSignal): Promise<number | 'missing'> {
			let response: Response;
			try {
				response = await base(url, { method: 'GET', credentials: 'omit', ...(signal ? { signal } : {}) });
			} catch {
				throw noAnswer('read', signal);
			}
			if (response.status === 404) return 'missing';
			if (!response.ok) throw new TransportError('failed', `storage answered ${response.status}`);
			const length = response.headers.get('content-length');
			if (length !== null && /^\d+$/.test(length)) {
				await response.body?.cancel().catch(() => undefined);
				return Number(length);
			}
			return (await response.blob()).size;
		}
	};
}

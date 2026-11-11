import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { proxySessionPoll, proxySessionRequest } from './launcher-proxy';

const APP = 'https://onset.example';
const SITE = 'https://studio.shotgrid.autodesk.com';
const ID = 'a1b2c3d4e5';

function call(path: string, body: unknown, headers: Record<string, string> = {}): Request {
	return new Request(`${APP}${path}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', origin: APP, ...headers },
		body: typeof body === 'string' ? body : JSON.stringify(body)
	});
}
const ask = (body: unknown, headers?: Record<string, string>) => call('/auth/session-request', body, headers);
const poll = (body: unknown, headers?: Record<string, string>) => call('/auth/session-poll', body, headers);

const answer = (status: number, body: unknown) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
const approval = `${SITE}/app_session_request/${ID}?sticky_id=${ID}`;

let fetchMock: Mock<typeof fetch>;
let logs: Mock[];

beforeEach(() => {
	fetchMock = vi.fn<typeof fetch>();
	logs = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}) as unknown as Mock);
});
afterEach(() => {
	// Nothing the proxy handles is ever logged: the poll's answer carries a credential.
	for (const log of logs) expect(log).not.toHaveBeenCalled();
	vi.restoreAllMocks();
});

const opts = (extra: Partial<Parameters<typeof proxySessionRequest>[1]> = {}) => ({ fetch: fetchMock, ...extra });
async function read(res: Response) {
	return { status: res.status, body: await res.json() };
}

describe('session request', () => {
	it('forwards to an Autodesk-hosted site, form-encoded, with the server’s app name and redirects off', async () => {
		fetchMock.mockResolvedValue(answer(200, { sessionRequestId: ID, url: approval }));
		const res = await proxySessionRequest(ask({ site: 'studio.shotgrid.autodesk.com', appName: 'Your bank', machineId: 'x' }), opts());

		expect(await read(res)).toEqual({ status: 200, body: { id: ID, url: approval } });
		expect(res.headers.get('cache-control')).toBe('no-store');
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0];
		expect(String(url)).toBe(`${SITE}/internal_api/app_session_request`);
		expect(init?.method).toBe('POST');
		expect(init?.redirect).toBe('manual');
		expect(init?.body).toBe('appName=SG+OnSet&machineId=sg-onset');
		expect(new Headers(init?.headers).get('content-type')).toBe('application/x-www-form-urlencoded');
		expect(new Headers(init?.headers).get('cookie')).toBeNull();
		expect(new Headers(init?.headers).get('authorization')).toBeNull();
		expect(init?.signal).toBeInstanceOf(AbortSignal);
	});

	it('forwards to shotgunstudio.com too', async () => {
		fetchMock.mockResolvedValue(answer(200, { sessionRequestId: ID, url: `https://studio.shotgunstudio.com/app_session_request/${ID}` }));
		const res = await proxySessionRequest(ask({ site: 'https://studio.shotgunstudio.com' }), opts());
		expect(res.status).toBe(200);
		expect(String(fetchMock.mock.calls[0][0])).toBe('https://studio.shotgunstudio.com/internal_api/app_session_request');
	});

	it('refuses every other host without a fetch', async () => {
		const cases: [string, number, string, string?][] = [
			['fpt.studio.example', 403, 'not-allowed'],
			['autodesk.com', 403, 'not-allowed'],
			['shotgrid.autodesk.com', 403, 'not-allowed'],
			['a.b.shotgrid.autodesk.com', 403, 'not-allowed'],
			['studio.shotgrid.autodesk.com.evil.example', 403, 'not-allowed'],
			['http://studio.shotgrid.autodesk.com', 400, 'bad-site', 'not-https'],
			['studio.shotgrid.autodesk.com:8443', 400, 'bad-site', 'port'],
			['https://x@studio.shotgrid.autodesk.com', 400, 'bad-site', 'userinfo'],
			['https://studio.shotgrid.autodesk.com/internal_api/session', 400, 'bad-site', 'path'],
			['169.254.169.254', 400, 'bad-site', 'ip'],
			['[::1]', 400, 'bad-site', 'ip'],
			['localhost', 400, 'bad-site', 'local'],
			['xn--studio-9za.shotgrid.autodesk.com', 400, 'bad-site', 'punycode'],
			['studiо.shotgrid.autodesk.com', 400, 'bad-site', 'not-ascii']
		];
		for (const [site, status, error, reason] of cases) {
			const res = await proxySessionRequest(ask({ site }), opts());
			const expected = reason ? { error, reason } : { error };
			expect(await read(res), site).toEqual({ status, body: expected });
		}
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('allows a host the deploy names, and still refuses one it does not', async () => {
		fetchMock.mockResolvedValue(answer(200, { sessionRequestId: ID, url: `https://fpt.studio.example/app_session_request/${ID}` }));
		const allowed = await proxySessionRequest(ask({ site: 'fpt.studio.example' }), opts({ extraHosts: 'fpt.studio.example' }));
		expect(allowed.status).toBe(200);
		const refused = await proxySessionRequest(ask({ site: 'other.studio.example' }), opts({ extraHosts: 'fpt.studio.example' }));
		expect(refused.status).toBe(403);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('refuses a call from another origin, a body that is not JSON, and a large one', async () => {
		const site = 'studio.shotgrid.autodesk.com';
		expect((await read(await proxySessionRequest(ask({ site }, { origin: 'https://evil.example' }), opts()))).body).toEqual({ error: 'cross-origin' });
		expect((await proxySessionRequest(ask({ site }, { 'sec-fetch-site': 'cross-site' }), opts())).status).toBe(403);
		expect((await proxySessionRequest(ask({ site }, { 'content-type': 'text/plain' }), opts())).status).toBe(415);
		expect((await proxySessionRequest(ask('{"site":'), opts())).status).toBe(400);
		expect((await proxySessionRequest(ask('[1]'), opts())).status).toBe(400);
		expect((await proxySessionRequest(ask({}), opts())).status).toBe(400);
		expect((await proxySessionRequest(ask({ site, pad: 'x'.repeat(5000) }), opts())).status).toBe(413);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('takes a call with no Origin, as a same-origin fetch may send', async () => {
		fetchMock.mockResolvedValue(answer(200, { sessionRequestId: ID, url: approval }));
		const req = new Request(`${APP}/auth/session-request`, {
			method: 'POST',
			headers: { 'content-type': 'application/json; charset=utf-8' },
			body: JSON.stringify({ site: 'studio.shotgrid.autodesk.com' })
		});
		expect((await proxySessionRequest(req, opts())).status).toBe(200);
	});

	it('does not follow a redirect, to another host or its own', async () => {
		fetchMock.mockResolvedValue(new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data' } }));
		const res = await proxySessionRequest(ask({ site: 'studio.shotgrid.autodesk.com' }), opts());
		expect(await read(res)).toEqual({ status: 502, body: { error: 'redirect' } });
		expect(fetchMock).toHaveBeenCalledTimes(1);

		// What a browser-style fetch hands back for redirect: 'manual'.
		fetchMock.mockResolvedValue({ type: 'opaqueredirect', status: 0, text: async () => '' } as unknown as Response);
		expect((await read(await proxySessionRequest(ask({ site: 'studio.shotgrid.autodesk.com' }), opts()))).body).toEqual({ error: 'redirect' });
	});

	it('refuses an approval page on another host', async () => {
		fetchMock.mockResolvedValue(answer(200, { sessionRequestId: ID, url: `https://evil.example/app_session_request/${ID}` }));
		expect(await read(await proxySessionRequest(ask({ site: 'studio.shotgrid.autodesk.com' }), opts()))).toEqual({
			status: 502,
			body: { error: 'bad-answer' }
		});
	});

	it('maps a site refusal, a network failure and a timeout', async () => {
		const site = 'studio.shotgrid.autodesk.com';
		fetchMock.mockResolvedValueOnce(answer(400, { message: 'Missing params: appName, machineId' }));
		expect((await read(await proxySessionRequest(ask({ site }), opts()))).body).toEqual({ error: 'upstream', upstreamStatus: 400 });

		fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
		expect(await read(await proxySessionRequest(ask({ site }), opts()))).toEqual({ status: 502, body: { error: 'unreachable' } });

		fetchMock.mockImplementationOnce(
			(_url, init) =>
				new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal?.reason)))
		);
		const timedOut = await proxySessionRequest(ask({ site }), opts({ timeoutMs: 5 }));
		expect((await read(timedOut)).body).toEqual({ error: 'unreachable' });
	});

	it('stops reading an answer that is far too large', async () => {
		let sent = 0;
		const chunk = new TextEncoder().encode('x'.repeat(64 * 1024));
		const huge = new ReadableStream<Uint8Array>({
			pull(c) {
				if (sent >= 20 * 1024 * 1024) return c.close();
				sent += chunk.length;
				c.enqueue(chunk);
			}
		});
		fetchMock.mockResolvedValue(new Response(huge, { status: 200 }));
		const res = await proxySessionRequest(ask({ site: 'studio.shotgrid.autodesk.com' }), opts());
		expect(await read(res)).toEqual({ status: 502, body: { error: 'bad-answer' } });
		expect(sent).toBeLessThan(1024 * 1024);
	});
});

describe('session poll', () => {
	const site = 'studio.shotgrid.autodesk.com';

	it('PUTs the one request id and passes on pending', async () => {
		fetchMock.mockResolvedValue(answer(200, { approved: false }));
		const res = await proxySessionPoll(poll({ site, id: ID }), opts());
		expect(await read(res)).toEqual({ status: 200, body: { approved: false } });
		const [url, init] = fetchMock.mock.calls[0];
		expect(String(url)).toBe(`${SITE}/internal_api/app_session_request/${ID}`);
		expect(init?.method).toBe('PUT');
		expect(init?.redirect).toBe('manual');
		expect(init?.body).toBeUndefined();
	});

	it('passes on the token once, with no-store', async () => {
		fetchMock.mockResolvedValue(answer(200, { approved: true, sessionToken: 'tok', userLogin: 'someone@example.com' }));
		const res = await proxySessionPoll(poll({ site, id: ID }), opts());
		expect(res.headers.get('cache-control')).toBe('no-store');
		expect((await read(res)).body).toEqual({ approved: true, sessionToken: 'tok', userLogin: 'someone@example.com' });
	});

	it('answers 404 gone when the site forgot the request', async () => {
		fetchMock.mockResolvedValue(answer(404, { message: 'Not Found' }));
		expect(await read(await proxySessionPoll(poll({ site, id: ID }), opts()))).toEqual({ status: 404, body: { error: 'gone' } });
	});

	it('refuses an id that could change the path, without a fetch', async () => {
		for (const id of ['../session', 'a/b', '', 'a?x=1', 12, null]) {
			expect((await read(await proxySessionPoll(poll({ site, id }), opts()))).body, String(id)).toEqual({ error: 'bad-request' });
		}
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('refuses a host off the list without a fetch', async () => {
		expect((await proxySessionPoll(poll({ site: 'evil.example', id: ID }), opts())).status).toBe(403);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('does not follow a redirect', async () => {
		fetchMock.mockResolvedValue(new Response(null, { status: 307, headers: { location: 'https://evil.example/' } }));
		expect((await read(await proxySessionPoll(poll({ site, id: ID }), opts()))).body).toEqual({ error: 'redirect' });
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});

import { describe, expect, it, vi, type Mock } from 'vitest';
import { requestSignIn, SignInError, waitForApproval } from './sign-in';

const SITE = 'https://studio.shotgrid.autodesk.com';
const ID = 'a1b2c3';
const URL_ = `${SITE}/app_session_request/${ID}?sticky_id=${ID}`;
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

function deps(fetchMock: Mock<typeof fetch>, extra = {}) {
	let t = 0;
	return {
		fetch: fetchMock,
		sleep: vi.fn(async (ms: number) => void (t += ms)),
		now: () => t,
		...extra
	};
}

async function failure(p: Promise<unknown>): Promise<SignInError> {
	const error = await p.then(
		() => null,
		(e: unknown) => e
	);
	expect(error).toBeInstanceOf(SignInError);
	return error as SignInError;
}

describe('requestSignIn', () => {
	it('sends the normalized site to this app’s endpoint and returns the approval page', async () => {
		const f = vi.fn<typeof fetch>().mockResolvedValue(json(200, { id: ID, url: URL_ }));
		expect(await requestSignIn(' Studio.ShotGrid.Autodesk.com/ ', deps(f))).toEqual({ site: SITE, id: ID, url: URL_ });
		const [path, init] = f.mock.calls[0];
		expect(path).toBe('/auth/session-request');
		expect(init?.method).toBe('POST');
		expect(JSON.parse(String(init?.body))).toEqual({ site: SITE });
	});

	it('refuses a malformed site before any call', async () => {
		const f = vi.fn<typeof fetch>();
		const e = await failure(requestSignIn('http://studio.shotgrid.autodesk.com', deps(f)));
		expect([e.code, e.reason]).toEqual(['bad-site', 'not-https']);
		expect(f).not.toHaveBeenCalled();
	});

	it('maps the server’s refusals', async () => {
		const cases: [Response, string, string?][] = [
			[json(403, { error: 'not-allowed' }), 'not-allowed'],
			[json(400, { error: 'bad-site', reason: 'ip' }), 'bad-site', 'ip'],
			[json(502, { error: 'unreachable' }), 'unreachable'],
			[json(502, { error: 'upstream', upstreamStatus: 400 }), 'refused', 'upstream'],
			[json(502, { error: 'redirect' }), 'refused', 'redirect'],
			[new Response('<html>', { status: 500 }), 'refused']
		];
		for (const [res, code, reason] of cases) {
			const e = await failure(requestSignIn('studio.shotgrid.autodesk.com', deps(vi.fn<typeof fetch>().mockResolvedValue(res))));
			expect([e.code, e.reason], code).toEqual([code, reason]);
		}
	});

	it('says offline when this app’s server cannot be reached', async () => {
		const f = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'));
		expect((await failure(requestSignIn('studio.shotgrid.autodesk.com', deps(f)))).code).toBe('offline');
	});
});

describe('waitForApproval', () => {
	const pending = { site: SITE, id: ID, url: URL_ };

	it('polls until approved and returns who and the token', async () => {
		const f = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(json(200, { approved: false }))
			.mockResolvedValueOnce(json(200, { approved: false }))
			.mockResolvedValueOnce(json(200, { approved: true, sessionToken: 'tok', userLogin: 'someone@example.com' }));
		const d = deps(f);
		expect(await waitForApproval(pending, d)).toEqual({ site: SITE, user: 'someone@example.com', token: 'tok' });
		expect(f).toHaveBeenCalledTimes(3);
		expect(f.mock.calls[0][0]).toBe('/auth/session-poll');
		expect(JSON.parse(String(f.mock.calls[0][1]?.body))).toEqual({ site: SITE, id: ID });
		expect(d.sleep).toHaveBeenCalledWith(2000, undefined);
	});

	it('stops on gone: denied, forgotten and spent read the same', async () => {
		const f = vi.fn<typeof fetch>().mockResolvedValue(json(404, { error: 'gone' }));
		expect((await failure(waitForApproval(pending, deps(f)))).code).toBe('gone');
	});

	it('gives up after five minutes, the life of a pending request', async () => {
		const f = vi.fn<typeof fetch>().mockImplementation(async () => json(200, { approved: false }));
		expect((await failure(waitForApproval(pending, deps(f)))).code).toBe('timeout');
		expect(f.mock.calls.length).toBe(150);
	});

	it('stops when cancelled', async () => {
		const controller = new AbortController();
		const f = vi.fn<typeof fetch>().mockImplementation(async () => {
			controller.abort();
			return json(200, { approved: false });
		});
		expect((await failure(waitForApproval(pending, deps(f, { signal: controller.signal })))).code).toBe('cancelled');
		expect(f).toHaveBeenCalledTimes(1);
	});
});

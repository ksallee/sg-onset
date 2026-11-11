import { describe, expect, it } from 'vitest';
import {
	APP_NAME,
	forwardable,
	LAUNCHER_PATH,
	proxyError,
	readSessionPoll,
	readSessionRequest,
	sessionPollCall,
	sessionRequestCall
} from './launcher';

const SITE = 'https://studio.shotgrid.autodesk.com';
const ID = 'a1b2c3d4e5';

describe('the two calls the proxy may make', () => {
	it('asks for a session with the app name fixed by the server', () => {
		expect(APP_NAME).toBe('SG OnSet');
		expect(sessionRequestCall()).toEqual({
			method: 'POST',
			path: '/internal_api/app_session_request',
			form: { appName: 'SG OnSet', machineId: 'sg-onset' }
		});
	});

	it('polls one request id, and only an id that cannot carry a path', () => {
		expect(sessionPollCall(ID)).toEqual({ method: 'PUT', path: `${LAUNCHER_PATH}/${ID}` });
		expect(sessionPollCall('abc_DEF-123')).toEqual({ method: 'PUT', path: `${LAUNCHER_PATH}/abc_DEF-123` });
		for (const bad of ['', '../session', 'a/b', 'a?b', 'a#b', 'a%2fb', 'a.b', ' a', 'x'.repeat(129), 7, null, undefined, {}]) {
			expect(sessionPollCall(bad), JSON.stringify(bad)).toBeNull();
		}
	});
});

describe('forwardable', () => {
	it('allows the launcher request and its poll, each with its one method', () => {
		expect(forwardable('POST', LAUNCHER_PATH)).toBe(true);
		expect(forwardable('PUT', `${LAUNCHER_PATH}/${ID}`)).toBe(true);
	});

	it('refuses every other method on those paths', () => {
		for (const m of ['GET', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'post']) expect(forwardable(m, LAUNCHER_PATH), m).toBe(false);
		for (const m of ['GET', 'POST', 'DELETE', 'PATCH', 'put']) expect(forwardable(m, `${LAUNCHER_PATH}/${ID}`), m).toBe(false);
	});

	it('refuses every other path', () => {
		for (const path of [
			'/',
			'/api/v1/auth/access_token',
			'/api/v1/entity/projects',
			'/internal_api/session',
			'/internal_api/autodesk_identity/license_renewal',
			`${LAUNCHER_PATH}/`,
			`${LAUNCHER_PATH}/${ID}/x`,
			`${LAUNCHER_PATH}/../session`,
			`${LAUNCHER_PATH}?x=1`,
			`${LAUNCHER_PATH}/${ID}?x=1`,
			`//evil.example${LAUNCHER_PATH}`,
			`${LAUNCHER_PATH}s`
		]) {
			expect(forwardable('POST', path), path).toBe(false);
			expect(forwardable('PUT', path), path).toBe(false);
		}
	});
});

describe('readSessionRequest', () => {
	// findings/052_app_session_launcher.md: 200 {"sessionRequestId","url":"<site>/app_session_request/<id>?sticky_id=<id>"}
	const body = (url: string, id = ID) => JSON.stringify({ sessionRequestId: id, url });

	it('passes on the id and the approval page', () => {
		const url = `${SITE}/app_session_request/${ID}?sticky_id=${ID}`;
		expect(readSessionRequest(200, body(url), SITE)).toEqual({ status: 200, body: { id: ID, url } });
	});

	it('refuses an approval page on another host, scheme or path', () => {
		for (const url of [
			`https://evil.example/app_session_request/${ID}`,
			`http://studio.shotgrid.autodesk.com/app_session_request/${ID}`,
			`https://other.shotgrid.autodesk.com/app_session_request/${ID}`,
			`https://studio.shotgrid.autodesk.com:8443/app_session_request/${ID}`,
			`https://user@studio.shotgrid.autodesk.com/app_session_request/${ID}`,
			`${SITE}/user/login`,
			`javascript:alert(1)`,
			`/app_session_request/${ID}`,
			'not a url'
		]) {
			expect(readSessionRequest(200, body(url), SITE), url).toEqual(proxyError('bad-answer'));
		}
	});

	it('refuses an answer without a usable id or url', () => {
		const url = `${SITE}/app_session_request/${ID}`;
		expect(readSessionRequest(200, body(url, '../x'), SITE)).toEqual(proxyError('bad-answer'));
		expect(readSessionRequest(200, JSON.stringify({ url }), SITE)).toEqual(proxyError('bad-answer'));
		expect(readSessionRequest(200, JSON.stringify({ sessionRequestId: ID }), SITE)).toEqual(proxyError('bad-answer'));
		expect(readSessionRequest(200, '<html>', SITE)).toEqual(proxyError('bad-answer'));
		expect(readSessionRequest(200, '', SITE)).toEqual(proxyError('bad-answer'));
	});

	it('maps a refusal to 502 with the status the site gave', () => {
		// The launcher answers {"message": ...}, not errors[] (findings/052).
		expect(readSessionRequest(400, '{"message":"Missing params: appName, machineId"}', SITE)).toEqual({
			status: 502,
			body: { error: 'upstream', upstreamStatus: 400 }
		});
		expect(readSessionRequest(503, 'down', SITE)).toEqual({ status: 502, body: { error: 'upstream', upstreamStatus: 503 } });
	});
});

describe('readSessionPoll', () => {
	it('passes on a pending request', () => {
		expect(readSessionPoll(200, '{"approved":false}')).toEqual({ status: 200, body: { approved: false } });
	});

	it('passes on the token once approved, and nothing else the site sent', () => {
		const text = JSON.stringify({ approved: true, sessionToken: 'tok', userLogin: 'someone@example.com', extra: 1 });
		expect(readSessionPoll(200, text)).toEqual({
			status: 200,
			body: { approved: true, sessionToken: 'tok', userLogin: 'someone@example.com' }
		});
	});

	it('says gone on 404: spent, denied, forgotten and unknown read the same (findings/052)', () => {
		expect(readSessionPoll(404, '{"message":"Not Found"}')).toEqual(proxyError('gone'));
	});

	it('refuses an approval without a token or login, or a body that is not JSON', () => {
		expect(readSessionPoll(200, '{"approved":true,"userLogin":"x"}')).toEqual(proxyError('bad-answer'));
		expect(readSessionPoll(200, '{"approved":true,"sessionToken":"t"}')).toEqual(proxyError('bad-answer'));
		expect(readSessionPoll(200, '{"approved":true,"sessionToken":"","userLogin":"x"}')).toEqual(proxyError('bad-answer'));
		expect(readSessionPoll(200, 'nope')).toEqual(proxyError('bad-answer'));
	});

	it('maps anything else to 502', () => {
		expect(readSessionPoll(500, '')).toEqual({ status: 502, body: { error: 'upstream', upstreamStatus: 500 } });
	});
});

describe('proxyError', () => {
	it('gives each refusal its status', () => {
		expect(proxyError('bad-request')).toEqual({ status: 400, body: { error: 'bad-request' } });
		expect(proxyError('bad-site', { reason: 'ip' })).toEqual({ status: 400, body: { error: 'bad-site', reason: 'ip' } });
		expect(proxyError('not-allowed').status).toBe(403);
		expect(proxyError('cross-origin').status).toBe(403);
		expect(proxyError('unsupported-type').status).toBe(415);
		expect(proxyError('too-large').status).toBe(413);
		expect(proxyError('gone').status).toBe(404);
		expect(proxyError('redirect').status).toBe(502);
		expect(proxyError('unreachable').status).toBe(502);
		expect(proxyError('bad-answer').status).toBe(502);
	});
});

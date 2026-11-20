import { describe, expect, it } from 'vitest';
import { crossSiteForm } from './csrf';

const APP = 'https://onset.example';
const ask = (method: string, path: string, headers: Record<string, string>) => new Request(`${APP}${path}`, { method, headers, ...(method === 'GET' || method === 'HEAD' ? {} : { body: 'a=1' }) });
const OPEN = ['/action/send-set-data'];

describe('crossSiteForm', () => {
	it('refuses a form posted from another origin, as SvelteKit does', () => {
		for (const type of ['application/x-www-form-urlencoded', 'multipart/form-data; boundary=x', 'text/plain;charset=UTF-8', 'APPLICATION/X-WWW-FORM-URLENCODED', 'application/x-sveltekit-formdata']) {
			expect(crossSiteForm(ask('POST', '/auth/session-request', { 'content-type': type, origin: 'https://evil.example' }), OPEN)).toBe(true);
		}
		for (const method of ['PUT', 'PATCH', 'DELETE']) {
			expect(crossSiteForm(ask(method, '/auth/session-poll', { 'content-type': 'text/plain', origin: 'null' }), OPEN)).toBe(true);
		}
		// No origin at all is refused too.
		expect(crossSiteForm(ask('POST', '/auth/session-request', { 'content-type': 'text/plain' }), OPEN)).toBe(true);
	});

	it('lets a same-origin form, a JSON call and a read through', () => {
		expect(crossSiteForm(ask('POST', '/auth/session-request', { 'content-type': 'application/x-www-form-urlencoded', origin: APP }), OPEN)).toBe(false);
		expect(crossSiteForm(ask('POST', '/auth/session-request', { 'content-type': 'application/json', origin: 'https://evil.example' }), OPEN)).toBe(false);
		expect(crossSiteForm(ask('GET', '/send-set-data', { origin: 'https://evil.example' }), OPEN)).toBe(false);
	});

	it('lets Flow PT post its form to the action route only: Origin null, cross-site (findings/156)', () => {
		const flow = { 'content-type': 'application/x-www-form-urlencoded', origin: 'null', 'sec-fetch-site': 'cross-site' };
		expect(crossSiteForm(ask('POST', '/action/send-set-data', flow), OPEN)).toBe(false);
		expect(crossSiteForm(ask('POST', '/action/send-set-data/', flow), OPEN)).toBe(true);
		expect(crossSiteForm(ask('POST', '/action/send-set-data/x', flow), OPEN)).toBe(true);
		expect(crossSiteForm(ask('POST', '/auth/session-request', flow), OPEN)).toBe(true);
		// Only a POST is let through there.
		expect(crossSiteForm(ask('PUT', '/action/send-set-data', flow), OPEN)).toBe(true);
	});
});

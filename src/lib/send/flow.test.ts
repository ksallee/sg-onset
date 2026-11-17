import { describe, expect, it } from 'vitest';
import { TransportError } from '$lib/outbox/transport';
import { failureOf, sessionNeed } from './flow';

const SITE = 'https://studio.shotgrid.autodesk.com';

describe('sessionNeed', () => {
	it('signed in to that site: go on', () => {
		expect(sessionNeed({ status: 'signed-in', site: SITE }, SITE)).toBe('ready');
	});
	it('signed in to another site: sign in to this one, which replaces it', () => {
		expect(sessionNeed({ status: 'signed-in', site: 'https://other.shotgrid.autodesk.com' }, SITE)).toBe('other');
	});
	it('that site’s session ended: sign in again', () => {
		expect(sessionNeed({ status: 'expired', site: SITE }, SITE)).toBe('expired');
	});
	it('signed out, here or of another site: sign in', () => {
		expect(sessionNeed({ status: 'signed-out', site: SITE }, SITE)).toBe('signIn');
		expect(sessionNeed({ status: 'signed-out', site: null }, SITE)).toBe('signIn');
		expect(sessionNeed({ status: 'expired', site: 'https://other.shotgrid.autodesk.com' }, SITE)).toBe('signIn');
	});
});

describe('failureOf', () => {
	it('no answer: offline or Flow PT silent', () => {
		expect(failureOf(new TransportError('unreachable'), { online: false, step: 'read' })).toBe('offline');
		expect(failureOf(new TransportError('unreachable'), { online: true, step: 'read' })).toBe('unreachable');
		expect(failureOf(new TransportError('timeout'), { online: true, step: 'read' })).toBe('unreachable');
	});
	it('a session refused: sign in again', () => {
		expect(failureOf(new TransportError('unauthorized'), { online: true, step: 'read' })).toBe('session');
	});
	it('a site not set up, read from its schema', () => {
		expect(failureOf(new TransportError('failed', 'Flow Production Tracking is not set up for SG OnSet. Missing: x.'), { online: true, step: 'schema' })).toBe('setup');
	});
	it('anything else is a refusal', () => {
		expect(failureOf(new TransportError('failed', 'HTTP 500'), { online: true, step: 'read' })).toBe('refused');
		expect(failureOf(new Error('boom'), { online: true, step: 'read' })).toBe('refused');
	});
});

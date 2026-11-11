import { describe, expect, it } from 'vitest';
import { approvalUrlOk, failureKind, flow, returnPath, tabPlan, START, type FlowState } from './signInFlow';

const pending = { site: 'https://studio.shotgrid.autodesk.com', id: 'abc', url: 'https://studio.shotgrid.autodesk.com/app_session_launcher/abc' };
const asking: FlowState = { step: 'asking', host: 'studio.shotgrid.autodesk.com' };
const waiting: FlowState = { step: 'waiting', pending, tab: 'opened', offline: false };

describe('flow', () => {
	it('goes from the form to asking, waiting and approved', () => {
		let s = flow(START, { type: 'submit', host: 'studio.shotgrid.autodesk.com' });
		expect(s).toEqual(asking);
		s = flow(s, { type: 'requested', pending, tab: 'opened' });
		expect(s).toEqual(waiting);
		s = flow(s, { type: 'approved', user: 'ada@studio.example', site: pending.site });
		expect(s).toEqual({ step: 'approved', user: 'ada@studio.example', site: pending.site });
	});

	it('takes one submit: a second tap changes nothing', () => {
		expect(flow(asking, { type: 'submit', host: 'other.shotgrid.autodesk.com' })).toBe(asking);
		expect(flow(waiting, { type: 'submit', host: 'other.shotgrid.autodesk.com' })).toBe(waiting);
	});

	it('keeps the blocked tab in view until it is opened by hand', () => {
		const blocked = flow(asking, { type: 'requested', pending, tab: 'blocked' });
		expect(blocked).toMatchObject({ step: 'waiting', tab: 'blocked' });
		expect(flow(blocked, { type: 'reopened' })).toMatchObject({ step: 'waiting', tab: 'opened' });
	});

	it('returns to the form with the reason when it fails', () => {
		expect(flow(asking, { type: 'failed', code: 'bad-site', reason: 'port' })).toEqual({ step: 'form', problem: { code: 'bad-site', reason: 'port' } });
		expect(flow(waiting, { type: 'failed', code: 'timeout' })).toEqual({ step: 'form', problem: { code: 'timeout' } });
		expect(flow(waiting, { type: 'failed', code: 'gone' })).toEqual({ step: 'form', problem: { code: 'gone' } });
	});

	it('says nothing after a cancel', () => {
		expect(flow(waiting, { type: 'cancel' })).toEqual(START);
		expect(flow(asking, { type: 'cancel' })).toEqual(START);
		expect(flow(waiting, { type: 'failed', code: 'cancelled' })).toEqual(START);
	});

	it('waits through a lost network while a request is pending, and fails at once before one', () => {
		const off = flow(waiting, { type: 'failed', code: 'offline' });
		expect(off).toEqual({ ...waiting, offline: true });
		expect(flow(off, { type: 'online' })).toEqual(waiting);
		expect(flow(asking, { type: 'failed', code: 'offline' })).toEqual({ step: 'form', problem: { code: 'offline' } });
	});

	it('clears the reason once the site is typed again', () => {
		expect(flow({ step: 'form', problem: { code: 'refused' } }, { type: 'edit' })).toEqual(START);
		expect(flow(START, { type: 'edit' })).toBe(START);
	});

	it('ignores what cannot happen in a step', () => {
		expect(flow(START, { type: 'approved', user: 'a', site: 'b' })).toBe(START);
		expect(flow(START, { type: 'requested', pending, tab: 'opened' })).toBe(START);
		const done: FlowState = { step: 'approved', user: 'a', site: 'b' };
		expect(flow(done, { type: 'failed', code: 'timeout' })).toBe(done);
		expect(flow(done, { type: 'cancel' })).toBe(done);
	});
});

describe('tabPlan', () => {
	it('opens the tab from the tap in a browser, and offers a link on the Home Screen', () => {
		expect(tabPlan({ standalone: false })).toBe('preopen');
		expect(tabPlan({ standalone: true })).toBe('link');
	});
});

describe('approvalUrlOk', () => {
	it('takes an https page on the site itself', () => {
		expect(approvalUrlOk(pending)).toBe(true);
	});
	it('refuses another host, another scheme and what is not a url', () => {
		expect(approvalUrlOk({ ...pending, url: 'https://evil.example/approve' })).toBe(false);
		expect(approvalUrlOk({ ...pending, url: 'http://studio.shotgrid.autodesk.com/x' })).toBe(false);
		expect(approvalUrlOk({ ...pending, url: 'javascript:alert(1)' })).toBe(false);
		expect(approvalUrlOk({ ...pending, url: '' })).toBe(false);
	});
});

describe('returnPath', () => {
	it('prefers what the link asked for, then where the person came from, then Settings', () => {
		expect(returnPath('/slates', '/shoot')).toBe('/slates');
		expect(returnPath(null, '/shoot')).toBe('/shoot');
		expect(returnPath(null, null)).toBe('/settings');
	});
	it('takes a path of this app only', () => {
		expect(returnPath('https://evil.example/', null)).toBe('/settings');
		expect(returnPath('//evil.example/', null)).toBe('/settings');
		expect(returnPath('/\\evil.example', null)).toBe('/settings');
		expect(returnPath('slates', null)).toBe('/settings');
	});
	it('never returns to sign-in or the first run', () => {
		expect(returnPath('/sign-in', '/sign-in')).toBe('/settings');
		expect(returnPath('/welcome', null)).toBe('/settings');
		expect(returnPath(null, '/')).toBe('/settings');
	});
	it('keeps a slate page and its query', () => {
		expect(returnPath('/slates/abc-123?tab=takes', null)).toBe('/slates/abc-123?tab=takes');
	});
});

describe('failureKind', () => {
	it('groups the failures by what the person can do', () => {
		expect(failureKind('timeout')).toBe('expired');
		expect(failureKind('gone')).toBe('expired');
		expect(failureKind('offline')).toBe('offline');
		expect(failureKind('unreachable')).toBe('site');
		expect(failureKind('bad-site')).toBe('site');
		expect(failureKind('not-allowed')).toBe('site');
		expect(failureKind('refused')).toBe('refused');
		expect(failureKind('cancelled')).toBe('none');
	});
});

import { describe, expect, it } from 'vitest';
import { tk } from '$lib/i18n/messages';
import { syncStatus, type SyncInputs } from './status';

const base: SyncInputs = { auth: 'signed-in', linked: true, ready: true, online: true, unsynced: { entries: 0, attention: 0 } };
const at = (over: Partial<SyncInputs>) => syncStatus({ ...base, ...over });

describe('syncStatus', () => {
	it('says all synced when nothing waits and sync can run', () => {
		expect(at({})).toEqual({ state: 'synced', count: 0, key: 'sync.state.synced', shortKey: 'sync.state.short.synced', openKey: 'sync.open' });
	});
	it('counts what is syncing', () => {
		expect(at({ unsynced: { entries: 4, attention: 0 } })).toMatchObject({ state: 'syncing', count: 4, key: 'sync.state.syncing' });
	});
	it('says what stops sync, first the account, then the link, then the setup, then the network', () => {
		expect(at({ auth: 'signed-out', linked: false, ready: false, online: false }).state).toBe('signedOut');
		expect(at({ auth: 'expired', linked: false, ready: false, online: false }).state).toBe('expired');
		expect(at({ linked: false, ready: false, online: false }).state).toBe('unlinked');
		expect(at({ ready: false, online: false }).state).toBe('setup');
		expect(at({ online: false }).state).toBe('offline');
	});
	it('counts what waits on the device whatever stops sync', () => {
		expect(at({ auth: 'signed-out', unsynced: { entries: 25, attention: 0 } })).toMatchObject({ state: 'signedOut', count: 25 });
		expect(at({ online: false, unsynced: { entries: 3, attention: 0 } })).toMatchObject({ state: 'offline', count: 3 });
	});
	it('puts what needs a person first, and counts that', () => {
		expect(at({ unsynced: { entries: 9, attention: 2 } })).toMatchObject({ state: 'attention', count: 2, key: 'sync.state.attention' });
		expect(at({ auth: 'signed-out', unsynced: { entries: 9, attention: 1 } }).state).toBe('attention');
	});
	it('reads no counts yet as nothing waiting', () => {
		expect(at({ unsynced: undefined })).toMatchObject({ state: 'synced', count: 0 });
	});

	// Kevin, #117: what waits for an entity the site lacks is named, so nobody takes it for safe in
	// Flow PT: "All synced, 3 waiting". Only records of the queue wait so: the set references on a
	// site without Set Reference. A Set Shot's links are no record; they wait in the slates' codes.
	it('says all synced and names what waits for an entity the site lacks', () => {
		expect(at({ waiting: 3 })).toEqual({ state: 'waiting', count: 3, key: 'sync.state.waiting', shortKey: 'sync.state.short.waiting', openKey: 'sync.open' });
		expect(tk('sync.state.waiting', { n: 3 })).toBe('All synced, 3 waiting');
		expect(at({ waiting: 0 }).state).toBe('synced');
	});

	it('counts what syncs while it syncs, and names what waits once it is done', () => {
		expect(at({ unsynced: { entries: 4, attention: 0 }, waiting: 3 })).toMatchObject({ state: 'syncing', count: 4 });
	});

	it('counts what waits for an entity with the rest on the device when sync is stopped', () => {
		expect(at({ online: false, unsynced: { entries: 2, attention: 0 }, waiting: 3 })).toMatchObject({ state: 'offline', count: 5, openKey: 'sync.state.open' });
		expect(at({ auth: 'expired', waiting: 3 })).toMatchObject({ state: 'expired', count: 3 });
	});

	it('still puts what needs a person first', () => {
		expect(at({ unsynced: { entries: 0, attention: 1 }, waiting: 3 })).toMatchObject({ state: 'attention', count: 1, openKey: 'sync.open' });
	});
});

// The accessible name of the status: the count is said apart only where the words do not say it.
describe('syncStatus: openKey', () => {
	it('adds the count where the words leave it out, and only then', () => {
		expect(at({ online: false, unsynced: { entries: 3, attention: 0 } }).openKey).toBe('sync.state.open');
		expect(at({ online: false }).openKey).toBe('sync.open');
		expect(at({ unsynced: { entries: 4, attention: 0 } }).openKey).toBe('sync.open');
		expect(at({ unsynced: { entries: 4, attention: 2 } }).openKey).toBe('sync.open');
		expect(at({ waiting: 3 }).openKey).toBe('sync.open');
	});
});

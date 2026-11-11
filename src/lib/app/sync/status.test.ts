import { describe, expect, it } from 'vitest';
import { syncStatus, type SyncInputs } from './status';

const base: SyncInputs = { auth: 'signed-in', linked: true, ready: true, online: true, unsynced: { entries: 0, attention: 0 } };
const at = (over: Partial<SyncInputs>) => syncStatus({ ...base, ...over });

describe('syncStatus', () => {
	it('says all synced when nothing waits and sync can run', () => {
		expect(at({})).toEqual({ state: 'synced', count: 0, key: 'sync.state.synced', shortKey: 'sync.state.short.synced' });
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
});

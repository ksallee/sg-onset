import { describe, expect, it } from 'vitest';
import { DEVICE_GROUPS, ON_SET, accountRows, sampleAction, sampleRemoval, versionLabel } from './groups';

describe('order', () => {
	it('lists what changes on set first, by how often', () => {
		expect(ON_SET).toEqual(['hand', 'buttonSize', 'appearance', 'night', 'motion', 'units']);
	});
	it('then the project, Flow PT, the safety of the data, snapshots, backup, storage and about', () => {
		expect(DEVICE_GROUPS).toEqual(['project', 'flowpt', 'safety', 'snapshots', 'backup', 'storage', 'about']);
	});
});

describe('sampleAction', () => {
	it('offers to delete the sample when the device holds it, else nothing', () => {
		expect(sampleAction(true)).toBe('delete');
		expect(sampleAction(false)).toBe('none');
	});
});

describe('sampleRemoval', () => {
	it('deletes with an undo when another project stays', () => {
		expect(sampleRemoval(2)).toBe('undo');
		expect(sampleRemoval(200)).toBe('undo');
	});
	it('asks first when it is the only project: the app returns to the first run', () => {
		expect(sampleRemoval(1)).toBe('confirm');
		expect(sampleRemoval(0)).toBe('confirm');
	});
});

describe('accountRows', () => {
	it('shows who and where when signed in', () => {
		expect(accountRows('signed-in')).toEqual(['account', 'sync']);
	});
	it('offers to sign in when signed out, and again when the session expired', () => {
		expect(accountRows('signed-out')).toEqual(['signIn', 'sync']);
		expect(accountRows('expired')).toEqual(['signInAgain', 'sync']);
	});
});

describe('versionLabel', () => {
	it('says the release and the day it was built', () => {
		expect(versionLabel('0.0.1', String(Date.UTC(2026, 10, 11, 12)))).toBe('0.0.1 · 11 Nov 2026');
	});
	it('shows a build name that is not a time as it is, cut short', () => {
		expect(versionLabel('0.0.1', 'a1b2c3d4e5f6a7b8')).toBe('0.0.1 · a1b2c3d');
		expect(versionLabel('0.0.1', '')).toBe('0.0.1');
	});
});

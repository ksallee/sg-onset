import { describe, expect, it } from 'vitest';
import type { CameraSetup } from '$lib/model/types';
import { chosenSetups, leaveOff, parseShooting, serializeShooting, setShooting, shootsWith, SHOOTING_KEY } from './shooting';

const setup = (id: string, projectId = 'p1'): CameraSetup => ({ id, projectId, cameraLabel: id });

// Kevin, #110: every device sees every camera setup; each chooses the ones it shoots with, on the
// device. By default the setups made on it: one read back from another device starts unchosen.
describe('shootsWith', () => {
	it('shoots with every setup by default: those made here', () => {
		expect(shootsWith({}, 'p1', 'A')).toBe(true);
	});

	it('leaves out what was turned off, for that project only', () => {
		const s = setShooting({}, 'p1', 'A', false);
		expect(shootsWith(s, 'p1', 'A')).toBe(false);
		expect(shootsWith(s, 'p2', 'A')).toBe(true);
		expect(shootsWith(setShooting(s, 'p1', 'A', true), 'p1', 'A')).toBe(true);
	});
});

describe('leaveOff', () => {
	it('starts a setup read back from another device unchosen here', () => {
		const s = leaveOff({}, 'p1', ['B', 'C']);
		expect(shootsWith(s, 'p1', 'B')).toBe(false);
		expect(shootsWith(s, 'p1', 'A')).toBe(true);
	});

	it('lists each once, and changes nothing for no setup', () => {
		const s = leaveOff(leaveOff({}, 'p1', ['B']), 'p1', ['B']);
		expect(s).toEqual({ p1: ['B'] });
		expect(leaveOff(s, 'p1', [])).toBe(s);
	});
});

describe('chosenSetups', () => {
	it('is the ids of the project’s setups this device shoots with', () => {
		const s = setShooting({}, 'p1', 'B', false);
		expect([...chosenSetups([setup('A'), setup('B'), setup('X', 'p2')], s, 'p1')]).toEqual(['A']);
	});
});

describe('parseShooting and serializeShooting', () => {
	it('reads back what it wrote', () => {
		const s = leaveOff({}, 'p1', ['B']);
		expect(parseShooting(serializeShooting(s))).toEqual(s);
	});

	it('reads nothing from what it cannot read, and drops what is not a list of ids', () => {
		expect(parseShooting(null)).toEqual({});
		expect(parseShooting('not json')).toEqual({});
		expect(parseShooting('[1]')).toEqual({});
		expect(parseShooting(JSON.stringify({ p1: ['A', 3, ''], p2: 'B' }))).toEqual({ p1: ['A'] });
	});

	it('is kept under its own key, on the device', () => {
		expect(SHOOTING_KEY).toBe('sg-onset.shooting');
	});
});

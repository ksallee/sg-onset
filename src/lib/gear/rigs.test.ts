import { describe, expect, it } from 'vitest';
import { isBuiltInRig, rigChoices, rigFromFlowPt, rigLabel, rigLabelKey, RIGS, rigProblem, rigToFlowPt } from './rigs';

/** Stand-in for the message catalogue: the key, so the test sees which rig it is. */
const label = (key: string) => `<${key}>`;

describe('RIGS', () => {
	it('are the 18 built-in rigs, in the order Kevin listed them', () => {
		expect(RIGS).toEqual([
			'handheld',
			'shoulderRig',
			'easyrig',
			'steadicam',
			'gimbal',
			'tripod',
			'hiHat',
			'dolly',
			'slider',
			'jib',
			'crane',
			'technocrane',
			'carMount',
			'cameraCar',
			'drone',
			'cableCam',
			'motionControl',
			'underwaterHousing'
		]);
		expect(isBuiltInRig('steadicam')).toBe(true);
		expect(isBuiltInRig('Russian arm')).toBe(false);
	});
});

describe('rigChoices', () => {
	it('puts the project rigs after the built-in ones', () => {
		expect(rigChoices(['Russian arm', 'Spidercam'])).toEqual([...RIGS, 'Russian arm', 'Spidercam']);
	});

	it('is the built-in rigs alone when the project has none', () => {
		expect(rigChoices([])).toEqual([...RIGS]);
	});

	it('lists a project rig once, as first typed, and never one that names a built-in key', () => {
		expect(rigChoices([' Russian arm ', 'russian ARM', 'dolly', '', 'Spidercam']).filter((r) => !isBuiltInRig(r))).toEqual(['Russian arm', 'Spidercam']);
	});

	it('always holds every built-in rig, first and in order, and no name twice', () => {
		const lists = [[], ['Dolly'], ['dolly', 'DOLLY', ' dolly '], ['', ' ', 'a', 'A'], RIGS.map((r) => r.toUpperCase()), ['x', 'y', 'x ', 'Y']];
		for (const own of lists) {
			const choices = rigChoices(own);
			expect(choices.slice(0, RIGS.length)).toEqual([...RIGS]);
			expect(new Set(choices.map((c) => c.toLowerCase())).size).toBe(choices.length);
		}
	});
});

describe('rigLabel', () => {
	it('reads a built-in rig from the catalogue and shows a project rig as typed', () => {
		expect(rigLabelKey('hiHat')).toBe('gear.rig.hiHat');
		expect(rigLabelKey('Russian arm')).toBeUndefined();
		expect(rigLabel('hiHat', label)).toBe('<gear.rig.hiHat>');
		expect(rigLabel(' Russian arm ', label)).toBe('Russian arm');
	});

	it('shows no rig as nothing', () => {
		expect(rigLabel(undefined, label)).toBe('');
		expect(rigLabel('  ', label)).toBe('');
	});
});

describe('rigProblem', () => {
	const builtIn = (rig: string) => ({ hiHat: 'Hi-hat', shoulderRig: 'Shoulder rig', dolly: 'Dolly' })[rig] ?? rig;

	it('takes a new name', () => {
		expect(rigProblem('Russian arm', ['Spidercam'], builtIn)).toBeUndefined();
	});

	it('refuses an empty name', () => {
		expect(rigProblem('   ', [], builtIn)).toBe('empty');
	});

	it('refuses a name the project or the app already has, case and spaces ignored', () => {
		expect(rigProblem(' spidercam ', ['Spidercam'], builtIn)).toBe('taken');
		expect(rigProblem('hi-hat', [], builtIn)).toBe('taken');
		expect(rigProblem('Shoulder Rig', [], builtIn)).toBe('taken');
		expect(rigProblem('hiHat', [], builtIn)).toBe('taken');
	});
});

// Kevin, 2026-11-25 (#138): Flow PT keeps a built-in rig as words people read there.
describe('rigToFlowPt and rigFromFlowPt', () => {
	it('sends a built-in rig as its English label, a project rig as typed', () => {
		expect(rigToFlowPt('steadicam')).toBe('Steadicam');
		expect(rigToFlowPt('shoulderRig')).toBe('Shoulder rig');
		expect(rigToFlowPt('hiHat')).toBe('Hi-hat');
		expect(rigToFlowPt('Russian arm')).toBe('Russian arm');
	});

	it('reads a built-in label back as its key, case and outer spaces ignored', () => {
		expect(rigFromFlowPt('Steadicam')).toBe('steadicam');
		expect(rigFromFlowPt(' shoulder RIG ')).toBe('shoulderRig');
		expect(rigFromFlowPt('Hi-hat')).toBe('hiHat');
	});

	it('reads anything else as typed', () => {
		expect(rigFromFlowPt('Russian arm')).toBe('Russian arm');
	});

	it('gives every built-in rig back unchanged after a round trip', () => {
		for (const rig of RIGS) expect(rigFromFlowPt(rigToFlowPt(rig))).toBe(rig);
	});
});

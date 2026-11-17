import { describe, expect, it } from 'vitest';
import { isBuiltInKind, kindChoices, kindLabel, kindLabelKey, KINDS, kindProblem } from './kinds';

/** Stand-in for the message catalogue: the key, so the test sees which kind it is. */
const label = (key: string) => `<${key}>`;

describe('KINDS', () => {
	it('are the built-in kinds, in the order the supervisor listed them, Other last', () => {
		expect(KINDS).toEqual(['hdri360', 'video360', 'hdrReference', 'witnessCamera', 'lidarScan', 'texturedModel', 'photogrammetry', 'splat', 'other']);
		expect(isBuiltInKind('hdri360')).toBe(true);
		expect(isBuiltInKind('Drone survey')).toBe(false);
	});
});

describe('kindChoices', () => {
	it('puts the project kinds after the built-in ones and before Other', () => {
		expect(kindChoices(['Drone survey', 'Plate scan'])).toEqual([
			'hdri360',
			'video360',
			'hdrReference',
			'witnessCamera',
			'lidarScan',
			'texturedModel',
			'photogrammetry',
			'splat',
			'Drone survey',
			'Plate scan',
			'other'
		]);
	});

	it('is the built-in kinds alone when the project has none', () => {
		expect(kindChoices([])).toEqual([...KINDS]);
	});

	it('lists a project kind once, and never one that names a built-in key', () => {
		expect(kindChoices(['Drone', 'drone ', 'other', 'hdri360']).filter((k) => !isBuiltInKind(k))).toEqual(['Drone']);
	});
});

describe('kindLabel', () => {
	it('reads a built-in kind from the catalogue and shows a project kind as typed', () => {
		expect(kindLabelKey('lidarScan')).toBe('references.kind.lidarScan');
		expect(kindLabelKey('Drone survey')).toBeUndefined();
		expect(kindLabel('lidarScan', label)).toBe('<references.kind.lidarScan>');
		expect(kindLabel(' Drone survey ', label)).toBe('Drone survey');
	});

	it('shows no kind as Other', () => {
		expect(kindLabel(undefined, label)).toBe('<references.kind.other>');
		expect(kindLabel('  ', label)).toBe('<references.kind.other>');
	});
});

describe('kindProblem', () => {
	const builtIn = (kind: string) => ({ hdri360: 'HDRI 360', lidarScan: 'Lidar scan', other: 'Other' })[kind] ?? kind;

	it('takes a new name', () => {
		expect(kindProblem('Drone survey', ['Plate scan'], builtIn)).toBeUndefined();
	});

	it('refuses an empty name', () => {
		expect(kindProblem('   ', [], builtIn)).toBe('empty');
	});

	it('refuses a name the project or the app already has, case and spaces ignored', () => {
		expect(kindProblem(' plate SCAN ', ['Plate scan'], builtIn)).toBe('taken');
		expect(kindProblem('lidar scan', [], builtIn)).toBe('taken');
		expect(kindProblem('HDRI 360', [], builtIn)).toBe('taken');
		expect(kindProblem('hdri360', [], builtIn)).toBe('taken');
	});
});

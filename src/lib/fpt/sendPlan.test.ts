import { describe, expect, it } from 'vitest';
import { mergeSetShots, sendKind, sendScope, shotReports } from './sendPlan';
import type { SetShotRow } from './setShots';
import { RESOLUTION } from './testkit';

const set = (id: number, code: string, shots: [number, string][] = [], matched = false): SetShotRow => ({ id, key: `1:${code.toLowerCase()}`, code, shots: shots.map(([i, c]) => ({ id: i, code: c })), matched });

describe('sendKind', () => {
	it('Shot, or the site’s Set Shot slot; any other slot is not ours', () => {
		expect(sendKind('Shot', RESOLUTION)).toBe('shot');
		expect(sendKind('CustomEntity22', RESOLUTION)).toBe('setShot');
		expect(sendKind('CustomEntity09', RESOLUTION)).toBeUndefined();
		expect(sendKind('CustomEntity22', { ...RESOLUTION, entities: { ...RESOLUTION.entities, setShot: undefined } })).toBeUndefined();
	});
});

describe('mergeSetShots', () => {
	it('keeps each once, by id, the later list winning, in id order', () => {
		expect(mergeSetShots([set(3, 'B'), set(1, 'A')], [set(3, 'B', [[9, 'B']], true)])).toEqual([set(1, 'A'), set(3, 'B', [[9, 'B']], true)]);
	});
});

describe('sendScope', () => {
	it('on Shots: the Shots selected, and every Set Shot holding one of them', () => {
		const scope = sendScope({
			kind: 'shot',
			shots: [{ id: 10, code: 'SH010' }],
			setShots: [set(1, 'SH010', [[10, 'SH010']]), set(2, 'SH010B', [[10, 'SH010'], [11, 'SH011']]), set(3, 'SH020', [[20, 'SH020']]), set(4, 'SH030')]
		});
		expect(scope.shots).toEqual([{ id: 10, code: 'SH010' }]);
		expect(scope.setShots.map((s) => s.id)).toEqual([1, 2]);
	});

	it('on Set Shots: the Set Shots selected, and every Shot they hold, each once', () => {
		const scope = sendScope({
			kind: 'setShot',
			selected: [1, 2, 4],
			setShots: [set(1, 'SH010', [[10, 'SH010']]), set(2, 'SH010B', [[10, 'SH010'], [11, 'SH011']]), set(3, 'SH020', [[20, 'SH020']]), set(4, 'SH030')]
		});
		expect(scope.setShots.map((s) => s.id)).toEqual([1, 2, 4]);
		expect(scope.shots).toEqual([
			{ id: 10, code: 'SH010' },
			{ id: 11, code: 'SH011' }
		]);
	});
});

describe('shotReports', () => {
	const before = [set(1, 'SH010'), set(2, 'SH020', [[20, 'SH020']], true)];
	const after = [set(1, 'SH010', [[10, 'SH010']], true), set(2, 'SH020', [[20, 'SH020']], true)];
	const slates = [
		{ id: 100, setShots: [1, 2] },
		{ id: 101, setShots: [1] },
		{ id: 102, setShots: [] }
	];

	it('per Shot: whether this run linked its Set Shot, its slates, whether they all went, its Note', () => {
		const reports = shotReports({
			shots: [
				{ id: 10, code: 'SH010' },
				{ id: 20, code: 'SH020' },
				{ id: 30, code: 'SH030' }
			],
			before,
			after,
			slates,
			failedSlates: new Set([101]),
			notes: [
				{ shot: 10, outcome: 'created' },
				{ shot: 20, outcome: 'unchanged' },
				{ shot: 30, outcome: 'empty' }
			]
		});
		expect(reports).toEqual([
			{ shot: { id: 10, code: 'SH010' }, linked: true, setShots: 1, slates: 2, slatesFailed: true, note: 'created' },
			{ shot: { id: 20, code: 'SH020' }, linked: false, setShots: 1, slates: 1, slatesFailed: false, note: 'unchanged' },
			{ shot: { id: 30, code: 'SH030' }, linked: false, setShots: 0, slates: 0, slatesFailed: false, note: 'empty' }
		]);
	});

	it('the Notes wait on a site without their fields; a Shot the Notes left out failed', () => {
		const shots = [{ id: 10, code: 'SH010' }];
		expect(shotReports({ shots, before, after, slates, failedSlates: new Set(), notes: undefined })[0].note).toBe('waits');
		expect(shotReports({ shots, before, after, slates, failedSlates: new Set(), notes: [] })[0].note).toBe('failed');
	});

	it('sorted by code, as Flow PT sorts a Shot list', () => {
		const shots = [
			{ id: 30, code: 'SH100' },
			{ id: 10, code: 'SH020' },
			{ id: 20, code: 'sh030' }
		];
		expect(shotReports({ shots, before: [], after: [], slates: [], failedSlates: new Set(), notes: undefined }).map((r) => r.shot.code)).toEqual(['SH020', 'sh030', 'SH100']);
	});
});

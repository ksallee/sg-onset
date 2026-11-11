import { describe, expect, it } from 'vitest';
import type { CameraSetup, Take } from '$lib/model/types';
import { activeSetupIds, cameraColumns, groupTakes, NO_SETUP } from './groups';

const take = (id: string, number: string, setup: string | undefined, rest: Partial<Take> = {}): Take => ({
	id,
	slateId: 's',
	take: number,
	...(setup ? { cameraSetupId: setup } : {}),
	...rest
});
const setup = (id: string, cameraLabel: string): CameraSetup => ({ id, projectId: 'p', cameraLabel });
const at = (min: number) => new Date(Date.UTC(2026, 10, 11, 9, min)).toISOString();

describe('groupTakes', () => {
	it('puts the takes of one number together, one per setup', () => {
		const groups = groupTakes([take('a1', '1', 'A', { startedAt: at(0) }), take('b1', '1', 'B', { startedAt: at(0) }), take('a2', '2', 'A', { startedAt: at(5) })]);
		expect(groups.map((g) => g.number)).toEqual(['1', '2']);
		expect(groups[0].bySetup.A.id).toBe('a1');
		expect(groups[0].bySetup.B.id).toBe('b1');
		expect(groups[1].takes.map((t) => t.id)).toEqual(['a2']);
	});
	it('orders by the order shot, takes never started last, numbers counted', () => {
		const groups = groupTakes([take('x', '10', 'A'), take('y', '2', 'A', { startedAt: at(9) }), take('z', '9', 'A', { startedAt: at(1) })]);
		expect(groups.map((g) => g.number)).toEqual(['9', '2', '10']);
	});
	it('files a take with no setup under NO_SETUP', () => {
		const [g] = groupTakes([take('a', '1', undefined)]);
		expect(g.bySetup[NO_SETUP].id).toBe('a');
	});
	it('is empty for no takes', () => {
		expect(groupTakes([])).toEqual([]);
	});
});

describe('cameraColumns', () => {
	it('gives the setups by label, counted', () => {
		const cols = cameraColumns([setup('c', 'C'), setup('a10', 'A10'), setup('a2', 'A2')], []);
		expect(cols.map((c) => c.label)).toEqual(['A2', 'A10', 'C']);
	});
	it('adds a column for takes with no setup, and for a setup since deleted', () => {
		const groups = groupTakes([take('a', '1', undefined), take('b', '1', 'gone')]);
		const cols = cameraColumns([setup('A', 'A')], groups);
		expect(cols.map((c) => c.id)).toEqual(['A', 'gone', NO_SETUP]);
		expect(cols[1].setup).toBeUndefined();
	});
});

describe('activeSetupIds', () => {
	const setups = [setup('A', 'A'), setup('B', 'B'), setup('C', 'C')];
	it('is every setup on a slate with no takes', () => {
		expect(activeSetupIds([], setups)).toEqual(['A', 'B', 'C']);
	});
	it('is the setups on the last take, in column order', () => {
		const groups = groupTakes([take('a', '1', 'A', { startedAt: at(0) }), take('c', '1', 'C', { startedAt: at(0) }), take('b2', '2', 'B', { startedAt: at(3) }), take('a2', '2', 'A', { startedAt: at(3) })]);
		expect(activeSetupIds(groups, setups)).toEqual(['A', 'B']);
	});
	it('is no setup when the project has none', () => {
		expect(activeSetupIds([], [])).toEqual([NO_SETUP]);
	});
});

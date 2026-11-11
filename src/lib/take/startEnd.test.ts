import { describe, expect, it } from 'vitest';
import type { CameraSetup, Take } from '$lib/model/types';
import { groupTakes, NO_SETUP } from './groups';
import { addCameraTake, nextTakes, pressTarget, startEndPlan } from './startEnd';

const take = (id: string, number: string, setup: string, rest: Partial<Take> = {}): Take => ({ id, slateId: 's', take: number, cameraSetupId: setup, ...rest });
const setups: CameraSetup[] = [
	{ id: 'A', projectId: 'p', cameraLabel: 'A', cameraId: 'alexa', lensId: 'prime32' },
	{ id: 'B', projectId: 'p', cameraLabel: 'B', cameraId: 'mini', lensId: 'zoom' }
];
const T0 = '2026-11-11T09:00:00Z';
const T1 = '2026-11-11T09:01:00Z';
const AT = Date.UTC(2026, 10, 11, 9, 5, 3, 700);
const AT_S = '2026-11-11T09:05:03Z';
const ids = () => {
	let n = 0;
	return () => `new${++n}`;
};
const plan = (takes: Take[], selected?: string, active = ['A', 'B']) => startEndPlan({ groups: groupTakes(takes), selected, active, setups, slateId: 's', at: AT, newId: ids() });

describe('startEndPlan', () => {
	it('starts every camera of a take number that is ready', () => {
		const p = plan([take('a', '1', 'A'), take('b', '1', 'B')]);
		expect(p.kind).toBe('start');
		expect(p.number).toBe('1');
		expect(p.kind === 'start' && p.patch).toEqual([
			{ id: 'a', key: 'startedAt', from: undefined, to: AT_S },
			{ id: 'b', key: 'startedAt', from: undefined, to: AT_S }
		]);
	});
	it('ends every camera that is running, whichever take is on screen', () => {
		const p = plan([take('a1', '1', 'A', { startedAt: T0, endedAt: T1 }), take('a', '2', 'A', { startedAt: T0 }), take('b', '2', 'B', { startedAt: T0 })], '1');
		expect(p.kind).toBe('end');
		expect(p.number).toBe('2');
		expect(p.kind === 'end' && p.patch.map((c) => [c.id, c.key, c.to])).toEqual([
			['a', 'endedAt', AT_S],
			['b', 'endedAt', AT_S]
		]);
	});
	it('never ends before the start', () => {
		const p = plan([take('a', '1', 'A', { startedAt: '2026-11-11T10:00:00Z' })]);
		expect(p.kind === 'end' && p.patch[0].to).toBe('2026-11-11T10:00:00Z');
	});
	it('after an ended take, makes the next on every active camera and starts it', () => {
		const p = plan([take('a', '3', 'A', { startedAt: T0, endedAt: T1, tStop: 2.8, circleTake: true }), take('b', '3', 'B', { startedAt: T0, endedAt: T1, focalLength: 85 })]);
		expect(p.kind).toBe('startNext');
		expect(p.number).toBe('4');
		if (p.kind !== 'startNext') return;
		expect(p.creates).toEqual([
			{ id: 'new1', slateId: 's', take: '4', cameraSetupId: 'A', cameraId: 'alexa', lensId: 'prime32', tStop: 2.8, startedAt: AT_S },
			{ id: 'new2', slateId: 's', take: '4', cameraSetupId: 'B', cameraId: 'mini', lensId: 'zoom', focalLength: 85, startedAt: AT_S }
		]);
	});
	it('makes take 1 on a slate with no takes', () => {
		const p = plan([]);
		expect(p.kind === 'startNext' && p.creates.map((t) => [t.take, t.cameraSetupId])).toEqual([
			['1', 'A'],
			['1', 'B']
		]);
	});
	it('makes one take with no camera when the project has no setups', () => {
		const p = startEndPlan({ groups: [], active: [NO_SETUP], setups: [], slateId: 's', at: AT, newId: ids() });
		expect(p.kind === 'startNext' && p.creates).toEqual([{ id: 'new1', slateId: 's', take: '1', startedAt: AT_S }]);
	});
	it('starts the take on screen when it is ready, even if later ones exist', () => {
		const p = plan([take('a1', '1', 'A', { startedAt: T0, endedAt: T1 }), take('a2', '2', 'A')], '2');
		expect(p.kind).toBe('start');
		expect(p.number).toBe('2');
	});
});

describe('nextTakes', () => {
	it('takes the camera and lens from the setup, where a lens swap is made', () => {
		const swapped = [{ ...setups[0], lensId: 'prime50' }];
		const [next] = nextTakes({ groups: groupTakes([take('a', '1', 'A', { lensId: 'prime32' })]), active: ['A'], setups: swapped, slateId: 's', newId: ids() });
		expect(next).toMatchObject({ take: '2', lensId: 'prime50', cameraSetupId: 'A' });
		expect(next.startedAt).toBeUndefined();
	});
	it('starts a camera new to the slate from its setup alone', () => {
		const next = nextTakes({ groups: groupTakes([take('a', '1', 'A', { tStop: 4 })]), active: ['A', 'B'], setups, slateId: 's', newId: ids() });
		expect(next[1]).toEqual({ id: 'new2', slateId: 's', take: '2', cameraSetupId: 'B', cameraId: 'mini', lensId: 'zoom' });
	});
});

describe('addCameraTake', () => {
	it('puts a camera on a take number, sharing its times', () => {
		const groups = groupTakes([take('a', '2', 'A', { startedAt: T0, endedAt: T1 })]);
		const added = addCameraTake({ groups, number: '2', setupId: 'B', setups, slateId: 's', id: 'n' });
		expect(added).toEqual({ id: 'n', slateId: 's', take: '2', cameraSetupId: 'B', cameraId: 'mini', lensId: 'zoom', startedAt: T0, endedAt: T1 });
	});
});

describe('pressTarget', () => {
	it('says what the press does and to which take', () => {
		expect(pressTarget(groupTakes([]))).toEqual({ action: 'start', number: '1' });
		expect(pressTarget(groupTakes([take('a', '1', 'A')]))).toEqual({ action: 'start', number: '1' });
		expect(pressTarget(groupTakes([take('a', '1', 'A', { startedAt: T0 })]))).toEqual({ action: 'end', number: '1' });
		expect(pressTarget(groupTakes([take('a', '1', 'A', { startedAt: T0, endedAt: T1 })]))).toEqual({ action: 'start', number: '2' });
	});
});

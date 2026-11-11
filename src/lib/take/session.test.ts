import { describe, expect, it } from 'vitest';
import { addStill, changedFrom, currentTake, groupBySlate, newTake, previousTake, record, recordTarget, rollingTake, select, setValue, type Session } from './session';
import type { CameraValues, Take } from './types';

const cam = (over: Partial<CameraValues> = {}): CameraValues => ({ focalLength: null, focusDistance: 3, tStop: 2.8, cameraHeight: 1.5, tilt: 0, ...over });
const take = (id: string, slate: string, n: string, start: number | null = null, end: number | null = null): Take => ({
	id,
	scene: '42',
	slate,
	take: n,
	cameras: { A: cam(), B: cam(), C: cam() },
	start,
	end,
	stills: []
});
const base: Session = {
	takes: [take('a1', '42A', '1', 10, 20), take('b1', '42B', '1', 30, 40), take('b2', '42B', '2')],
	currentId: 'b2',
	recents: { focalLength: [], focusDistance: [3], tStop: [2.8], cameraHeight: [], tilt: [] }
};

describe('record', () => {
	it('rolls the current take, then files it', () => {
		const rolling = record(base, 100, 'x');
		expect(currentTake(rolling)).toMatchObject({ id: 'b2', start: 100, end: null });
		expect(rollingTake(rolling)?.id).toBe('b2');
		const filed = record(rolling, 160, 'x');
		expect(currentTake(filed)).toMatchObject({ id: 'b2', start: 100, end: 160 });
		expect(filed.takes).toHaveLength(3);
	});
	it('on a filed take, rolls a new one: a copy of the last of the slate, one take up', () => {
		const s = record(select(base, 'b1'), 500, 'b3');
		expect(s.currentId).toBe('b3');
		expect(currentTake(s)).toMatchObject({ slate: '42B', take: '3', start: 500, end: null });
		expect(s.takes.map((t) => t.id)).toEqual(['a1', 'b1', 'b2', 'b3']);
	});
	it('puts the new take after the last of its own slate', () => {
		const s = record(select(base, 'a1'), 500, 'a2');
		expect(s.takes.map((t) => t.id)).toEqual(['a1', 'a2', 'b1', 'b2']);
		expect(currentTake(s).take).toBe('2');
	});
	it('cuts the rolling take even when another is on screen', () => {
		const rolling = select(record(base, 100, 'x'), 'a1');
		const cut = record(rolling, 200, 'x');
		expect(cut.currentId).toBe('b2');
		expect(currentTake(cut)).toMatchObject({ start: 100, end: 200 });
		expect(rollingTake(cut)).toBeUndefined();
	});
	it('does not change the session given', () => {
		record(base, 100, 'x');
		expect(base.takes[2].start).toBeNull();
	});
});

describe('newTake', () => {
	it('adds an unrolled copy of the last and shows it', () => {
		const s = newTake(select(base, 'b1'), 'b3');
		expect(currentTake(s)).toMatchObject({ id: 'b3', take: '3', start: null });
	});
	it('does nothing while a take rolls', () => {
		const rolling = record(base, 100, 'x');
		expect(newTake(rolling, 'b3')).toBe(rolling);
	});
});

describe('setValue', () => {
	it('sets one field of one camera on the current take', () => {
		const s = setValue(base, 'B', 'tilt', -5);
		expect(currentTake(s).cameras.B.tilt).toBe(-5);
		expect(currentTake(s).cameras.A.tilt).toBe(0);
		expect(base.takes[2].cameras.B.tilt).toBe(0);
	});
	it('remembers the value as recent', () => {
		expect(setValue(base, 'A', 'tStop', 4).recents.tStop).toEqual([4, 2.8]);
	});
	it('remembers nothing for an emptied field', () => {
		const s = setValue(base, 'A', 'tStop', null);
		expect(currentTake(s).cameras.A.tStop).toBeNull();
		expect(s.recents.tStop).toEqual([2.8]);
	});
});

describe('addStill', () => {
	it('attaches to the current take', () => {
		const s = addStill(base, { id: 's1', url: 'blob:1', name: 'a.jpg' });
		expect(currentTake(s).stills.map((x) => x.id)).toEqual(['s1']);
		expect(base.takes[2].stills).toEqual([]);
	});
});

describe('previousTake and changedFrom', () => {
	it('finds the take before in the same slate', () => {
		expect(previousTake(base, base.takes[2])?.id).toBe('b1');
		expect(previousTake(base, base.takes[1])).toBeUndefined();
	});
	it('lists the fields that differ', () => {
		const s = setValue(setValue(base, 'A', 'tilt', 3), 'A', 'tStop', 4);
		expect(changedFrom(currentTake(s), s.takes[1], 'A')).toEqual(['tStop', 'tilt']);
		expect(changedFrom(currentTake(s), undefined, 'A')).toEqual([]);
	});
});

describe('recordTarget', () => {
	it('says which take the press rolls or cuts', () => {
		expect(recordTarget(base)).toEqual({ action: 'roll', take: '2' });
		expect(recordTarget(record(base, 100, 'x'))).toEqual({ action: 'cut', take: '2' });
		expect(recordTarget(select(base, 'b1'))).toEqual({ action: 'rollNew', take: '3' });
	});
});

describe('groupBySlate', () => {
	it('keeps the order and groups neighbours of one slate', () => {
		expect(groupBySlate(base.takes).map((g) => [g.slate, g.takes.map((t) => t.id)])).toEqual([
			['42A', ['a1']],
			['42B', ['b1', 'b2']]
		]);
	});
});

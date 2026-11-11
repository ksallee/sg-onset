import { describe, expect, it } from 'vitest';
import type { Take } from '$lib/model/types';
import { groupTakes } from './groups';
import { groupPhase, groupTimes, runningGroup, stamp } from './phase';

const take = (id: string, number: string, setup: string, rest: Partial<Take> = {}): Take => ({ id, slateId: 's', take: number, cameraSetupId: setup, ...rest });
const T0 = '2026-11-11T09:00:00Z';
const T1 = '2026-11-11T09:01:00Z';

describe('stamp', () => {
	it('is the ISO time to the second, as FPT keeps it', () => {
		expect(stamp(Date.UTC(2026, 10, 11, 9, 41, 7, 980))).toBe('2026-11-11T09:41:07Z');
	});
});

describe('groupPhase', () => {
	it('is ready before any camera started', () => {
		expect(groupPhase(groupTakes([take('a', '1', 'A'), take('b', '1', 'B')])[0])).toBe('idle');
	});
	it('is running while a camera that started has no end', () => {
		const [g] = groupTakes([take('a', '1', 'A', { startedAt: T0 }), take('b', '1', 'B', { startedAt: T0, endedAt: T1 })]);
		expect(groupPhase(g)).toBe('rolling');
	});
	it('is ended when every camera that started has ended; one never started does not hold it open', () => {
		const [g] = groupTakes([take('a', '1', 'A', { startedAt: T0, endedAt: T1 }), take('b', '1', 'B')]);
		expect(groupPhase(g)).toBe('filed');
	});
});

describe('groupTimes', () => {
	it('runs from the first start to the last end, ms', () => {
		const [g] = groupTakes([take('a', '1', 'A', { startedAt: '2026-11-11T09:00:05Z', endedAt: T1 }), take('b', '1', 'B', { startedAt: T0, endedAt: '2026-11-11T09:01:30Z' })]);
		expect(groupTimes(g)).toEqual({ start: Date.parse(T0), end: Date.parse('2026-11-11T09:01:30Z') });
	});
	it('has no end while running', () => {
		const [g] = groupTakes([take('a', '1', 'A', { startedAt: T0 }), take('b', '1', 'B', { startedAt: T0, endedAt: T1 })]);
		expect(groupTimes(g)).toEqual({ start: Date.parse(T0), end: null });
	});
	it('has neither before the start', () => {
		expect(groupTimes(groupTakes([take('a', '1', 'A')])[0])).toEqual({ start: null, end: null });
	});
});

describe('runningGroup', () => {
	it('finds the take number that is running, from the stored times alone', () => {
		const groups = groupTakes([take('a', '1', 'A', { startedAt: T0, endedAt: T1 }), take('b', '2', 'A', { startedAt: '2026-11-11T09:05:00Z' })]);
		expect(runningGroup(groups)?.number).toBe('2');
		expect(runningGroup(groups.slice(0, 1))).toBeUndefined();
	});
});

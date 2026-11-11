import { describe, expect, it } from 'vitest';
import type { CameraSetup, Lens, Slate, Take } from '$lib/model/types';
import { dayTakeLines, filterTakeLines, minuteOfDay, parseClock, setupOptions, slateTakeLines } from './takes';

const at = (h: number, m: number) => new Date(2026, 10, 11, h, m).toISOString();
const setups: CameraSetup[] = [
	{ id: 'A', projectId: 'p', cameraLabel: 'A' },
	{ id: 'B', projectId: 'p', cameraLabel: 'B' }
];
const lenses: Lens[] = [{ id: 'l32', projectId: 'p', focalLength: 32 }];
const slates: Slate[] = [
	{ id: 's2', shootDayId: 'd', slateUID: '10' },
	{ id: 's1', shootDayId: 'd', slateUID: '9' }
];
const takes: Take[] = [
	{ id: 't1', slateId: 's1', take: '2', cameraSetupId: 'B', startedAt: at(9, 10) },
	{ id: 't2', slateId: 's1', take: '10', cameraSetupId: 'A', startedAt: at(9, 40) },
	{ id: 't3', slateId: 's1', take: '2', cameraSetupId: 'A', lensId: 'l32', startedAt: at(9, 10) },
	{ id: 't4', slateId: 's2', take: '1', cameraSetupId: 'A', startedAt: at(11, 0) },
	{ id: 't5', slateId: 's2', take: '1' }
];

describe('slateTakeLines', () => {
	const lines = slateTakeLines(takes.filter((t) => t.slateId === 's1'), setups, lenses);
	it('orders by take number as a person counts, then by camera', () => {
		expect(lines.map((l) => `${l.take.take}${l.camera}`)).toEqual(['2A', '2B', '10A']);
	});
	it('marks the first line of each take number, for the table to group them', () => {
		expect(lines.map((l) => l.first)).toEqual([true, false, true]);
	});
	it('carries the camera letter and the focal length', () => {
		expect(lines[0]).toMatchObject({ camera: 'A', focal: '32' });
	});
});

describe('dayTakeLines', () => {
	it('lists every take of the day: slates in counting order, then take number, then camera', () => {
		const lines = dayTakeLines(slates, takes, setups, lenses);
		expect(lines.map((l) => `${l.slate.slateUID}/${l.take.take}${l.camera}`)).toEqual(['9/2A', '9/2B', '9/10A', '10/1', '10/1A']);
		expect(lines.map((l) => l.first)).toEqual([true, false, true, true, false]);
	});
	it('leaves out takes of slates it was not given', () => {
		expect(dayTakeLines([slates[0]], takes, setups, lenses).every((l) => l.slate.id === 's2')).toBe(true);
	});
});

describe('filterTakeLines', () => {
	const lines = dayTakeLines(slates, takes, setups, lenses);
	const ids = (f: Parameters<typeof filterTakeLines>[1]) => filterTakeLines(lines, f).map((l) => l.take.id);
	it('keeps everything with no filter', () => {
		expect(ids({})).toHaveLength(5);
	});
	it('by slate and by camera setup', () => {
		expect(ids({ slateIds: new Set(['s2']) })).toEqual(['t5', 't4']);
		expect(ids({ setupIds: new Set(['B']) })).toEqual(['t1']);
		expect(ids({ slateIds: new Set(['s1']), setupIds: new Set(['A']) })).toEqual(['t3', 't2']);
	});
	it('by the time of day a take started, both ends included; takes never started are left out', () => {
		expect(ids({ from: 9 * 60 + 10, to: 9 * 60 + 40 })).toEqual(['t3', 't1', 't2']);
		expect(ids({ from: 10 * 60 })).toEqual(['t4']);
		expect(ids({ to: 9 * 60 + 30 })).toEqual(['t3', 't1']);
	});
});

describe('setupOptions', () => {
	it('lists the camera setups the takes use, by letter', () => {
		expect(setupOptions(takes, [...setups].reverse())).toEqual([setups[0], setups[1]]);
	});
});

describe('minuteOfDay and parseClock', () => {
	it('reads a local time of day from a timestamp', () => {
		expect(minuteOfDay(at(9, 5))).toBe(545);
		expect(minuteOfDay(undefined)).toBeUndefined();
	});
	it('reads a typed time: 9:05, 0905, 905, 9', () => {
		expect(parseClock('9:05')).toBe(545);
		expect(parseClock('0905')).toBe(545);
		expect(parseClock('905')).toBe(545);
		expect(parseClock('9')).toBe(540);
		expect(parseClock(' ')).toBeUndefined();
	});
	it('refuses what is not a time', () => {
		expect(parseClock('25:00')).toBeNull();
		expect(parseClock('9:61')).toBeNull();
		expect(parseClock('soon')).toBeNull();
	});
});

import { describe, expect, it } from 'vitest';
import { dayReport } from '$lib/export/dayReport';
import { input } from '$lib/export/testData';
import { daySummary, formatDuration, runningTime } from './summary';

describe('runningTime', () => {
	it('adds the time takes ran, counting overlap once', () => {
		const ms = runningTime([
			{ startedAt: '2026-11-10T10:00:00Z', endedAt: '2026-11-10T10:01:00Z' },
			{ startedAt: '2026-11-10T10:00:30Z', endedAt: '2026-11-10T10:01:30Z' },
			{ startedAt: '2026-11-10T11:00:00Z', endedAt: '2026-11-10T11:00:10Z' }
		]);
		expect(ms).toBe(100_000);
	});
	it('skips a take with no end, or an end before the start', () => {
		expect(runningTime([{ startedAt: '2026-11-10T10:00:00Z' }, { startedAt: '2026-11-10T10:00:00Z', endedAt: '2026-11-10T09:00:00Z' }, {}])).toBe(0);
	});
});

describe('formatDuration', () => {
	it('reads as a crew says it', () => {
		expect(formatDuration(0)).toBe('0 min');
		expect(formatDuration(48_000)).toBe('48 s');
		expect(formatDuration(12 * 60_000 + 5_000)).toBe('12 min');
		expect(formatDuration(65 * 60_000)).toBe('1 h 05 min');
	});
});

describe('daySummary', () => {
	const report = dayReport(input(), 'd3')!;
	const s = daySummary(report);

	it('counts the day', () => {
		expect(s).toMatchObject({ slates: 3, takes: 7, circled: 2, noGood: 1, photos: 3 });
	});
	it('gives the running time of the takes that ended', () => {
		// 42A: 22:15:30–22:16:10 (A), 22:20:00–22:21:00 (A, B), 22:40–22:41 (A); 10: 23:00–23:01.
		expect(s.runningMs).toBe(40_000 + 60_000 + 60_000 + 60_000);
	});
	it('lists the cameras used with their body and count of takes', () => {
		expect(s.cameras).toEqual([
			{ letter: 'A', body: 'ARRI ALEXA 35', takes: 4 },
			{ letter: 'B', body: 'Sony VENICE 2', takes: 2 }
		]);
	});
	it('gives one to-do per take, with every warning it has', () => {
		expect(s.todo.map((t) => [t.slate, t.take, t.cameraLetter, t.kinds])).toEqual([
			['9', '1', '', ['noEndTime', 'noFocalLength']],
			['42A', '1', 'B', ['noEndTime']],
			['42A', '2', 'B', ['zoomNoFocalLength']]
		]);
		expect(s.todo[1]).toMatchObject({ takeId: 't42A1B', slateId: '6f1c0d2e-0000-4000-8000-000000000042' });
	});
	it('says when the day has no takes', () => {
		const empty = daySummary({ ...report, slates: [], totals: { slates: 0, takes: 0, circled: 0, noGood: 0, photos: 0 }, warnings: [] });
		expect(empty).toMatchObject({ takes: 0, runningMs: 0, cameras: [], todo: [] });
	});
});

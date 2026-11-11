import { describe, expect, it } from 'vitest';
import { elapsedMs, formatClock, formatElapsed, nextSecondIn, phaseOf, pressRecord, undoRecord } from './record';

const idle = { start: null, end: null };

describe('phaseOf', () => {
	it('reads the phase from the stamps', () => {
		expect(phaseOf(idle)).toBe('idle');
		expect(phaseOf({ start: 5, end: null })).toBe('rolling');
		expect(phaseOf({ start: 5, end: 9 })).toBe('filed');
	});
});

describe('pressRecord', () => {
	it('stamps the start, then the end', () => {
		const rolling = pressRecord(idle, 1000);
		expect(rolling).toEqual({ start: 1000, end: null });
		expect(pressRecord(rolling, 4000)).toEqual({ start: 1000, end: 4000 });
	});
	it('leaves a filed take alone', () => {
		const filed = { start: 1000, end: 4000 };
		expect(pressRecord(filed, 9000)).toBe(filed);
	});
	it('never ends before it starts', () => {
		expect(pressRecord({ start: 1000, end: null }, 400)).toEqual({ start: 1000, end: 1000 });
	});
});

describe('undoRecord', () => {
	it('reopens a filed take with its start kept', () => {
		expect(undoRecord({ start: 1000, end: 4000 })).toEqual({ start: 1000, end: null });
	});
	it('takes a rolling take back to idle', () => {
		expect(undoRecord({ start: 1000, end: null })).toEqual(idle);
	});
	it('leaves an idle take alone', () => {
		expect(undoRecord(idle)).toBe(idle);
	});
});

describe('elapsedMs', () => {
	it('is zero before the roll', () => {
		expect(elapsedMs(idle, 5000)).toBe(0);
	});
	it('runs from the start to now while rolling', () => {
		expect(elapsedMs({ start: 1000, end: null }, 5000)).toBe(4000);
		expect(elapsedMs({ start: 1000, end: null }, 500)).toBe(0);
	});
	it('is fixed once filed', () => {
		expect(elapsedMs({ start: 1000, end: 4000 }, 99999)).toBe(3000);
	});
});

describe('formatElapsed', () => {
	it('shows minutes and seconds', () => {
		expect(formatElapsed(0)).toBe('0:00');
		expect(formatElapsed(7_900)).toBe('0:07');
		expect(formatElapsed(83_000)).toBe('1:23');
	});
	it('adds hours past an hour', () => {
		expect(formatElapsed(3_723_000)).toBe('1:02:03');
	});
});

describe('nextSecondIn', () => {
	it('is the time to the next whole second of the take, not of the clock', () => {
		expect(nextSecondIn(1000, 1000)).toBe(1000);
		expect(nextSecondIn(1000, 1250)).toBe(750);
		expect(nextSecondIn(1000, 1999)).toBe(1);
		expect(nextSecondIn(1300, 61_700)).toBe(600);
	});
	it('waits for the start when the clock is behind it', () => {
		expect(nextSecondIn(5000, 4400)).toBe(600);
	});
	it('does not drift: the display follows the start stamp however late a tick lands', () => {
		const start = 10_000;
		let now = start;
		const shown: string[] = [];
		// Every tick lands 180 ms late; one lands 90 s late (the tab was in the background).
		for (const late of [180, 180, 90_000, 180]) {
			now += nextSecondIn(start, now) + late;
			shown.push(formatElapsed(elapsedMs({ start, end: null }, now)));
		}
		expect(shown).toEqual(['0:01', '0:02', '1:33', '1:34']);
	});
});

describe('formatClock', () => {
	it('shows the wall time for an offset in minutes', () => {
		const noon = Date.UTC(2026, 10, 11, 12, 4, 9);
		expect(formatClock(noon, 0)).toBe('12:04:09');
		expect(formatClock(noon, 60)).toBe('13:04:09');
		expect(formatClock(noon, -13 * 60)).toBe('23:04:09');
	});
});

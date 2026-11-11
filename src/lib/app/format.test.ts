import { describe, expect, it } from 'vitest';
import { addDays, ago, backupName, formatBytes, formatDate, formatTime, today } from './format';

describe('today', () => {
	it('is the local date, padded', () => {
		expect(today(new Date(2026, 10, 11, 23, 59))).toBe('2026-11-11');
		expect(today(new Date(2027, 0, 5, 0, 1))).toBe('2027-01-05');
	});
});

describe('addDays', () => {
	it('crosses months and years', () => {
		expect(addDays('2026-11-11', -1)).toBe('2026-11-10');
		expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
		expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
	});
});

describe('formatDate', () => {
	it('reads as weekday, day, month, year', () => {
		expect(formatDate('2026-11-11')).toBe('Wed 11 Nov 2026');
		expect(formatDate('2027-01-01')).toBe('Fri 1 Jan 2027');
	});
	it('gives back what is not a date', () => {
		expect(formatDate('soon')).toBe('soon');
		expect(formatDate(undefined)).toBe('');
	});
});

describe('formatTime', () => {
	it('is the local time of day', () => {
		expect(formatTime(new Date(2026, 10, 11, 9, 5).toISOString())).toBe('09:05');
	});
	it('is empty for no time', () => {
		expect(formatTime(undefined)).toBe('');
		expect(formatTime('nope')).toBe('');
	});
});

describe('formatBytes', () => {
	it('picks the unit', () => {
		expect(formatBytes(0)).toBe('0 B');
		expect(formatBytes(512)).toBe('512 B');
		expect(formatBytes(12_300)).toBe('12 KB');
		expect(formatBytes(3_440_000)).toBe('3.4 MB');
		expect(formatBytes(250_000_000)).toBe('250 MB');
		expect(formatBytes(1_200_000_000)).toBe('1.2 GB');
	});
	it('is empty for nonsense', () => {
		expect(formatBytes(NaN)).toBe('');
		expect(formatBytes(-1)).toBe('');
	});
});

describe('ago', () => {
	const now = 10 * 24 * 3600_000;
	it('counts minutes, hours, then days', () => {
		expect(ago(now - 20_000, now)).toEqual({ key: 'time.now', params: { n: 0 } });
		expect(ago(now - 5 * 60_000, now)).toEqual({ key: 'time.minutes', params: { n: 5 } });
		expect(ago(now - 3 * 3600_000, now)).toEqual({ key: 'time.hours', params: { n: 3 } });
		expect(ago(now - 50 * 3600_000, now)).toEqual({ key: 'time.days', params: { n: 2 } });
	});
	it('is now for a time ahead of the clock', () => {
		expect(ago(now + 5000, now).key).toBe('time.now');
	});
});

describe('backupName', () => {
	it('carries the local date and time', () => {
		expect(backupName(new Date(2026, 10, 11, 15, 5))).toBe('sg-onset-2026-11-11-1505.zip');
	});
});

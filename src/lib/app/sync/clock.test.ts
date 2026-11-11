import { describe, expect, it } from 'vitest';
import { toSecond } from './clock';

// FPT keeps a date-time to the second (corpus findings/field_types/date_time.md). The app's clock
// stamps to the second, so a time read back from FPT names the moment stored here.
describe('toSecond', () => {
	it('drops the milliseconds', () => {
		expect(toSecond(Date.UTC(2026, 10, 11, 9, 1, 2, 999))).toBe(Date.UTC(2026, 10, 11, 9, 1, 2));
		expect(toSecond(Date.UTC(2026, 10, 11, 9, 1, 2))).toBe(Date.UTC(2026, 10, 11, 9, 1, 2));
	});
	it('gives an ISO time with no fraction left', () => {
		expect(new Date(toSecond(Date.UTC(2026, 10, 11, 9, 1, 2, 500))).toISOString()).toBe('2026-11-11T09:01:02.000Z');
	});
});

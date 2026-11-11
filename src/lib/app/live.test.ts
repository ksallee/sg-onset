import { describe, expect, it } from 'vitest';
import { latest, touches } from './live';

describe('touches', () => {
	it('is true when a watched table changed', () => {
		expect(touches(['take', 'outbox'], ['take'])).toBe(true);
		expect(touches(['slate', 'outbox'], ['take', 'slate'])).toBe(true);
	});
	it('is false when none did', () => {
		expect(touches(['camera', 'outbox'], ['take', 'slate'])).toBe(false);
		expect(touches([], ['take'])).toBe(false);
	});
	it('is true for a read that watches everything', () => {
		expect(touches(['camera'], [])).toBe(true);
	});
});

describe('latest', () => {
	it('knows only the newest read as current', () => {
		const order = latest();
		const first = order.begin();
		expect(order.current(first)).toBe(true);
		const second = order.begin();
		expect(order.current(first)).toBe(false);
		expect(order.current(second)).toBe(true);
	});
});

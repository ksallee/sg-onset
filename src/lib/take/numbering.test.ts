import { describe, expect, it } from 'vitest';
import { copyOfLast, nextTakeNumber } from './numbering';
import type { Take } from './types';

describe('nextTakeNumber', () => {
	it('adds one', () => {
		expect(nextTakeNumber('1')).toBe('2');
		expect(nextTakeNumber('9')).toBe('10');
	});
	it('keeps a prefix and zero padding', () => {
		expect(nextTakeNumber('PU3')).toBe('PU4');
		expect(nextTakeNumber('007')).toBe('008');
		expect(nextTakeNumber('099')).toBe('100');
	});
	it('drops a suffix after the number', () => {
		expect(nextTakeNumber('3A')).toBe('4');
	});
	it('starts at 2 when there is no number', () => {
		expect(nextTakeNumber('')).toBe('2');
		expect(nextTakeNumber('Wild')).toBe('Wild 2');
	});
});

describe('copyOfLast', () => {
	const cam = { focalLength: 85, focusDistance: 3.2, tStop: 2.8, cameraHeight: 1.5, tilt: -4 };
	const last: Take = {
		id: 'a',
		scene: '42',
		slate: '42B',
		take: '3',
		cameras: { A: cam, B: { ...cam, tilt: 0 }, C: { ...cam, focalLength: null } },
		start: 1000,
		end: 9000,
		stills: [{ id: 's', url: 'blob:x', name: 'x.jpg' }]
	};
	const next = copyOfLast(last, 'b');

	it('keeps scene, slate and the camera values', () => {
		expect(next).toMatchObject({ id: 'b', scene: '42', slate: '42B', cameras: last.cameras });
	});
	it('increments the take', () => {
		expect(next.take).toBe('4');
	});
	it('starts unrolled, with no stills', () => {
		expect(next.start).toBeNull();
		expect(next.end).toBeNull();
		expect(next.stills).toEqual([]);
	});
	it('shares no camera object with the last take', () => {
		expect(next.cameras.A).not.toBe(last.cameras.A);
		expect(last.stills).toHaveLength(1);
	});
});

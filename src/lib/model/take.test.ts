import { describe, expect, it } from 'vitest';
import { effectiveFocalLength, isPrime, isZoom, nextTake, nextTakeNumber } from './take';
import type { Lens, Take } from './types';

describe('nextTakeNumber', () => {
	it('adds one to a number', () => {
		expect(nextTakeNumber('3')).toBe('4');
		expect(nextTakeNumber('9')).toBe('10');
		expect(nextTakeNumber('99')).toBe('100');
	});

	it('adds one to the number a take ends with, keeping what comes before', () => {
		expect(nextTakeNumber('A7')).toBe('A8');
		expect(nextTakeNumber('A9')).toBe('A10');
		expect(nextTakeNumber('PU2')).toBe('PU3');
		expect(nextTakeNumber('2-3')).toBe('2-4');
	});

	it('keeps leading zeros', () => {
		expect(nextTakeNumber('007')).toBe('008');
		expect(nextTakeNumber('09')).toBe('10');
		expect(nextTakeNumber('99')).toBe('100');
	});

	it('steps the letters after a number, keeping their case', () => {
		expect(nextTakeNumber('12b')).toBe('12c');
		expect(nextTakeNumber('3C')).toBe('3D');
		expect(nextTakeNumber('12z')).toBe('12aa');
		expect(nextTakeNumber('12Z')).toBe('12AA');
		expect(nextTakeNumber('12az')).toBe('12ba');
		expect(nextTakeNumber('A7b')).toBe('A7c');
	});

	it('starts a count after a take with no number', () => {
		expect(nextTakeNumber('PU')).toBe('PU2');
		expect(nextTakeNumber('W')).toBe('W2');
		expect(nextTakeNumber('3-')).toBe('3-2');
	});

	it('starts at 1 from nothing, and ignores outer spaces', () => {
		expect(nextTakeNumber('')).toBe('1');
		expect(nextTakeNumber('   ')).toBe('1');
		expect(nextTakeNumber(' 3 ')).toBe('4');
	});
});

describe('nextTake', () => {
	const last: Take = {
		id: 'old',
		slateId: 's',
		templateId: 'tpl',
		take: '3',
		startedAt: '2026-11-11T10:00:00.000Z',
		endedAt: '2026-11-11T10:01:00.000Z',
		circleTake: true,
		noGood: true,
		notes: 'boom in shot',
		clipName: 'A001C003',
		timecodeStart: '10:00:00:00',
		timecodeEnd: '10:01:00:00',
		cameraSetupId: 'camA',
		cameraId: 'body',
		lensId: 'zoom',
		focalLength: 24,
		focalLengthEnd: 70,
		tStop: 2.8,
		lensHeight: { m: 1.2 },
		tilt: -5,
		tiltEnd: 0,
		captureFrameRate: { num: 24, denom: 1 },
		cameraRoll: 'A001'
	};

	it('copies the last take with a new id and the next number', () => {
		expect(nextTake(last, 'new')).toEqual({
			id: 'new',
			slateId: 's',
			templateId: 'tpl',
			take: '4',
			cameraSetupId: 'camA',
			cameraId: 'body',
			lensId: 'zoom',
			focalLength: 24,
			focalLengthEnd: 70,
			tStop: 2.8,
			lensHeight: { m: 1.2 },
			tilt: -5,
			tiltEnd: 0,
			captureFrameRate: { num: 24, denom: 1 },
			cameraRoll: 'A001'
		});
	});

	it('drops what belongs to one take: times, circle, no good, notes, clip, timecode', () => {
		const next = nextTake(last, 'new');
		for (const key of ['startedAt', 'endedAt', 'circleTake', 'noGood', 'notes', 'clipName', 'timecodeStart', 'timecodeEnd']) {
			expect(key in next).toBe(false);
		}
	});

	it('leaves the last take alone', () => {
		const before = structuredClone(last);
		nextTake(last, 'new');
		expect(last).toEqual(before);
	});

	it('numbers the first take 1 when the last has no number', () => {
		expect(nextTake({ id: 'old', slateId: 's' }, 'new')).toEqual({ id: 'new', slateId: 's', take: '1' });
	});
});

describe('isPrime, isZoom', () => {
	const lens = (fields: Partial<Lens>): Lens => ({ id: 'l', projectId: 'p', ...fields });

	it('a lens with one focal length is a prime', () => {
		expect(isPrime(lens({ focalLength: 32 }))).toBe(true);
		expect(isZoom(lens({ focalLength: 32 }))).toBe(false);
		expect(isPrime(lens({ focalLength: 32, focalLengthMax: 32 }))).toBe(true);
	});

	it('a lens with a focal range is a zoom', () => {
		expect(isZoom(lens({ focalLength: 24, focalLengthMax: 70 }))).toBe(true);
		expect(isPrime(lens({ focalLength: 24, focalLengthMax: 70 }))).toBe(false);
	});

	it('a lens with no focal length is neither', () => {
		expect(isPrime(lens({}))).toBe(false);
		expect(isZoom(lens({}))).toBe(false);
	});
});

describe('effectiveFocalLength', () => {
	const prime: Lens = { id: 'p32', projectId: 'p', lensModel: 'Master Prime', focalLength: 32 };
	const zoom: Lens = { id: 'z', projectId: 'p', lensModel: 'Optimo', focalLength: 24, focalLengthMax: 290 };
	const take = (fields: Partial<Take>): Take => ({ id: 't', slateId: 's', ...fields });

	it('comes from the lens when it is a prime', () => {
		expect(effectiveFocalLength(take({}), prime)).toEqual({ start: 32, end: 32, source: 'lens' });
	});

	it('ignores a focal length left on the take when the lens is a prime', () => {
		expect(effectiveFocalLength(take({ focalLength: 50, focalLengthEnd: 70 }), prime)).toEqual({ start: 32, end: 32, source: 'lens' });
	});

	it('comes from the take when the lens is a zoom', () => {
		expect(effectiveFocalLength(take({ focalLength: 50 }), zoom)).toEqual({ start: 50, end: 50, source: 'take' });
		expect(effectiveFocalLength(take({ focalLength: 50, focalLengthEnd: 120 }), zoom)).toEqual({ start: 50, end: 120, source: 'take' });
	});

	it('comes from the take when there is no lens, or the lens has no focal length', () => {
		expect(effectiveFocalLength(take({ focalLength: 40 }), undefined)).toEqual({ start: 40, end: 40, source: 'take' });
		expect(effectiveFocalLength(take({ focalLength: 40 }), { id: 'x', projectId: 'p' })).toEqual({ start: 40, end: 40, source: 'take' });
	});

	it('is unknown for a zoom with nothing typed', () => {
		expect(effectiveFocalLength(take({}), zoom)).toBeUndefined();
		expect(effectiveFocalLength(take({}), undefined)).toBeUndefined();
	});
});

import { describe, expect, it } from 'vitest';
import { fieldRef, fieldRefs } from './fields';

describe('fieldRefs', () => {
	it('lists the fields of a scope in catalogue order, each end right after its start', () => {
		const keys = fieldRefs('take').map((r) => r.key);
		expect(keys.slice(0, 3)).toEqual(['take', 'startedAt', 'endedAt']);
		expect(keys.indexOf('tiltEnd')).toBe(keys.indexOf('tilt') + 1);
		expect(fieldRefs('take').find((r) => r.key === 'tiltEnd')).toMatchObject({ end: true, def: { key: 'tilt' } });
	});
	it('has no end for a field that does not change over a take', () => {
		expect(fieldRefs('slate').some((r) => r.end)).toBe(false);
	});
});

describe('fieldRef', () => {
	it('finds a field or an end by its key', () => {
		expect(fieldRef('take', 'focalLengthEnd')).toMatchObject({ key: 'focalLengthEnd', end: true });
		expect(fieldRef('slate', 'sceneNumber')).toMatchObject({ key: 'sceneNumber', end: false });
		expect(fieldRef('slate', 'nope')).toBeUndefined();
	});
});

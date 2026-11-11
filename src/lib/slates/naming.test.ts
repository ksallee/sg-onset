import { describe, expect, it } from 'vitest';
import type { Slate } from '$lib/model/types';
import { validateRecord } from '$lib/model/validate';
import { blankSlate, nextSlateName, slateNameTaken } from './naming';

const slates = (...names: string[]): Slate[] => names.map((slateUID, i) => ({ id: `s${i}`, shootDayId: 'd', slateUID }));

describe('nextSlateName', () => {
	it('starts at 1', () => {
		expect(nextSlateName([])).toBe('1');
	});
	it('steps the letter or the number of the last slate, in counting order', () => {
		expect(nextSlateName(slates('42B', '42A'))).toBe('42C');
		expect(nextSlateName(slates('9', '10'))).toBe('11');
	});
});

describe('slateNameTaken', () => {
	it('ignores case and the spaces around', () => {
		expect(slateNameTaken(slates('42A'), ' 42a ')).toBe(true);
		expect(slateNameTaken(slates('42A'), '42B')).toBe(false);
	});
});

describe('blankSlate', () => {
	it('is a valid slate with a name and nothing else', () => {
		const slate = blankSlate('s1', 'd1', ' 42A ');
		expect(slate).toEqual({ id: 's1', shootDayId: 'd1', slateUID: '42A' });
		expect(validateRecord('slate', slate)).toEqual({});
	});
});

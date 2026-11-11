import { describe, expect, it } from 'vitest';
import type { Slate } from '$lib/model/types';
import { validateRecord } from '$lib/model/validate';
import { blankSlate, duplicateSlate, nextSlateName, slateNameTaken } from './naming';

const slates = (...names: string[]): Slate[] => names.map((slateUID, i) => ({ id: `s${i}`, shootDayId: 'd', slateUID }));

describe('nextSlateName', () => {
	it('starts at 1', () => {
		expect(nextSlateName([])).toBe('1');
	});
	it('steps the letter or the number of the last slate, in counting order', () => {
		expect(nextSlateName(slates('42B', '42A'))).toBe('42C');
		expect(nextSlateName(slates('9', '10'))).toBe('11');
	});
	it('skips the letters I and O, which read as 1 and 0', () => {
		expect(nextSlateName(slates('42H'))).toBe('42J');
		expect(nextSlateName(slates('42n'))).toBe('42p');
	});
	it('with a scene: the scene itself first, then its letters', () => {
		expect(nextSlateName(slates('9', '10'), '42')).toBe('42');
		expect(nextSlateName(slates('42'), '42')).toBe('42A');
		expect(nextSlateName(slates('42', '42A', '43'), ' 42 ')).toBe('42B');
		expect(nextSlateName(slates('42A'), '42')).toBe('42B');
	});
	it('with a scene, ignores slates of other scenes that start alike', () => {
		expect(nextSlateName(slates('420', '42X1'), '42')).toBe('42');
	});
	it('never suggests a name the day already has', () => {
		expect(nextSlateName(slates('42A', '42B', '42C'), '42')).toBe('42D');
		expect(nextSlateName(slates('10', '11', '9', '12'))).toBe('13');
	});
});

describe('slateNameTaken', () => {
	it('ignores case and the spaces around', () => {
		expect(slateNameTaken(slates('42A'), ' 42a ')).toBe(true);
		expect(slateNameTaken(slates('42A'), '42B')).toBe(false);
	});
	it('can leave one slate out: the one being renamed', () => {
		expect(slateNameTaken(slates('42A'), '42A', 's0')).toBe(false);
	});
});

describe('blankSlate', () => {
	it('is a valid slate with a name and nothing else', () => {
		const slate = blankSlate('s1', 'd1', ' 42A ');
		expect(slate).toEqual({ id: 's1', shootDayId: 'd1', slateUID: '42A' });
		expect(validateRecord('slate', slate)).toEqual({});
	});
});

describe('duplicateSlate', () => {
	it('copies every field and the template link under a new id and name, on the same day', () => {
		const from: Slate = { id: 's1', shootDayId: 'd1', slateUID: '42A', sceneNumber: '42', lidar: true, vfxShots: ['A'], templateId: 'tp' };
		const copy = duplicateSlate(from, 's2', '42B');
		expect(copy).toEqual({ id: 's2', shootDayId: 'd1', slateUID: '42B', sceneNumber: '42', lidar: true, vfxShots: ['A'], templateId: 'tp' });
		expect(copy.vfxShots).not.toBe(from.vfxShots);
	});
});

import { describe, expect, it } from 'vitest';
import type { CameraSetup, Take } from '$lib/model/types';
import { validateRecord } from '$lib/model/validate';
import { blankSetup, nextSetupLabel, pickerList, pushPick, recentIds, setupLabelTaken, setupsUsing, sortSetups } from './setups';

const setup = (id: string, cameraLabel: string, rest: Partial<CameraSetup> = {}): CameraSetup => ({ id, projectId: 'p', cameraLabel, ...rest });

describe('sortSetups', () => {
	it('puts single letters first, then names, each in alphabetical order', () => {
		const sorted = sortSetups([setup('1', 'Second Unit'), setup('2', 'C'), setup('3', 'a'), setup('4', 'Drone'), setup('5', 'B')]);
		expect(sorted.map((s) => s.cameraLabel)).toEqual(['a', 'B', 'C', 'Drone', 'Second Unit']);
	});
	it('counts numbers in order', () => {
		expect(sortSetups([setup('1', 'Unit 10'), setup('2', 'Unit 2')]).map((s) => s.cameraLabel)).toEqual(['Unit 2', 'Unit 10']);
	});
});

describe('nextSetupLabel', () => {
	it('is the first free letter', () => {
		expect(nextSetupLabel([])).toBe('A');
		expect(nextSetupLabel([setup('1', 'A'), setup('2', 'b')])).toBe('C');
		expect(nextSetupLabel([setup('1', 'A'), setup('2', 'C')])).toBe('B');
	});
	it('is empty once every letter is taken', () => {
		const all = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((l, i) => setup(String(i), l));
		expect(nextSetupLabel(all)).toBe('');
	});
});

describe('setupLabelTaken', () => {
	it('ignores case and spaces, and the setup being renamed', () => {
		const list = [setup('1', 'A'), setup('2', 'B')];
		expect(setupLabelTaken(list, ' a ')).toBe(true);
		expect(setupLabelTaken(list, 'a', '1')).toBe(false);
		expect(setupLabelTaken(list, 'C')).toBe(false);
	});
});

describe('blankSetup', () => {
	it('is a valid camera setup with a label', () => {
		const s = blankSetup('s1', 'p1', ' A ');
		expect(s).toEqual({ id: 's1', projectId: 'p1', cameraLabel: 'A' });
		expect(validateRecord('cameraSetup', s)).toEqual({});
	});
});

describe('setupsUsing', () => {
	it('lists the setups that hold a body or a lens', () => {
		const list = [setup('1', 'A', { lensId: 'l1', cameraId: 'c1' }), setup('2', 'B', { lensId: 'l2', cameraId: 'c1' })];
		expect(setupsUsing(list, 'lensId', 'l1').map((s) => s.id)).toEqual(['1']);
		expect(setupsUsing(list, 'cameraId', 'c1').map((s) => s.id)).toEqual(['1', '2']);
	});
});

describe('recentIds', () => {
	const take = (id: string, startedAt: string | undefined, lensId?: string): Take => ({ id, slateId: 's', ...(startedAt ? { startedAt } : {}), ...(lensId ? { lensId } : {}) });
	it('puts this session’s picks first, newest first, then the gear of the latest takes', () => {
		const takes = [take('1', '2026-11-10T10:00:00Z', 'old'), take('2', '2026-11-11T10:00:00Z', 'new'), take('3', '2026-11-11T09:00:00Z', 'picked')];
		expect(recentIds(takes, 'lensId', ['picked'])).toEqual(['picked', 'new', 'old']);
	});
	it('skips takes with no time or no gear', () => {
		expect(recentIds([take('1', undefined, 'x'), take('2', '2026-11-11T10:00:00Z')], 'lensId', [])).toEqual([]);
	});
});

describe('pickerList', () => {
	const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
	it('splits the recent ones off the top, in recent order, and keeps the rest in theirs', () => {
		expect(pickerList(items, ['c', 'gone', 'a'], 3)).toEqual({ recent: [{ id: 'c' }, { id: 'a' }], rest: [{ id: 'b' }, { id: 'd' }] });
	});
	it('keeps at most `cap` recent ones', () => {
		expect(pickerList(items, ['d', 'c', 'b'], 2).recent).toEqual([{ id: 'd' }, { id: 'c' }]);
	});
	it('shows no recent group when every item would be in it', () => {
		expect(pickerList([{ id: 'a' }, { id: 'b' }], ['a', 'b'], 4)).toEqual({ recent: [], rest: [{ id: 'a' }, { id: 'b' }] });
	});
});

describe('pushPick', () => {
	it('puts the pick first, once, and keeps eight', () => {
		expect(pushPick(['a', 'b'], 'b')).toEqual(['b', 'a']);
		expect(pushPick(['1', '2', '3', '4', '5', '6', '7', '8'], 'x')).toEqual(['x', '1', '2', '3', '4', '5', '6', '7']);
	});
});

import { describe, expect, it } from 'vitest';
import type { CameraSetup, Take } from '$lib/model/types';
import { validateRecord } from '$lib/model/validate';
import { blankSetup, moveSetup, nextSetupLabel, pickerList, pushPick, recentIds, setupLabelTaken, setupsUsing, sortSetups } from './setups';

const setup = (id: string, cameraLabel: string, rest: Partial<CameraSetup> = {}): CameraSetup => ({ id, projectId: 'p', cameraLabel, ...rest });

describe('sortSetups', () => {
	it('puts single letters first, then names, each in alphabetical order', () => {
		const sorted = sortSetups([setup('1', 'Second Unit'), setup('2', 'C'), setup('3', 'a'), setup('4', 'Drone'), setup('5', 'B')]);
		expect(sorted.map((s) => s.cameraLabel)).toEqual(['a', 'B', 'C', 'Drone', 'Second Unit']);
	});
	it('counts numbers in order', () => {
		expect(sortSetups([setup('1', 'Unit 10'), setup('2', 'Unit 2')]).map((s) => s.cameraLabel)).toEqual(['Unit 2', 'Unit 10']);
	});
	it('follows the order set by hand, before the rule', () => {
		const sorted = sortSetups([setup('1', 'A', { order: 3 }), setup('2', 'Drone', { order: 1 }), setup('3', 'B', { order: 2 })]);
		expect(sorted.map((s) => s.cameraLabel)).toEqual(['Drone', 'B', 'A']);
	});
	it('puts setups with no order after those with one, by the rule', () => {
		const sorted = sortSetups([setup('1', 'Second Unit'), setup('2', 'C'), setup('3', 'Drone', { order: 1 }), setup('4', 'A', { order: 2 })]);
		expect(sorted.map((s) => s.cameraLabel)).toEqual(['Drone', 'A', 'C', 'Second Unit']);
	});
	it('breaks a tie in the order by the rule', () => {
		expect(sortSetups([setup('1', 'B', { order: 1 }), setup('2', 'A', { order: 1 })]).map((s) => s.cameraLabel)).toEqual(['A', 'B']);
	});
});

describe('moveSetup', () => {
	const list = [setup('a', 'A'), setup('b', 'B'), setup('c', 'C'), setup('d', 'D')];
	const applied = (changes: { setup: CameraSetup; order: number }[]) => {
		const orders = new Map(changes.map((c) => [c.setup.id, c.order]));
		return sortSetups(list.map((s) => (orders.has(s.id) ? { ...s, order: orders.get(s.id) } : s))).map((s) => s.id);
	};
	it('numbers every setup from 1 in the new order', () => {
		const changes = moveSetup(list, 'c', 0);
		expect(changes.map((c) => [c.setup.id, c.order])).toEqual([
			['c', 1],
			['a', 2],
			['b', 3],
			['d', 4]
		]);
		expect(applied(changes)).toEqual(['c', 'a', 'b', 'd']);
	});
	it('moves down and to the end', () => {
		expect(applied(moveSetup(list, 'a', 1))).toEqual(['b', 'a', 'c', 'd']);
		expect(applied(moveSetup(list, 'b', 9))).toEqual(['a', 'c', 'd', 'b']);
	});
	it('changes only the setups whose order differs', () => {
		const numbered = list.map((s, i) => ({ ...s, order: i + 1 }));
		expect(moveSetup(numbered, 'd', 2).map((c) => [c.setup.id, c.order])).toEqual([
			['d', 3],
			['c', 4]
		]);
	});
	it('changes nothing for a move to the same place or an unknown setup', () => {
		const numbered = list.map((s, i) => ({ ...s, order: i + 1 }));
		expect(moveSetup(numbered, 'b', 1)).toEqual([]);
		expect(moveSetup(numbered, 'x', 0)).toEqual([]);
		expect(moveSetup(list, 'b', 1)).toEqual([]);
		expect(moveSetup(list, 'd', 9)).toEqual([]);
	});
	it('keeps a valid camera setup', () => {
		for (const c of moveSetup(list, 'c', 0)) expect(validateRecord('cameraSetup', { ...c.setup, order: c.order })).toEqual({});
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

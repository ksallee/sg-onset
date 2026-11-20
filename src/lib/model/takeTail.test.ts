import { describe, expect, it } from 'vitest';
import { fieldsOf, findField } from './catalogue';
import { nextTake } from './take';
import { groupTail, storedTakeTail, TAKE_TAILS, takeTailOf, tailPatch } from './takeTail';
import { TAKE_TYPES } from './takeType';
import type { Take } from './types';

const take = (id: string, rest: Partial<Take> = {}): Take => ({ id, slateId: 's', take: '1', ...rest });

describe('the take tail field', () => {
	it('is a take list of clean plate and balls and chart, not carried to the next take', () => {
		const def = findField('take', 'takeTail')!.def;
		expect(def).toMatchObject({ type: 'stringList', carry: false, labelKey: 'field.take.takeTail' });
		expect(def.options).toEqual([...TAKE_TAILS]);
		expect(TAKE_TAILS).toEqual(['cleanPlate', 'ballsAndChart']);
		expect(nextTake(take('a', { takeTail: ['cleanPlate'] }), 'b').takeTail).toBeUndefined();
	});

	it('holds only plates that are take types too, so a tail turns on what its type would', () => {
		expect(TAKE_TAILS.every((t) => (TAKE_TYPES as readonly string[]).includes(t))).toBe(true);
	});

	it('sits right after the type, as the take sheet shows it', () => {
		const keys = fieldsOf('take').map((d) => d.key);
		expect(keys.indexOf('takeTail')).toBe(keys.indexOf('takeType') + 1);
	});
});

describe('takeTailOf', () => {
	it('reads the plates at the tail in the order of the catalogue, none for no value', () => {
		expect(takeTailOf({})).toEqual([]);
		expect(takeTailOf({ takeTail: ['ballsAndChart', 'cleanPlate'] })).toEqual(['cleanPlate', 'ballsAndChart']);
	});
	it('leaves out a plate this version does not know, and a value that is not a list', () => {
		expect(takeTailOf({ takeTail: ['witness', 'ballsAndChart'] })).toEqual(['ballsAndChart']);
		expect(takeTailOf({ takeTail: 'cleanPlate' as unknown as string[] })).toEqual([]);
	});
});

describe('storedTakeTail', () => {
	it('stores the plates in the order of the catalogue, each once; none is no value', () => {
		expect(storedTakeTail(['ballsAndChart', 'cleanPlate', 'ballsAndChart'])).toEqual(['cleanPlate', 'ballsAndChart']);
		expect(storedTakeTail([])).toBeUndefined();
		expect(storedTakeTail(undefined)).toBeUndefined();
	});
	it('keeps a plate it does not know after the others, as it was', () => {
		expect(storedTakeTail(['witness', 'cleanPlate'])).toEqual(['cleanPlate', 'witness']);
	});
});

describe('tailPatch', () => {
	it('adds a plate at the tail of every camera of a take, keeping the other plate', () => {
		const takes = [take('a'), take('b', { takeTail: ['ballsAndChart'] }), take('c', { takeTail: ['cleanPlate'] })];
		expect(tailPatch(takes, 'cleanPlate', true)).toEqual([
			{ id: 'a', key: 'takeTail', from: undefined, to: ['cleanPlate'] },
			{ id: 'b', key: 'takeTail', from: ['ballsAndChart'], to: ['cleanPlate', 'ballsAndChart'] }
		]);
	});
	it('takes a plate off, and an empty tail is no value', () => {
		const takes = [take('a', { takeTail: ['cleanPlate'] }), take('b', { takeTail: ['cleanPlate', 'ballsAndChart'] }), take('c')];
		expect(tailPatch(takes, 'cleanPlate', false)).toEqual([
			{ id: 'a', key: 'takeTail', from: ['cleanPlate'], to: undefined },
			{ id: 'b', key: 'takeTail', from: ['cleanPlate', 'ballsAndChart'], to: ['ballsAndChart'] }
		]);
	});
});

describe('groupTail', () => {
	it('reads the plates every camera of a take has at its tail', () => {
		expect(groupTail([take('a', { takeTail: ['cleanPlate', 'ballsAndChart'] }), take('b', { takeTail: ['ballsAndChart'] })])).toEqual(['ballsAndChart']);
		expect(groupTail([take('a', { takeTail: ['cleanPlate'] }), take('b')])).toEqual([]);
		expect(groupTail([])).toEqual([]);
	});
});

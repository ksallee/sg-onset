import { describe, expect, it } from 'vitest';
import { takeElements } from './takeElements';
import type { Take } from './types';

const take = (id: string, rest: Partial<Take> = {}): Take => ({ id, slateId: 's', take: id, ...rest });

describe('takeElements', () => {
	it('lists the takes shot for an element, by type in the order of the catalogue, each plate at a tail with its type', () => {
		const main = take('1');
		const plate = take('2', { takeType: 'cleanPlate' });
		const tailed = take('3', { takeTail: ['ballsAndChart', 'cleanPlate'] });
		const smoke = take('4', { takeType: 'atmosphere', takeTail: ['cleanPlate'] });
		expect(takeElements([main, plate, tailed, smoke])).toEqual([
			{
				type: 'cleanPlate',
				takes: [
					{ take: plate, tail: false },
					{ take: tailed, tail: true },
					{ take: smoke, tail: true }
				]
			},
			{ type: 'ballsAndChart', takes: [{ take: tailed, tail: true }] },
			{ type: 'atmosphere', takes: [{ take: smoke, tail: false }] }
		]);
	});

	it('lists a take once under its type, even with the same plate at its tail', () => {
		const t = take('2', { takeType: 'cleanPlate', takeTail: ['cleanPlate'] });
		expect(takeElements([t])).toEqual([{ type: 'cleanPlate', takes: [{ take: t, tail: false }] }]);
	});

	it('is empty for main takes with nothing at the tail', () => {
		expect(takeElements([take('1'), take('2', { takeType: 'main' })])).toEqual([]);
		expect(takeElements([])).toEqual([]);
	});
});

import { describe, expect, it } from 'vitest';
import type { SwitchRef } from '$lib/model/takeType';
import { switchesLabel, switchesText, tailLabel, typeWords } from './typeText';

const names = { slate: (id: string) => ({ s1: '12A', s2: '14' })[id] ?? '', lightingSetup: (id: string) => ({ L: 'Night', M: 'Day' })[id] ?? '' };
const plate = (id: string): SwitchRef => ({ scope: 'slate', id, key: 'cleanPlate' });
const balls = (id: string): SwitchRef => ({ scope: 'lightingSetup', id, key: 'referenceBalls' });
const chart = (id: string): SwitchRef => ({ scope: 'lightingSetup', id, key: 'colourChart' });

describe('switchesText', () => {
	it('names the record and the switch', () => {
		expect(switchesText([plate('s1')], 'stays', names)).toBe('Slate 12A: Clean plate stays on');
		expect(switchesText([plate('s1')], 'on', names)).toBe('Slate 12A: Clean plate on');
		expect(switchesText([plate('s1')], 'off', names)).toBe('Slate 12A: Clean plate turned off');
	});

	it('lists the switches of a lighting setup in the order of the form', () => {
		expect(switchesText([chart('L'), balls('L')], 'stays', names)).toBe('Lighting setup Night: Grey and chrome balls, Colour chart stay on');
		expect(switchesText([chart('L')], 'stays', names)).toBe('Lighting setup Night: Colour chart stays on');
	});

	it('counts the records when there are several', () => {
		expect(switchesText([plate('s1'), plate('s2')], 'stays', names)).toBe('2 slates: Clean plate stays on');
		expect(switchesText([balls('L'), chart('M')], 'off', names)).toBe('2 lighting setups: Grey and chrome balls, Colour chart turned off');
	});

	it('says the slates first, then the lighting setups', () => {
		expect(switchesText([balls('L'), plate('s1')], 'stays', names)).toBe('Slate 12A: Clean plate stays on. Lighting setup Night: Grey and chrome balls stays on');
	});

	it('names the switches a reference kind turns on, in the order of the form', () => {
		const lidar: SwitchRef = { scope: 'slate', id: 's1', key: 'lidar' };
		const witness: SwitchRef = { scope: 'slate', id: 's1', key: 'witnessCamera' };
		const hdri: SwitchRef = { scope: 'lightingSetup', id: 'L', key: 'hdri' };
		expect(switchesText([lidar], 'on', names)).toBe('Slate 12A: Lidar scan on');
		expect(switchesText([witness, lidar], 'stays', names)).toBe('Slate 12A: Lidar scan, Witness camera stay on');
		expect(switchesText([hdri], 'off', names)).toBe('Lighting setup Night: HDRI turned off');
	});

	it('says nothing of nothing', () => {
		expect(switchesText([], 'stays', names)).toBe('');
	});
});

describe('switchesLabel', () => {
	it('is the clause as a message key, for an undo entry', () => {
		expect(switchesLabel([plate('s1')], 'off', names)).toEqual({ key: 'take.type.off', params: { where: 'Slate 12A', switches: 'Clean plate' } });
	});
	it('joins two clauses', () => {
		expect(switchesLabel([plate('s1'), chart('L')], 'off', names)).toEqual({
			key: 'take.type.done',
			params: { what: 'Slate 12A: Clean plate turned off', then: 'Lighting setup Night: Colour chart turned off' }
		});
	});
	it('is nothing for nothing', () => {
		expect(switchesLabel([], 'off', names)).toBeUndefined();
	});
});

describe('typeWords', () => {
	it('names the type when it is not Main, then each plate at the tail', () => {
		expect(typeWords('main', [])).toEqual([]);
		expect(typeWords(undefined, [])).toEqual([]);
		expect(typeWords('lightPass', [])).toEqual(['Light pass']);
		expect(typeWords('main', ['cleanPlate'])).toEqual(['Clean plate tail']);
		expect(typeWords('atmosphere', ['cleanPlate', 'ballsAndChart'])).toEqual(['Atmosphere', 'Clean plate tail', 'Balls and chart tail']);
	});
});

describe('tailLabel', () => {
	it('says what an edit put at the tail of a take, or took off it', () => {
		expect(tailLabel('3', 'cleanPlate', true)).toEqual({ key: 'take.edit.tail.on', params: { take: '3', tail: 'Clean plate' } });
		expect(tailLabel('PU', 'ballsAndChart', false)).toEqual({ key: 'take.edit.tail.off', params: { take: 'PU', tail: 'Balls and chart' } });
	});
});

import { describe, expect, it } from 'vitest';
import { metres, parseLength } from '$lib/model/length';
import type { Take } from '$lib/model/types';
import { numberFields } from './fields';
import { RECENT_CAP, recentValues } from './recent';

const def = (key: string) => numberFields().find((d) => d.key === key)!;
const at = (min: number) => new Date(Date.UTC(2026, 10, 11, 9, min)).toISOString();
const take = (id: string, min: number | undefined, rest: Partial<Take>): Take => ({ id, slateId: 's', take: id, ...(min === undefined ? {} : { startedAt: at(min) }), ...rest });

describe('recentValues', () => {
	it('lists the values stored on the takes, newest first, each once', () => {
		const takes = [take('1', 0, { tStop: 2.8 }), take('2', 5, { tStop: 4 }), take('3', 9, { tStop: 2.8 }), take('4', undefined, { tStop: 5.6 })];
		expect(recentValues(takes, def('tStop'), 'tStop', 'metric').map((r) => r.text)).toEqual(['5.6', '2.8', '4']);
	});
	it('gives the stored value with its text, in the units set', () => {
		const height = parseLength("5' 6\"", 'imperial')!;
		const [r] = recentValues([take('1', 0, { lensHeight: height })], def('lensHeight'), 'lensHeight', 'imperial');
		expect(r).toEqual({ text: '5\' 6"', value: height });
	});
	it('shows a metric length as the keypad types it, with no unit word', () => {
		expect(recentValues([take('1', 0, { focusDistance: metres(4.2) })], def('focusDistance'), 'focusDistance', 'metric')[0].text).toBe('4.2');
	});
	it('counts two lengths with the same metres as one value', () => {
		const takes = [take('1', 0, { focusDistance: metres(1.8288) }), take('2', 1, { focusDistance: parseLength('6', 'imperial')! })];
		expect(recentValues(takes, def('focusDistance'), 'focusDistance', 'imperial')).toHaveLength(1);
	});
	it('reads the end key when asked, and keeps the cap', () => {
		const takes = Array.from({ length: 9 }, (_, i) => take(String(i), i, { tiltEnd: i }));
		const r = recentValues(takes, def('tilt'), 'tiltEnd', 'metric');
		expect(r).toHaveLength(RECENT_CAP);
		expect(r[0].text).toBe('8');
	});
});

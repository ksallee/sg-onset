import { describe, expect, it } from 'vitest';
import { exportedLine, lastExport, noteExport, parseLog } from './lastExport';

describe('the export log', () => {
	it('reads nothing from nothing or junk', () => {
		expect(parseLog(null)).toEqual({});
		expect(parseLog('not json')).toEqual({});
		expect(parseLog('[1]')).toEqual({});
		expect(parseLog('{"d1": "x", "d2": 5}')).toEqual({ d2: 5 });
	});
	it('notes the time for each day exported, keeping the others', () => {
		const log = noteExport({ d1: 1 }, ['d2', 'd3'], 50);
		expect(log).toEqual({ d1: 1, d2: 50, d3: 50 });
		expect(lastExport(log, 'd3')).toBe(50);
		expect(lastExport(log, 'd9')).toBeUndefined();
	});
	it('round-trips', () => {
		expect(parseLog(JSON.stringify(noteExport({}, ['a'], 7)))).toEqual({ a: 7 });
	});
});

describe('exportedLine', () => {
	const now = new Date(2026, 10, 11, 21, 0);
	it('says today', () => {
		expect(exportedLine(new Date(2026, 10, 11, 19, 42).getTime(), now)).toEqual({ key: 'wrap.exported.today', params: { time: '19:42', date: '' } });
	});
	it('says yesterday', () => {
		expect(exportedLine(new Date(2026, 10, 10, 8, 5).getTime(), now)).toEqual({ key: 'wrap.exported.yesterday', params: { time: '08:05', date: '' } });
	});
	it('gives the date further back', () => {
		expect(exportedLine(new Date(2026, 10, 2, 18, 0).getTime(), now)).toEqual({ key: 'wrap.exported.on', params: { time: '18:00', date: 'Mon 2 Nov 2026' } });
	});
});

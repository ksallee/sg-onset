import { describe, expect, it } from 'vitest';
import { EXPORT_FORMAT, EXPORT_FORMAT_VERSION, exportJson, readExportJson, toExportData } from './json';
import { alexa, camA, camB, dusk, input, prime32, s42A, still1, still2, t42A1A, venice, zoom } from './testData';

const now = '2026-11-11T02:00:00.000Z';

describe('toExportData', () => {
	it('holds the selection and what it points at', () => {
		const data = toExportData(input(), { now, filters: { slateFrom: '42A', slateTo: '42A' } });
		expect(data.format).toBe(EXPORT_FORMAT);
		expect(data.formatVersion).toBe(EXPORT_FORMAT_VERSION);
		expect(data.exportedAt).toBe(now);
		expect(data.filters).toEqual({ slateFrom: '42A', slateTo: '42A' });
		expect(data.project).toEqual(input().project);
		expect(data.shootDays.map((d) => d.id)).toEqual(['d3']);
		expect(data.slates).toEqual([s42A]);
		expect(data.takes).toHaveLength(5);
		expect(data.lightingSetups).toEqual([dusk]);
		expect(data.cameraSetups).toEqual([camA, camB]);
		expect(data.cameras).toEqual([alexa, venice]);
		expect(data.lenses).toEqual([prime32, zoom]);
		expect(data.stills.map((s) => s.id)).toEqual(['st2', 'st1', 'st3']);
	});

	it('keeps a slate with no takes when it is in range', () => {
		const data = input();
		data.slates.push({ id: 's11', shootDayId: 'd3', slateUID: '11' });
		expect(toExportData(data, { now }).slates.map((s) => s.slateUID)).toEqual(['9', '10', '11', '42A', '50']);
	});

	it('leaves out takes the filters drop, and their photos', () => {
		const data = toExportData(input(), { now, filters: { excludeNoGood: true } });
		expect(data.takes.map((t) => t.id)).not.toContain('t42A2A');
		expect(data.stills.map((s) => s.id)).toEqual(['st2', 'st1']);
	});
});

describe('exportJson', () => {
	it('puts keys in a stable order: id, parents, catalogue order, the rest', () => {
		const text = exportJson(input(), { now });
		const take = JSON.parse(text).takes.find((t: { id: string }) => t.id === t42A1A.id);
		const keys = Object.keys(take);
		expect(keys.slice(0, 4)).toEqual(['id', 'slateId', 'take', 'startedAt']);
		expect(keys.indexOf('focalLength')).toBeLessThan(keys.indexOf('tStop'));
		expect(keys.indexOf('tilt') + 1).toBe(keys.indexOf('tiltEnd'));
		expect(Object.keys(take.focusDistance)).toEqual(['m', 'entered']);
		expect(Object.keys(take.focusDistance.entered)).toEqual(['text', 'system']);
		const top = Object.keys(JSON.parse(text));
		expect(top).toEqual(['format', 'formatVersion', 'exportedAt', 'filters', 'project', 'shootDays', 'lightingSetups', 'cameraSetups', 'cameras', 'lenses', 'slates', 'takes', 'stills']);
	});

	it('is the same text whatever order the input comes in', () => {
		const data = input();
		const shuffled = { ...data, takes: [...data.takes].reverse(), lenses: [...data.lenses].reverse(), stills: [...data.stills].reverse() };
		expect(exportJson(shuffled, { now })).toBe(exportJson(data, { now }));
	});
});

describe('readExportJson', () => {
	it('reads back exactly what was written', () => {
		const data = toExportData(input(), { now });
		const back = readExportJson(exportJson(input(), { now }));
		expect(back).toEqual({ ok: true, data });
	});

	it('gives back records equal to the ones the store held, typed text and fractions kept', () => {
		const back = readExportJson(exportJson(input(), { now }));
		if (!back.ok) throw new Error(back.reason);
		expect(back.data.takes.find((t) => t.id === t42A1A.id)).toEqual(t42A1A);
		expect(back.data.stills).toContainEqual(still2);
		expect(back.data.stills).toContainEqual(still1);
	});

	it('refuses what is not ours, or newer, or broken', () => {
		expect(readExportJson('not json')).toEqual({ ok: false, reason: 'notJson' });
		expect(readExportJson('{"format":"other"}')).toEqual({ ok: false, reason: 'notExport' });
		expect(readExportJson(JSON.stringify({ format: EXPORT_FORMAT, formatVersion: EXPORT_FORMAT_VERSION + 1 }))).toEqual({ ok: false, reason: 'newerVersion' });
		const broken = JSON.parse(exportJson(input(), { now }));
		broken.takes[0].id = 7;
		expect(readExportJson(JSON.stringify(broken))).toEqual({ ok: false, reason: 'badShape' });
		delete broken.slates;
		expect(readExportJson(JSON.stringify(broken))).toEqual({ ok: false, reason: 'badShape' });
	});
});

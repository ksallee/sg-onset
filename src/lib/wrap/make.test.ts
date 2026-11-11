import { describe, expect, it } from 'vitest';
import { CRIF_COLUMNS, exportCrif } from '$lib/export/crif';
import type { PlainLabels } from '$lib/export/plainCsv';
import { flatten } from '$lib/export/selection';
import { input } from '$lib/export/testData';
import { defaultChoice } from './choice';
import { makeTexts, plural } from './make';

const labels: PlainLabels = {
	field: (def, end) => `${def.key}${end ? ', end' : ''}`,
	scope: (scope) => scope,
	option: (_def, option) => option,
	unit: (unit) => unit,
	yes: 'yes',
	no: 'no'
};
const ctx = { now: '2026-11-11T02:00:00.000Z', timeZone: 'Europe/London', labels };
const day3 = { ...defaultChoice() };

describe('plural', () => {
	it('picks the key for one or many', () => {
		expect(plural('wrap.note.ale.noTimecode', 1)).toBe('wrap.note.ale.noTimecode.one');
		expect(plural('wrap.note.ale.noTimecode', 0)).toBe('wrap.note.ale.noTimecode.other');
		expect(plural('wrap.note.ale.noTimecode', 6)).toBe('wrap.note.ale.noTimecode.other');
	});
});

describe('makeTexts', () => {
	const made = makeTexts(input(), day3, ['d3'], ctx);

	it('flattens the takes of the days picked', () => {
		expect(made.rows).toHaveLength(7);
		expect(new Set(made.rows.map((r) => r.shootDay.id))).toEqual(new Set(['d3']));
	});

	it('makes each table file picked', () => {
		expect(made.texts.crif?.startsWith(`"${CRIF_COLUMNS[0].name}"`)).toBe(true);
		expect(made.texts.plainCsv?.split('\r\n')[0]).toContain('focalLength');
		expect(made.texts.ale?.startsWith('Heading')).toBe(true);
		expect(JSON.parse(made.texts.json!).format).toBe('sg-onset-export');
	});

	it('makes none it was not asked for', () => {
		const some = makeTexts(input(), { ...day3, files: ['crif', 'photos'] }, ['d3'], ctx);
		expect(Object.keys(some.texts)).toEqual(['crif']);
	});

	it('follows the filters', () => {
		const circled = makeTexts(input(), { ...day3, circledOnly: true }, ['d3'], ctx);
		expect(circled.rows.map((r) => r.take.id).sort()).toEqual(['7a000000-0000-4000-8000-000000000001', 't9']);
	});

	it('writes CRIF lengths in metres when asked, and says the spec does not allow it', () => {
		const metric = makeTexts(input(), { ...day3, lengths: 'metric' }, ['d3'], ctx);
		expect(metric.texts.crif).toContain('3.048 m');
		expect(metric.notes.crif.map((n) => n.key)).toContain('wrap.note.crif.metric');
		expect(made.notes.crif.map((n) => n.key)).not.toContain('wrap.note.crif.metric');
	});

	it('says which CRIF columns it never fills, and how many takes lack others', () => {
		const lacking = exportCrif(made.rows, { timeZone: ctx.timeZone, now: ctx.now }).missing.filter((m) => m.columns.length > 0).length;
		expect(made.notes.crif[0]).toEqual({ key: 'wrap.note.crif.never', params: { columns: 'VFX Work, Script Location, Camera Head, Film Stock' } });
		const missing = made.notes.crif.find((n) => n.key.startsWith('wrap.note.crif.missing'));
		expect(missing?.params.n).toBe(lacking);
		expect(String(missing?.params.columns).split(', ').length).toBeLessThanOrEqual(3);
	});

	it('says how many takes the ALE leaves out for want of timecode', () => {
		// Only 42A take 1 on A has timecode on day 3.
		expect(made.notes.ale).toContainEqual({ key: 'wrap.note.ale.noTimecode.other', params: { n: 6 } });
		expect(made.ale?.skipped).toHaveLength(6);
	});

	it('writes plain CSV units in columns when asked', () => {
		const cols = makeTexts(input(), { ...day3, plainUnits: 'columns' }, ['d3'], ctx);
		expect(cols.texts.plainCsv).toContain('(unit)');
	});

	it('keeps the rows in the export order', () => {
		expect(made.rows.map((r) => r.take.id)).toEqual(flatten(input(), { shootDayIds: ['d3'] }).map((r) => r.take.id));
	});
});

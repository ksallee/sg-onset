import { describe, expect, it } from 'vitest';
import { create, del, update } from '$lib/outbox/testkit';
import type { CreateOp, DeleteOp, UpdateOp } from '$lib/outbox/types';
import { applyListOps, isListTable, landed, listFields, LIST_VERSION, readList, writeList, type ListEntry } from './lists';

type RecordOp = CreateOp | UpdateOp | DeleteOp;
const op = (entryId: string, o: unknown) => ({ entryId, op: o as RecordOp });

const dayExt: ListEntry = { id: 'tp1', name: 'Day ext', scope: 'take', values: { tStop: 2.8, focusDistance: { m: 3, entered: '3 m' } } };

describe('isListTable', () => {
	it('is the templates and the kinds of set reference a project adds', () => {
		expect(isListTable('template')).toBe(true);
		expect(isListTable('referenceKind')).toBe(true);
		expect(isListTable('lens')).toBe(false);
	});
});

describe('readList and writeList', () => {
	it('reads back what it wrote', () => {
		const text = writeList('template', [dayExt]);
		expect(readList('template', text)).toEqual({ ok: true, entries: [dayExt] });
	});
	it('reads an empty field as no entries: a text field has no empty string, it reads null (field_types/text.md)', () => {
		expect(readList('template', null)).toEqual({ ok: true, entries: [] });
		expect(readList('template', undefined)).toEqual({ ok: true, entries: [] });
		expect(readList('template', '')).toEqual({ ok: true, entries: [] });
	});
	it('names the list and the version, so another list or a later version is never taken for this one', () => {
		const parsed = JSON.parse(writeList('referenceKind', [{ id: 'k1', name: 'Drone scan' }]));
		expect(parsed).toEqual({ list: 'referenceKind', version: LIST_VERSION, entries: [{ id: 'k1', name: 'Drone scan' }] });
		expect(readList('template', writeList('referenceKind', []))).toEqual({ ok: false });
		expect(readList('template', JSON.stringify({ list: 'template', version: LIST_VERSION + 1, entries: [] }))).toEqual({ ok: false });
	});
	it('cannot read text a person typed, nor entries with no id', () => {
		expect(readList('template', 'Day ext, Night int')).toEqual({ ok: false });
		expect(readList('template', JSON.stringify({ list: 'template', version: 1, entries: [{ name: 'x' }] }))).toEqual({ ok: false });
		expect(readList('template', JSON.stringify({ list: 'template', version: 1, entries: 'x' }))).toEqual({ ok: false });
		expect(readList('template', 42)).toEqual({ ok: false });
	});
	it('keeps only the keys a list holds: the project is the field’s own', () => {
		const text = writeList('referenceKind', [{ id: 'k1', name: 'Drone scan', projectId: 'p1' }]);
		expect(readList('referenceKind', text)).toEqual({ ok: true, entries: [{ id: 'k1', name: 'Drone scan' }] });
	});
	it('keeps a long list whole: no cap was found at 100,000 characters (field_types/text.md)', () => {
		const many = Array.from({ length: 400 }, (_, i) => ({ ...dayExt, id: `tp${i}`, name: `Template ${i}` }));
		const text = writeList('template', many);
		expect(text.length).toBeGreaterThan(30_000);
		expect(readList('template', text)).toEqual({ ok: true, entries: many });
	});
});

describe('applyListOps', () => {
	it('adds a create, with the keys the list holds', () => {
		const out = applyListOps('template', [], [op('e1', create('template', 'tp1', { projectId: 'p1', name: 'Day ext', scope: 'take', values: { tStop: 2.8 } }))]);
		expect(out).toEqual({ entries: [{ id: 'tp1', name: 'Day ext', scope: 'take', values: { tStop: 2.8 } }], refusals: [] });
	});
	it('refuses a create whose id is there as a duplicate, as a unique field does (findings/127)', () => {
		const out = applyListOps('template', [dayExt], [op('e1', create('template', 'tp1', { name: 'Other' }))]);
		expect(out.refusals).toEqual([{ entryId: 'e1', reason: 'duplicate' }]);
	});
	it('changes the keys an update names, and clears a key set to nothing', () => {
		const out = applyListOps('template', [dayExt], [op('e1', update('template', 'tp1', { name: ['Day ext', 'Day int'], values: [dayExt.values, undefined] }))]);
		expect(out.entries).toEqual([{ id: 'tp1', name: 'Day int', scope: 'take' }]);
		expect(out.refusals).toEqual([]);
	});
	it('refuses an update of an entry the list no longer holds as gone', () => {
		const out = applyListOps('template', [], [op('e1', update('template', 'tp1', { name: ['a', 'b'] }))]);
		expect(out.refusals).toEqual([{ entryId: 'e1', reason: 'gone' }]);
	});
	it('takes a deleted entry out; one already gone is gone', () => {
		expect(applyListOps('template', [dayExt], [op('e1', del('template', 'tp1'))])).toEqual({ entries: [], refusals: [] });
		expect(applyListOps('template', [], [op('e1', del('template', 'tp1'))]).refusals).toEqual([{ entryId: 'e1', reason: 'gone' }]);
	});
	it('refuses a key the list has no place for, rather than drop it', () => {
		const out = applyListOps('referenceKind', [], [op('e1', create('referenceKind', 'k1', { name: 'Drone', colour: 'red' }))]);
		expect(out.refusals).toEqual([{ entryId: 'e1', reason: 'invalid', message: 'referenceKind.colour has no field in Flow Production Tracking' }]);
	});
	it('applies the operations in order: a create then its edit', () => {
		const out = applyListOps(
			'referenceKind',
			[{ id: 'k0', name: 'Old' }],
			[op('e1', create('referenceKind', 'k1', { name: 'Drone' })), op('e2', update('referenceKind', 'k1', { name: ['Drone', 'Drone scan'] })), op('e3', del('referenceKind', 'k0'))]
		);
		expect(out).toEqual({ entries: [{ id: 'k1', name: 'Drone scan' }], refusals: [] });
	});
	it('leaves the entries it was given alone', () => {
		const entries = [dayExt];
		applyListOps('template', entries, [op('e1', update('template', 'tp1', { name: ['Day ext', 'x'] }))]);
		expect(entries[0].name).toBe('Day ext');
	});
});

describe('landed', () => {
	const ops = [op('e1', create('referenceKind', 'k1', { name: 'Drone' })), op('e2', update('referenceKind', 'k2', { name: ['A', 'B'] })), op('e3', del('referenceKind', 'k3'))];
	it('is true when the list holds every operation: the create, the edit, and not the deleted entry', () => {
		expect(landed('referenceKind', [{ id: 'k1', name: 'Drone' }, { id: 'k2', name: 'B' }], ops)).toBe(true);
	});
	it('is false when another device wrote the field between the read and the write', () => {
		expect(landed('referenceKind', [{ id: 'k2', name: 'B' }], ops)).toBe(false);
		expect(landed('referenceKind', [{ id: 'k1', name: 'Drone' }, { id: 'k2', name: 'A' }], ops)).toBe(false);
		expect(landed('referenceKind', [{ id: 'k1', name: 'Drone' }, { id: 'k2', name: 'B' }, { id: 'k3', name: 'C' }], ops)).toBe(false);
	});
	it('compares values as the model does: a length by its metres', () => {
		const make = op('e1', create('template', 'tp1', dayExt));
		expect(landed('template', [{ ...dayExt, values: { tStop: 2.8, focusDistance: { m: 3 } } }], [make])).toBe(true);
	});
});

describe('listFields', () => {
	it('gives the keys asked for that the entry holds', () => {
		expect(listFields(dayExt, ['name', 'values', 'projectId'])).toEqual({ name: 'Day ext', values: dayExt.values });
	});
});

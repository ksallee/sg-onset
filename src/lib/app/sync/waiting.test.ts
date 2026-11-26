import { describe, expect, it } from 'vitest';
import type { Entry, Op } from '$lib/outbox/types';
import { arrivedFields, elsewhereCount, fieldsHeld, readLacking, splitWaiting, waitingTables, waits, withoutFields, writeLacking } from './waiting';

const entry = (id: string, seq: number, op: Op, extra: Partial<Entry> = {}): Entry => ({ id, seq, op, dependsOn: [], state: 'pending', attempts: 0, createdAt: seq, ...extra });
const create = (table: string, recordId: string): Op => ({ kind: 'create', table, recordId, fields: {} });
const update = (table: string, recordId: string): Op => ({ kind: 'update', table, recordId, changes: {} });
const blob = (recordId: string): Op => ({ kind: 'blob', table: 'still', recordId, blobId: `b-${recordId}`, size: 10, type: 'image/jpeg' });

// Kevin, #117: Set Reference is optional. On a site without it the references wait on the device.
describe('waitingTables', () => {
	it('holds the set references back on a site without Set Reference, and nothing otherwise', () => {
		expect(waitingTables({ referencesMissing: true })).toEqual(['reference']);
		expect(waitingTables({ referencesMissing: false })).toEqual([]);
		expect(waitingTables({})).toEqual([]);
	});

	// #110: templates, reference kinds and rigs are JSON on the Project; each waits without its field (#138).
	it('holds back each shared list whose Project field the site lacks', () => {
		expect(waitingTables({ listsMissing: ['template', 'referenceKind', 'rig'] })).toEqual(['template', 'referenceKind', 'rig']);
		expect(waitingTables({ referencesMissing: true, listsMissing: ['rig'] })).toEqual(['reference', 'rig']);
		expect(waitingTables({ listsMissing: [] })).toEqual([]);
	});

	// A Set Shot is no record on the device: nothing of the queue waits for it.
	it('holds nothing back for Set Shot', () => {
		expect(waitingTables({ setShotsMissing: true })).toEqual([]);
	});
});

describe('splitWaiting', () => {
	const queue = [
		entry('1', 1, create('slate', 's1')),
		entry('2', 2, create('reference', 'r1')),
		entry('3', 3, create('take', 't1')),
		entry('4', 4, update('reference', 'r2'), { state: 'failedRetryable' }),
		entry('5', 5, blob('ph1'))
	];

	it('keeps every entry of a table that waits out of what the runner may send, in order, and drops none', () => {
		const { open, waiting } = splitWaiting(queue, ['reference']);
		expect(open.map((e) => e.id)).toEqual(['1', '3', '5']);
		expect(waiting.map((e) => e.id)).toEqual(['2', '4']);
	});

	it('lets everything through when nothing waits', () => {
		expect(splitWaiting(queue, [])).toEqual({ open: queue, waiting: [] });
		expect(queue.some((e) => waits(e, []))).toBe(false);
	});

	it('tells an entry that waits by its table, whatever its kind or state', () => {
		expect(queue.filter((e) => waits(e, ['reference'])).map((e) => e.op.kind)).toEqual(['create', 'update']);
	});
});

describe('elsewhereCount', () => {
	const counts = (entries: number) => ({ entries, records: entries, blobs: 0, attention: 0 });

	it('counts the changes of other projects, never what waits in this one for an entity', () => {
		expect(elsewhereCount(counts(7), counts(3), counts(2))).toBe(2);
		expect(elsewhereCount(counts(5), counts(3), undefined)).toBe(2);
		expect(elsewhereCount(counts(5), counts(5), counts(0))).toBe(0);
	});

	it('counts nothing before the project is counted, and never below nothing', () => {
		expect(elsewhereCount(counts(4), undefined, undefined)).toBe(0);
		expect(elsewhereCount(undefined, undefined, undefined)).toBe(0);
		expect(elsewhereCount(counts(2), counts(3), counts(1))).toBe(0);
	});
});

// Kevin, 2026-11-25 (#138): the Rig is an optional field. On a site without it the rest of each
// record goes, the rig stays on the device, and once the field is made every rig is sent.
describe('withoutFields', () => {
	const fields = ['take.cameraMount'];
	it('leaves the waiting keys out of a create or an update of their table, and the entry alone otherwise', () => {
		const made = entry('e1', 1, { kind: 'create', table: 'take', recordId: 't1', fields: { take: '1', cameraMount: 'dolly' } });
		expect(withoutFields(made, fields).op).toEqual({ kind: 'create', table: 'take', recordId: 't1', fields: { take: '1' } });
		const edited = entry('e2', 2, { kind: 'update', table: 'take', recordId: 't1', changes: { cameraMount: { base: 'tripod', value: 'dolly' } } });
		expect(withoutFields(edited, fields).op).toEqual({ kind: 'update', table: 'take', recordId: 't1', changes: {} });
		const setup = entry('e3', 3, { kind: 'create', table: 'cameraSetup', recordId: 'cs1', fields: { cameraMount: 'dolly' } });
		expect(withoutFields(setup, fields)).toBe(setup);
		const plain = entry('e4', 4, { kind: 'update', table: 'take', recordId: 't1', changes: { tStop: { base: 2, value: 4 } } });
		expect(withoutFields(plain, fields)).toBe(plain);
		expect(withoutFields(made, [])).toBe(made);
	});
});

describe('arrivedFields', () => {
	it('is the fields the site lacked before and has now', () => {
		expect(arrivedFields(['take.cameraMount', 'cameraSetup.cameraMount'], ['cameraSetup.cameraMount'])).toEqual(['take.cameraMount']);
		expect(arrivedFields(['take.cameraMount'], ['take.cameraMount'])).toEqual([]);
	});
	it('is none when nothing was kept: a device that never saw the field missing sent every rig', () => {
		expect(arrivedFields(undefined, [])).toEqual([]);
	});
	it('reads what was kept, and nothing from text it cannot read', () => {
		expect(readLacking(writeLacking(['take.cameraMount']))).toEqual(['take.cameraMount']);
		expect(readLacking(null)).toBeUndefined();
		expect(readLacking('{"x":1}')).toBeUndefined();
		expect(readLacking('[1]')).toBeUndefined();
		expect(readLacking('not json')).toBeUndefined();
	});
});

// Kevin, 2026-11-25 (#138): the sync sheet says rigs wait while the site lacks the Rig and a take or
// camera setup here holds one.
describe('fieldsHeld', () => {
	const rows = { take: [{ id: 't1' }, { id: 't2', cameraMount: 'dolly' }], cameraSetup: [{ id: 'cs1', cameraMount: '' }] };
	it('is the missing fields a record here holds a value of', () => {
		expect(fieldsHeld(['take.cameraMount', 'cameraSetup.cameraMount'], rows)).toEqual(['take.cameraMount']);
		expect(fieldsHeld(['cameraSetup.cameraMount'], rows)).toEqual([]);
	});
	it('is none while no field is missing, or no record holds one', () => {
		expect(fieldsHeld([], rows)).toEqual([]);
		expect(fieldsHeld(['take.cameraMount'], { take: [{ id: 't1' }] })).toEqual([]);
		expect(fieldsHeld(['take.cameraMount'], {})).toEqual([]);
	});
});

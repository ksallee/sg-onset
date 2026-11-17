import { describe, expect, it } from 'vitest';
import type { ClipImport, Take } from '$lib/model/types';
import type { Clip } from './clips';
import { clipImportRecord, clipValues, lastFilled, planFill } from './plan';

const clip = (extra: Partial<Clip> = {}): Clip => ({
	row: 10,
	name: 'A001C003_261117_S8XY',
	roll: 'A001',
	camera: 'A',
	start: '14:02:11:04',
	end: '14:02:59:09',
	rate: { num: 24, denom: 1 },
	dropFrame: false,
	...extra
});
const take = (extra: Partial<Take> = {}): Take => ({ id: 't1', slateId: 's1', take: '3', ...extra });
const imported = (id: string, importedAt: string, filled: ClipImport['filled']): ClipImport => ({ id, shootDayId: 'd1', importedAt, filled });

describe('clipValues', () => {
	it('gives the take fields a clip fills, only those it has', () => {
		expect(clipValues(clip())).toEqual({ clipName: 'A001C003_261117_S8XY', cameraRoll: 'A001', timecodeStart: '14:02:11:04', timecodeEnd: '14:02:59:09' });
		expect(clipValues(clip({ roll: undefined, start: undefined, end: undefined }))).toEqual({ clipName: 'A001C003_261117_S8XY' });
	});
});

describe('planFill, the first import', () => {
	it('fills every empty field, as one patch', () => {
		const plan = planFill([{ clip: clip(), take: take() }], new Map());
		expect(plan.takes).toEqual([
			{
				takeId: 't1',
				row: 10,
				fields: [
					{ key: 'clipName', kind: 'add', to: 'A001C003_261117_S8XY' },
					{ key: 'cameraRoll', kind: 'add', to: 'A001' },
					{ key: 'timecodeStart', kind: 'add', to: '14:02:11:04' },
					{ key: 'timecodeEnd', kind: 'add', to: '14:02:59:09' }
				]
			}
		]);
		expect(plan.patch).toEqual([
			{ id: 't1', key: 'clipName', from: undefined, to: 'A001C003_261117_S8XY' },
			{ id: 't1', key: 'cameraRoll', from: undefined, to: 'A001' },
			{ id: 't1', key: 'timecodeStart', from: undefined, to: '14:02:11:04' },
			{ id: 't1', key: 'timecodeEnd', from: undefined, to: '14:02:59:09' }
		]);
		expect(plan.filled).toEqual({ t1: { clipName: 'A001C003_261117_S8XY', cameraRoll: 'A001', timecodeStart: '14:02:11:04', timecodeEnd: '14:02:59:09' } });
		expect(plan.counts).toEqual({ takes: 1, add: 4, update: 0, kept: 0 });
	});

	it('never changes a typed value: a different one is kept and listed, the same one is nothing to do', () => {
		const plan = planFill([{ clip: clip(), take: take({ cameraRoll: 'A002', clipName: 'A001C003_261117_S8XY' }) }], new Map());
		expect(plan.takes[0].fields).toEqual([
			{ key: 'cameraRoll', kind: 'kept', from: 'A002', to: 'A001' },
			{ key: 'timecodeStart', kind: 'add', to: '14:02:11:04' },
			{ key: 'timecodeEnd', kind: 'add', to: '14:02:59:09' }
		]);
		expect(plan.patch.map((c) => c.key)).toEqual(['timecodeStart', 'timecodeEnd']);
		expect(plan.filled).toEqual({ t1: { timecodeStart: '14:02:11:04', timecodeEnd: '14:02:59:09' } });
		expect(plan.counts).toEqual({ takes: 1, add: 2, update: 0, kept: 1 });
	});

	it('lists a take with nothing to fill, and does not count it', () => {
		const full = take({ clipName: 'A001C003_261117_S8XY', cameraRoll: 'A001', timecodeStart: '14:02:11:04', timecodeEnd: '14:02:59:09' });
		const plan = planFill([{ clip: clip(), take: full }], new Map());
		expect(plan.takes).toEqual([{ takeId: 't1', row: 10, fields: [] }]);
		expect(plan.patch).toEqual([]);
		expect(plan.filled).toEqual({});
		expect(plan.counts).toEqual({ takes: 0, add: 0, update: 0, kept: 0 });
	});
});

describe('planFill, a re-import of the same day', () => {
	const before = take({ clipName: 'A001C002_261117_S8XY', cameraRoll: 'A001', timecodeStart: '14:01:00:00' });
	const filledBefore = new Map([['t1', { clipName: 'A001C002_261117_S8XY', cameraRoll: 'A001', timecodeStart: '14:01:00:00' }]]);

	it('updates a field the import filled and nobody edited since', () => {
		const plan = planFill([{ clip: clip(), take: before }], filledBefore);
		expect(plan.takes[0].fields).toEqual([
			{ key: 'clipName', kind: 'update', from: 'A001C002_261117_S8XY', to: 'A001C003_261117_S8XY' },
			{ key: 'timecodeStart', kind: 'update', from: '14:01:00:00', to: '14:02:11:04' },
			{ key: 'timecodeEnd', kind: 'add', to: '14:02:59:09' }
		]);
		expect(plan.patch).toContainEqual({ id: 't1', key: 'clipName', from: 'A001C002_261117_S8XY', to: 'A001C003_261117_S8XY' });
		expect(plan.counts).toEqual({ takes: 1, add: 1, update: 2, kept: 0 });
	});

	it('never touches a field a person edited after the import', () => {
		const edited = { ...before, clipName: 'A001C009_261117_S8XY' };
		const plan = planFill([{ clip: clip(), take: edited }], filledBefore);
		expect(plan.takes[0].fields[0]).toEqual({ key: 'clipName', kind: 'kept', from: 'A001C009_261117_S8XY', to: 'A001C003_261117_S8XY' });
		expect(plan.patch.map((c) => c.key)).not.toContain('clipName');
	});

	it('fills a field again once it is empty', () => {
		const cleared = { ...before, clipName: undefined };
		const plan = planFill([{ clip: clip(), take: cleared }], filledBefore);
		expect(plan.takes[0].fields[0]).toEqual({ key: 'clipName', kind: 'add', to: 'A001C003_261117_S8XY' });
	});
});

describe('lastFilled', () => {
	it('holds, per take and field, what the latest import of the day wrote', () => {
		const imports = [
			imported('i2', '2026-11-17T19:00:00Z', { t1: { clipName: 'B' }, t2: { cameraRoll: 'A002' } }),
			imported('i1', '2026-11-17T18:00:00Z', { t1: { clipName: 'A', cameraRoll: 'A001' } })
		];
		const last = lastFilled(imports);
		expect(last.get('t1')).toEqual({ clipName: 'B', cameraRoll: 'A001' });
		expect(last.get('t2')).toEqual({ cameraRoll: 'A002' });
		expect(last.get('t3')).toBeUndefined();
	});
});

describe('clipImportRecord', () => {
	it('is the entry that keeps what the import wrote', () => {
		const plan = planFill([{ clip: clip(), take: take() }], new Map());
		expect(clipImportRecord(plan, { id: 'i1', shootDayId: 'd1', importedAt: '2026-11-17T19:00:00Z', fileName: 'A001.ale' })).toEqual({
			id: 'i1',
			shootDayId: 'd1',
			importedAt: '2026-11-17T19:00:00Z',
			fileName: 'A001.ale',
			filled: plan.filled
		});
		expect(clipImportRecord(plan, { id: 'i1', shootDayId: 'd1', importedAt: '2026-11-17T19:00:00Z' })).not.toHaveProperty('fileName');
	});
});

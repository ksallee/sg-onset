import { describe, expect, it } from 'vitest';
import type { ClipImport, Lens, Take } from '$lib/model/types';
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

	it('leaves a field empty that a person cleared after the import: cleared is edited', () => {
		const cleared = { ...before, clipName: undefined };
		const plan = planFill([{ clip: clip(), take: cleared }], filledBefore);
		expect(plan.takes[0].fields[0]).toEqual({ key: 'clipName', kind: 'kept', to: 'A001C003_261117_S8XY' });
		expect(plan.patch.map((c) => c.key)).not.toContain('clipName');
		expect(plan.counts.kept).toBe(1);
	});

	it('fills an empty field no import ever filled', () => {
		const never = { ...before, timecodeEnd: undefined };
		const plan = planFill([{ clip: clip(), take: never }], filledBefore);
		expect(plan.takes[0].fields).toContainEqual({ key: 'timecodeEnd', kind: 'add', to: '14:02:59:09' });
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

describe('planFill, the camera’s values and the lens', () => {
	const cooke32: Lens = { id: 'c32', projectId: 'p', lensMake: 'Cooke', lensModel: 'S4/i 32mm', focalLength: 32 };
	const optimo: Lens = { id: 'opt', projectId: 'p', lensMake: 'Angénieux', lensModel: 'Optimo 24-290', focalLength: 24, focalLengthMax: 290 };
	const twin: Lens = { id: 'c32b', projectId: 'p', lensMake: 'Cooke', lensModel: 'S4/i 32mm', lensSerialNumber: '222' };
	const lenses = [cooke32, optimo];
	const camera = (extra: Partial<Clip> = {}) => clip({ roll: undefined, start: undefined, end: undefined, tStop: 2.8, isoSpeed: 800, whiteBalance: 4300, shutterAngle: 172.8, captureFrameRate: { num: 24, denom: 1 }, ...extra });
	const keys = (plan: ReturnType<typeof planFill>) => plan.takes[0].fields.map((f) => [f.key, f.kind, f.to]);

	it('fills T-stop, ISO, white balance, shutter angle and frame rate where they are empty', () => {
		const plan = planFill([{ clip: camera(), take: take({ isoSpeed: 1280 }) }], new Map(), lenses);
		expect(keys(plan)).toEqual([
			['clipName', 'add', 'A001C003_261117_S8XY'],
			['tStop', 'add', 2.8],
			['isoSpeed', 'kept', 800],
			['whiteBalance', 'add', 4300],
			['shutterAngle', 'add', 172.8],
			['captureFrameRate', 'add', { num: 24, denom: 1 }]
		]);
	});

	it('fills the lens matched in the gear where the take has none, and keeps a lens set', () => {
		expect(keys(planFill([{ clip: camera({ lens: 'Cooke S4/i 32mm' }), take: take() }], new Map(), lenses))).toContainEqual(['lensId', 'add', 'c32']);
		const set = planFill([{ clip: camera({ lens: 'Cooke S4/i 32mm' }), take: take({ lensId: 'opt' }) }], new Map(), lenses);
		expect(keys(set)).toContainEqual(['lensId', 'kept', 'c32']);
		expect(set.takes[0].lens).toEqual({ name: 'Cooke S4/i 32mm', match: { kind: 'one', lens: cooke32 } });
	});

	it('leaves the lens empty when the gear has none of that name, or two, and says which', () => {
		const none = planFill([{ clip: camera({ lens: 'Panavision PRIMO_ZOO' }), take: take() }], new Map(), lenses);
		expect(none.takes[0].fields.map((f) => f.key)).not.toContain('lensId');
		expect(none.takes[0].lens).toEqual({ name: 'Panavision PRIMO_ZOO', match: { kind: 'none' } });
		const many = planFill([{ clip: camera({ lens: 'S4/i 32mm' }), take: take() }], new Map(), [...lenses, twin]);
		expect(many.takes[0].fields.map((f) => f.key)).not.toContain('lensId');
		expect(many.takes[0].lens).toEqual({ name: 'S4/i 32mm', match: { kind: 'many', lenses: [cooke32, twin] } });
	});

	it('fills a zoom’s focal length, never a prime’s or an unknown lens’s', () => {
		expect(keys(planFill([{ clip: camera({ focalLength: 85 }), take: take({ lensId: 'opt' }) }], new Map(), lenses))).toContainEqual(['focalLength', 'add', 85]);
		expect(keys(planFill([{ clip: camera({ focalLength: 85, lens: 'Optimo 24-290' }), take: take() }], new Map(), lenses))).toContainEqual(['focalLength', 'add', 85]);
		expect(keys(planFill([{ clip: camera({ focalLength: 32 }), take: take({ lensId: 'c32' }) }], new Map(), lenses)).map((k) => k[0])).not.toContain('focalLength');
		expect(keys(planFill([{ clip: camera({ focalLength: 32 }), take: take() }], new Map(), lenses)).map((k) => k[0])).not.toContain('focalLength');
	});

	it('keeps what it wrote, rationals and ids included, for the next import', () => {
		const plan = planFill([{ clip: camera({ lens: 'Optimo 24-290', focalLength: 85 }), take: take() }], new Map(), lenses);
		expect(plan.filled.t1).toMatchObject({ lensId: 'opt', focalLength: 85, captureFrameRate: { num: 24, denom: 1 } });
		const again = planFill([{ clip: camera({ lens: 'Optimo 24-290', focalLength: 50 }), take: take({ lensId: 'opt', focalLength: 85 }) }], new Map([['t1', { ...plan.filled.t1 }]]), lenses);
		expect(keys(again)).toContainEqual(['focalLength', 'update', 50]);
	});
});

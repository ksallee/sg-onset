import { describe, expect, it } from 'vitest';
import { flatten, naturalCompare, rowValue } from './selection';
import { input, t42A1A, t42A1B, t42A2A, t42A2B, t42A10A, t9, t10, t50 } from './testData';

const ids = (rows: { take: { id: string } }[]) => rows.map((r) => r.take.id);

describe('naturalCompare', () => {
	it('counts as a person does', () => {
		expect(['10', '9', '42B', '42A', '2'].sort(naturalCompare)).toEqual(['2', '9', '10', '42A', '42B']);
		expect(naturalCompare('pu', 'PU')).toBe(0);
	});
});

describe('flatten', () => {
	it('gives one row per camera take, by day, slate, take number, camera letter', () => {
		expect(ids(flatten(input()))).toEqual([t9.id, t10.id, t42A1A.id, t42A1B.id, t42A2A.id, t42A2B.id, t42A10A.id, t50.id]);
	});

	it('resolves the slate, day, lighting setup, camera setup, camera and lens onto the row', () => {
		const row = flatten(input()).find((r) => r.take.id === t42A1A.id)!;
		expect(row.project.name).toBe('Night Train');
		expect(row.shootDay.shootDay).toBe(3);
		expect(row.slate.slateUID).toBe('42A');
		expect(row.lightingSetup?.label).toBe('Dusk wash');
		expect(row.cameraLetter).toBe('A');
		expect(row.camera?.cameraModel).toBe('ALEXA 35');
		expect(row.lens?.lensModel).toBe('S4/i 32mm');
	});

	it('takes the camera and lens the take holds, not what the setup holds now', () => {
		const data = input();
		data.cameraSetups = data.cameraSetups.map((s) => (s.id === 'csA' ? { ...s, lensId: 'l2' } : s));
		const row = flatten(data).find((r) => r.take.id === t42A1A.id)!;
		expect(row.lens?.id).toBe('l1');
	});

	it('does not fill a camera or lens the take lacks from the setup', () => {
		const data = input();
		data.takes = data.takes.map((t) => (t.id === t10.id ? { ...t, lensId: undefined } : t));
		const row = flatten(data).find((r) => r.take.id === t10.id)!;
		expect(row.lens).toBeUndefined();
		expect(row.cameraLetter).toBe('A');
	});

	it('takes a prime lens focal length over the one on the take', () => {
		const row = flatten(input()).find((r) => r.take.id === t42A1A.id)!;
		expect(row.focalLength).toEqual({ start: 32, end: 32, source: 'lens' });
	});

	it('gives a zoom take its typed start and end', () => {
		const row = flatten(input()).find((r) => r.take.id === t42A1B.id)!;
		expect(row.focalLength).toEqual({ start: 85, end: 150, source: 'take' });
		expect(flatten(input()).find((r) => r.take.id === t42A2B.id)!.focalLength).toBeUndefined();
	});

	it('attaches the photos of a take, oldest first', () => {
		const row = flatten(input()).find((r) => r.take.id === t42A1A.id)!;
		expect(row.stills.map((s) => s.id)).toEqual(['st2', 'st1']);
	});

	it('gives an empty camera letter to a take with no setup', () => {
		const row = flatten(input()).find((r) => r.take.id === t9.id)!;
		expect(row.cameraLetter).toBe('');
		expect(row.cameraSetup).toBeUndefined();
	});

	it('filters by shoot day', () => {
		expect(ids(flatten(input(), { shootDayIds: ['d4'] }))).toEqual([t50.id]);
	});

	it('filters by slate range, inclusive, in natural order', () => {
		expect(ids(flatten(input(), { slateFrom: '10', slateTo: '42A' }))).toEqual([t10.id, t42A1A.id, t42A1B.id, t42A2A.id, t42A2B.id, t42A10A.id]);
		expect(ids(flatten(input(), { slateFrom: '42' }))).toEqual([t42A1A.id, t42A1B.id, t42A2A.id, t42A2B.id, t42A10A.id, t50.id]);
		expect(ids(flatten(input(), { slateTo: '9' }))).toEqual([t9.id]);
	});

	it('keeps circled takes only', () => {
		expect(ids(flatten(input(), { circledOnly: true }))).toEqual([t9.id, t42A1A.id, t50.id]);
	});

	it('drops takes marked no good', () => {
		expect(ids(flatten(input(), { excludeNoGood: true }))).not.toContain(t42A2A.id);
		expect(ids(flatten(input(), { excludeNoGood: true }))).toHaveLength(7);
	});

	it('drops takes whose slate or day is not in the input', () => {
		const data = input();
		data.slates = data.slates.filter((s) => s.id !== 's9');
		expect(ids(flatten(data))).not.toContain(t9.id);
	});

	it('is the same whatever order the input comes in', () => {
		const data = input();
		const reversed = { ...data, takes: [...data.takes].reverse(), slates: [...data.slates].reverse(), shootDays: [...data.shootDays].reverse() };
		expect(ids(flatten(reversed))).toEqual(ids(flatten(data)));
	});
});

describe('rowValue', () => {
	it('reads a field of any scope from the row', () => {
		const row = flatten(input()).find((r) => r.take.id === t42A1A.id)!;
		expect(rowValue(row, 'project', 'name')).toBe('Night Train');
		expect(rowValue(row, 'shootDay', 'location')).toBe('Stage 4');
		expect(rowValue(row, 'slate', 'sceneNumber')).toBe('42');
		expect(rowValue(row, 'lightingSetup', 'hdriFilename')).toBe('LS1_dusk.exr');
		expect(rowValue(row, 'cameraSetup', 'cameraLabel')).toBe('A');
		expect(rowValue(row, 'take', 'tiltEnd')).toBe(-5);
		expect(rowValue(row, 'camera', 'cameraMake')).toBe('ARRI');
		expect(rowValue(row, 'lens', 'lensSerialNumber')).toBe('CK32-001');
	});

	it('gives undefined where the row has no record of that scope', () => {
		const row = flatten(input()).find((r) => r.take.id === t9.id)!;
		expect(rowValue(row, 'lens', 'lensModel')).toBeUndefined();
	});
});

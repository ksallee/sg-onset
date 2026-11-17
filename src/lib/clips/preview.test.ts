import { describe, expect, it } from 'vitest';
import type { ClipImport, Slate, Take } from '$lib/model/types';
import { previewClips, type DayLine } from './preview';
import { silverstackAle } from './testFiles';

const s42a: Slate = { id: 's1', shootDayId: 'd1', slateUID: '42A' };
const take = (id: string, n: string, startedAt: string, extra: Partial<Take> = {}): Take => ({ id, slateId: 's1', take: n, startedAt, endedAt: new Date(Date.parse(startedAt) + 40_000).toISOString(), ...extra });
const lines: DayLine[] = [
	{ take: take('a1', '1', '2026-11-17T14:00:00Z'), slate: s42a, camera: 'A' },
	{ take: take('a2', '2', '2026-11-17T14:05:00Z'), slate: s42a, camera: 'A' },
	{ take: take('a3', '3', '2026-11-17T14:10:00Z', { cameraRoll: 'A009' }), slate: s42a, camera: 'A' }
];
const ale = silverstackAle([
	{ name: 'A001C001', roll: 'A001', camera: 'A', start: '14:00:00:00', end: '14:00:40:00' },
	{ name: 'A001C002', roll: 'A001', camera: 'A', start: '14:05:00:00', end: '14:05:40:00' },
	{ name: 'A001C003', roll: 'A001', camera: 'A', start: '14:10:00:00', end: '14:10:40:00' },
	{ name: 'A001C004', roll: 'A001', camera: 'A', start: '14:20:00:00', end: '14:20:40:00' }
]);
const base = { lines, imports: [] as ClipImport[], picks: [], offsetMinutes: () => 0 };

describe('previewClips', () => {
	it('is empty before a file is read', () => {
		const p = previewClips({ ...base, text: '' });
		expect(p.sheet).toBeNull();
		expect(p.rows).toEqual([]);
		expect(p.plan.patch).toEqual([]);
	});

	it('reads the file, matches each clip and plans what fills, clip by clip', () => {
		const p = previewClips({ ...base, text: ale });
		expect(p.sheet?.format).toBe('ale');
		expect(p.rows.map((r) => [r.clip.name, r.line?.take.id ?? null, r.match.how ?? null])).toEqual([
			['A001C001', 'a1', 'time'],
			['A001C002', 'a2', 'time'],
			['A001C003', 'a3', 'time'],
			['A001C004', null, null]
		]);
		expect(p.counts).toEqual({ time: 3, order: 0, picked: 0, left: 1 });
		expect(p.rows[2].fields.find((f) => f.key === 'cameraRoll')).toEqual({ key: 'cameraRoll', kind: 'kept', from: 'A009', to: 'A001' });
		expect(p.rows[3].fields).toEqual([]);
		// Each take: clip name, roll, timecode in and out, ISO, white balance, shutter and frame rate.
		expect(p.plan.counts).toEqual({ takes: 3, add: 23, update: 0, kept: 1 });
		expect(p.rows[0].lens).toEqual({ name: 'Cooke S4/i 32mm', match: { kind: 'none' } });
	});

	it('finds the lens in the project’s gear', () => {
		const lenses = [{ id: 'c32', projectId: 'p', lensMake: 'Cooke', lensModel: 'S4/i 32mm', focalLength: 32 }];
		const p = previewClips({ ...base, lenses, text: ale });
		expect(p.rows[0].fields).toContainEqual({ key: 'lensId', kind: 'add', to: 'c32' });
		expect(p.rows[3].lens).toBeUndefined();
	});

	it('follows the person’s picks', () => {
		const p = previewClips({ ...base, text: ale, picks: [{ row: 13, takeId: 'a3' }] });
		expect(p.rows.map((r) => r.line?.take.id ?? null)).toEqual(['a1', 'a2', null, 'a3']);
		expect(p.plan.patch.filter((c) => c.id === 'a3').map((c) => [c.key, c.to])).toContainEqual(['clipName', 'A001C004']);
	});

	it('reads the columns the person mapped', () => {
		const text = 'Fichier,Bobine,Début,Fin\nA001C001,A001,14:00:00:00,14:00:40:00';
		expect(previewClips({ ...base, text }).read.issues).toEqual([{ kind: 'noNameColumn' }]);
		const p = previewClips({ ...base, text, map: { clipName: 0, cameraRoll: 1, timecodeStart: 2, timecodeEnd: 3 } });
		expect(p.rows[0].line?.take.id).toBe('a1');
	});

	it('updates on a re-import what the last import filled and nobody edited', () => {
		const filled: ClipImport = { id: 'i1', shootDayId: 'd1', importedAt: '2026-11-17T19:00:00Z', filled: { a1: { clipName: 'A001C000' } } };
		const again = lines.map((l, i) => (i === 0 ? { ...l, take: { ...l.take, clipName: 'A001C000' } } : l));
		const p = previewClips({ ...base, lines: again, imports: [filled], text: ale });
		expect(p.rows[0].fields[0]).toEqual({ key: 'clipName', kind: 'update', from: 'A001C000', to: 'A001C001' });
	});
});

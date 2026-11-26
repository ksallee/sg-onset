import { describe, expect, it } from 'vitest';
import { dayReport } from './dayReport';
import { input, s42A, sharedLighting, t42A1A, t42A1B, t42A2B, t9 } from './testData';

describe('dayReport', () => {
	const report = () => dayReport(input(), 'd3');

	it('heads the page with the project and the day', () => {
		expect(report()!.header).toEqual({ project: 'Night Train', shootDate: '2026-11-10', shootDay: 3, unit: 'Main', location: 'Stage 4', wrangler: 'Ana Ruiz' });
	});

	it('is undefined for a day that is not in the input', () => {
		expect(dayReport(input(), 'nope')).toBeUndefined();
	});

	it('gives one block per slate in natural order, with its takes in order', () => {
		const blocks = report()!.slates;
		expect(blocks.map((b) => b.slate.slateUID)).toEqual(['9', '10', '42A']);
		expect(blocks[2].takes.map((t) => `${t.take.take}${t.cameraLetter}`)).toEqual(['1A', '1B', '2A', '2B', '10A']);
		expect(blocks[2].lightingSetup?.label).toBe('Dusk wash');
	});

	it('lists the camera setups a slate used, with the gear each take ran', () => {
		const block = report()!.slates[2];
		expect(block.setups.map((s) => ({ letter: s.cameraLetter, camera: s.camera?.cameraModel, lenses: s.lenses.map((l) => l.lensModel) }))).toEqual([
			{ letter: 'A', camera: 'ALEXA 35', lenses: ['S4/i 32mm'] },
			{ letter: 'B', camera: 'VENICE 2', lenses: ['Optimo 24-290'] }
		]);
		expect(report()!.slates[0].setups).toEqual([]);
	});

	it('gives each slate block its set references, in the order logged', () => {
		const blocks = report()!.slates;
		expect(blocks[2].references.map((r) => r.name)).toEqual(['Scan 01', 'HDRI_0412']);
		expect(blocks[0].references).toEqual([]);
	});

	it('lists in a slate block the lighting references logged on another slate of its lighting setup (#107)', () => {
		const names = (day: string, slate: string) => dayReport(sharedLighting(), day)!.slates.find((b) => b.slate.slateUID === slate)!.references.map((r) => r.name);
		expect(names('d3', '10')).toEqual(['HDRI_0412']);
		expect(names('d4', '50')).toEqual(['HDRI_0412', 'Flight 1']);
		expect(names('d3', '9')).toEqual([]);
	});

	it('counts slates, takes, circled, no good and photos', () => {
		expect(report()!.totals).toEqual({ slates: 3, takes: 7, circled: 2, noGood: 1, media: { photo: 3 } });
		expect(report()!.slates[2].totals).toEqual({ takes: 5, circled: 1, noGood: 1, media: { photo: 3 } });
		expect(report()!.slates[0].totals.media).toEqual({});
	});

	// Kevin, 2026-11-17 (#89): each kind counted as itself, a video never as a photo.
	it('counts videos and audio notes each as itself', () => {
		const data = { ...input(), videos: ['st1'], audioNotes: [{ id: 'an1', takeId: t42A1A.id, capturedAt: '2026-11-10T22:30:00.000Z' }] };
		const r = dayReport(data, 'd3')!;
		expect(r.totals.media).toEqual({ photo: 2, video: 1, audio: 1 });
		expect(r.slates[2].totals.media).toEqual({ photo: 2, video: 1, audio: 1 });
	});

	it('warns of takes without an end time, a focal length, or a typed focal length on a zoom', () => {
		const w = report()!.warnings;
		expect(w.filter((x) => x.kind === 'noEndTime').map((x) => x.takeId)).toEqual([t9.id, t42A1B.id]);
		expect(w.filter((x) => x.kind === 'noFocalLength').map((x) => x.takeId)).toEqual([t9.id]);
		expect(w.filter((x) => x.kind === 'zoomNoFocalLength').map((x) => x.takeId)).toEqual([t42A2B.id]);
		expect(w.find((x) => x.takeId === t42A2B.id)).toEqual({ kind: 'zoomNoFocalLength', takeId: t42A2B.id, slateId: s42A.id, slate: '42A', take: '2', cameraLetter: 'B' });
		expect(w.some((x) => x.takeId === t42A1A.id)).toBe(false);
	});

	// #137: the lens timeline of the day, from the takes the report shows.
	it('gives the day its lens timeline, per camera', () => {
		const timeline = report()!.timeline;
		expect(timeline.map((c) => [c.cameraLetter, c.runs.map((r) => [r.lens?.lensModel, r.rows.length])])).toEqual([
			['A', [['S4/i 32mm', 4]]],
			['B', [['Optimo 24-290', 2]]]
		]);
	});

	it('builds the lens timeline from the filtered takes', () => {
		const timeline = dayReport(input(), 'd3', { circledOnly: true })!.timeline;
		expect(timeline.map((c) => [c.cameraLetter, c.runs.map((r) => r.rows.map((x) => x.take.id))])).toEqual([['A', [[t42A1A.id]]]]);
	});

	it('applies the filters', () => {
		const r = dayReport(input(), 'd3', { circledOnly: true })!;
		expect(r.totals.takes).toBe(2);
		expect(r.slates.map((b) => b.slate.slateUID)).toEqual(['9', '42A']);
	});
});

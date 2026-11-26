import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Camera, CameraSetup, Lens, Slate, Take } from '$lib/model/types';
import { lensTimeline } from './lensTimeline';
import { flatten, type ExportInput } from './selection';
import { alexa, camA, camB, day3, input, prime32, project, venice, zoom } from './testData';

const day3Rows = () => flatten(input(), { shootDayIds: ['d3'] });

/** A day of takes on A and B, each `[slate, take, setup, lens, startedAt?, extra?]`. */
function shoot(takes: [string, string, string, string | undefined, string?, Partial<Take>?][], more: { lenses?: Lens[]; cameras?: Camera[]; setups?: CameraSetup[] } = {}): ExportInput {
	const slates = new Map<string, Slate>();
	for (const [uid] of takes) if (!slates.has(uid)) slates.set(uid, { id: `s${uid}`, shootDayId: 'd3', slateUID: uid });
	return {
		project,
		shootDays: [day3],
		lightingSetups: [],
		cameraSetups: more.setups ?? [camA, camB],
		cameras: more.cameras ?? [alexa, venice],
		lenses: more.lenses ?? [prime32, zoom],
		slates: [...slates.values()],
		takes: takes.map(([uid, take, setup, lens, startedAt, extra], i) => ({
			id: `t${i}`,
			slateId: `s${uid}`,
			take,
			cameraSetupId: setup,
			cameraId: setup === 'csB' ? 'c2' : 'c1',
			lensId: lens,
			...(startedAt ? { startedAt } : {}),
			...extra
		})),
		stills: [],
		references: []
	};
}

const at = (hhmm: string) => `2026-11-10T${hhmm}:00.000Z`;
const runsOf = (data: ExportInput, letter = 'A') => lensTimeline(flatten(data)).find((c) => c.cameraLetter === letter)?.runs ?? [];
const takesOf = (run: { rows: { slate: Slate; take: Take }[] }) => run.rows.map((r) => `${r.slate.slateUID}/${r.take.take}`);

describe('lensTimeline', () => {
	it('gives each camera its runs, cameras in letter order', () => {
		const timeline = lensTimeline(day3Rows());
		expect(timeline.map((c) => c.cameraLetter)).toEqual(['A', 'B']);
		expect(timeline.map((c) => c.runs.length)).toEqual([1, 1]);
	});

	it('leaves out takes with no camera setup', () => {
		const timeline = lensTimeline(day3Rows());
		expect(timeline.flatMap((c) => c.runs.flatMap((r) => r.rows)).some((r) => r.take.id === 't9')).toBe(false);
	});

	it('describes a prime run: lens, body, takes, clips, timecode, focal length from the lens', () => {
		const [run] = lensTimeline(day3Rows())[0].runs;
		expect(run.lens).toBe(prime32);
		expect(run.camera).toBe(alexa);
		expect(takesOf(run)).toEqual(['42A/1', '42A/2', '42A/10', '10/1']);
		expect(run.clips).toEqual({ first: 'A001C003', last: 'A001C003' });
		expect(run.timecode).toEqual({ start: '14:39:39:09', end: '14:39:59:10' });
		expect(run.focal).toEqual({ min: 32, max: 32 });
	});

	// Kevin, 2026-11-25 (#137): a zoom's run ends when the lens changes, and shows the lowest to
	// highest focal length used.
	it('gives a zoom run the lowest to highest focal length its takes used', () => {
		const data = shoot([
			['1', '1', 'csB', 'l2', at('10:00'), { focalLength: 85, focalLengthEnd: 150 }],
			['1', '2', 'csB', 'l2', at('10:05'), { focalLength: 45 }],
			['2', '1', 'csB', 'l2', at('10:10')]
		]);
		const runs = runsOf(data, 'B');
		expect(runs).toHaveLength(1);
		expect(runs[0].focal).toEqual({ min: 45, max: 150 });
	});

	it('gives no focal length to a zoom run where none was typed', () => {
		const runs = runsOf(shoot([['1', '1', 'csB', 'l2', at('10:00')]]), 'B');
		expect(runs[0].focal).toBeUndefined();
	});

	it('ends a run when the lens changes, and starts a new one when it comes back', () => {
		const data = shoot([
			['1', '1', 'csA', 'l1', at('10:00')],
			['1', '2', 'csA', 'l1', at('10:05')],
			['2', '1', 'csA', 'l2', at('10:10')],
			['3', '1', 'csA', 'l1', at('10:20')]
		]);
		expect(runsOf(data).map((r) => [r.lens?.id, takesOf(r)])).toEqual([
			['l1', ['1/1', '1/2']],
			['l2', ['2/1']],
			['l1', ['3/1']]
		]);
	});

	it('ends a run when the body changes', () => {
		const data = shoot([
			['1', '1', 'csA', 'l1', at('10:00')],
			['1', '2', 'csA', 'l1', at('10:05'), { cameraId: 'c2' }]
		]);
		expect(runsOf(data).map((r) => r.camera?.id)).toEqual(['c1', 'c2']);
	});

	it('gives takes with no lens a run of their own', () => {
		const data = shoot([
			['1', '1', 'csA', 'l1', at('10:00')],
			['1', '2', 'csA', undefined, at('10:05')],
			['1', '3', 'csA', undefined, at('10:06')]
		]);
		expect(runsOf(data).map((r) => [r.lens?.id, r.rows.length])).toEqual([
			['l1', 1],
			[undefined, 2]
		]);
	});

	it('puts takes in the order they started, whatever their slate', () => {
		const data = shoot([
			['9', '1', 'csA', 'l1', at('11:00')],
			['10', '1', 'csA', 'l2', at('10:00')]
		]);
		expect(runsOf(data).map(takesOf)).toEqual([['10/1'], ['9/1']]);
	});

	it('puts takes with no start time last, in slate and take order', () => {
		const data = shoot([
			['9', '2', 'csA', 'l1'],
			['9', '1', 'csA', 'l1'],
			['10', '1', 'csA', 'l1', at('10:00')]
		]);
		expect(runsOf(data).map(takesOf)).toEqual([['10/1', '9/1', '9/2']]);
	});

	it('takes the first and last clip name and timecode a run has, skipping takes without', () => {
		const data = shoot([
			['1', '1', 'csA', 'l1', at('10:00')],
			['1', '2', 'csA', 'l1', at('10:05'), { clipName: 'A001C004', timecodeStart: '10:05:00:00', timecodeEnd: '10:05:30:00' }],
			['1', '3', 'csA', 'l1', at('10:10'), { clipName: 'A002C001', timecodeStart: '10:10:00:00' }],
			['1', '4', 'csA', 'l1', at('10:15')]
		]);
		const [run] = runsOf(data);
		expect(run.clips).toEqual({ first: 'A001C004', last: 'A002C001' });
		expect(run.timecode).toEqual({ start: '10:05:00:00', end: '10:05:30:00' });
	});

	it('gives no clips and no timecode to a run without them', () => {
		const [run] = runsOf(shoot([['1', '1', 'csA', 'l1', at('10:00')]]));
		expect(run.clips).toBeUndefined();
		expect(run.timecode).toBeUndefined();
	});

	it('is empty for no takes', () => {
		expect(lensTimeline([])).toEqual([]);
	});

	it('keeps every take with a camera setup exactly once, and no run is empty', () => {
		const setupIds = ['csA', 'csB'];
		const lensIds = ['l1', 'l2', undefined];
		const takeArb = fc.record({
			slate: fc.constantFrom('1', '2', '10'),
			take: fc.constantFrom('1', '2', '3'),
			setup: fc.constantFrom(...setupIds),
			lens: fc.constantFrom(...lensIds),
			minute: fc.option(fc.integer({ min: 0, max: 59 }), { nil: undefined })
		});
		fc.assert(
			fc.property(fc.array(takeArb, { maxLength: 30 }), (takes) => {
				const data = shoot(takes.map((t) => [t.slate, t.take, t.setup, t.lens, t.minute === undefined ? undefined : at(`10:${String(t.minute).padStart(2, '0')}`)]));
				const timeline = lensTimeline(flatten(data));
				const ids = timeline.flatMap((c) => c.runs.flatMap((r) => r.rows.map((row) => row.take.id)));
				expect(ids.slice().sort()).toEqual(data.takes.map((t) => t.id).sort());
				for (const c of timeline) for (const r of c.runs) expect(r.rows.length).toBeGreaterThan(0);
				// Two runs side by side never share a lens and a body.
				for (const c of timeline)
					for (let i = 1; i < c.runs.length; i++) expect(c.runs[i].lens?.id === c.runs[i - 1].lens?.id && c.runs[i].camera?.id === c.runs[i - 1].camera?.id).toBe(false);
			})
		);
	});
});

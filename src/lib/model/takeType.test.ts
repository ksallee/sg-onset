import { describe, expect, it } from 'vitest';
import { findField } from './catalogue';
import { nextTake } from './take';
import { groupType, KIND_SWITCHES, planReferenceEdit, planTypeEdit, storedTakeType, TAKE_TYPES, takeTypeOf, turnOffPatch, typePatch, type SwitchRef } from './takeType';
import type { LightingSetup, Reference, Slate, Take } from './types';

const take = (id: string, slateId: string, rest: Partial<Take> = {}): Take => ({ id, slateId, take: '1', ...rest });
const slate = (id: string, rest: Partial<Slate> = {}): Slate => ({ id, shootDayId: 'd', slateUID: id, ...rest });
const lighting = (id: string, rest: Partial<LightingSetup> = {}): LightingSetup => ({ id, projectId: 'p', label: id, ...rest });
const retype = (t: Take, to: string | undefined) => ({ id: t.id, key: 'takeType', from: t.takeType, to });

describe('the take type field', () => {
	it('is a take enum with Main first, not carried to the next take', () => {
		const def = findField('take', 'takeType')!.def;
		expect(def).toMatchObject({ type: 'enum', carry: false, labelKey: 'field.take.takeType' });
		expect(def.options).toEqual([...TAKE_TYPES]);
		expect(TAKE_TYPES).toEqual(['main', 'cleanPlate', 'ballsAndChart', 'shadowPlate', 'lightPass', 'atmosphere', 'element', 'other']);
		expect(nextTake(take('a', 's', { takeType: 'cleanPlate' }), 'b').takeType).toBeUndefined();
	});
});

describe('takeTypeOf', () => {
	it('is Main for a take with no type, or one this version does not know', () => {
		expect(takeTypeOf({})).toBe('main');
		expect(takeTypeOf({ takeType: 'main' })).toBe('main');
		expect(takeTypeOf({ takeType: 'witness' })).toBe('main');
		expect(takeTypeOf({ takeType: 'cleanPlate' })).toBe('cleanPlate');
	});
});

describe('storedTakeType', () => {
	it('stores Main as no value', () => {
		expect(storedTakeType('main')).toBeUndefined();
		expect(storedTakeType(undefined)).toBeUndefined();
		expect(storedTakeType('shadowPlate')).toBe('shadowPlate');
	});
});

describe('typePatch and groupType', () => {
	it('types every camera of a take; Main clears it', () => {
		const takes = [take('a', 's'), take('b', 's', { takeType: 'cleanPlate' })];
		expect(typePatch(takes, 'cleanPlate')).toEqual([{ id: 'a', key: 'takeType', from: undefined, to: 'cleanPlate' }]);
		expect(typePatch(takes, 'main')).toEqual([{ id: 'b', key: 'takeType', from: 'cleanPlate', to: undefined }]);
	});
	it('reads the type the cameras agree on, none when they differ', () => {
		expect(groupType([take('a', 's'), take('b', 's', { takeType: 'main' })])).toBe('main');
		expect(groupType([take('a', 's', { takeType: 'element' }), take('b', 's', { takeType: 'element' })])).toBe('element');
		expect(groupType([take('a', 's', { takeType: 'element' }), take('b', 's')])).toBeUndefined();
		expect(groupType([])).toBeUndefined();
	});
});

describe('planTypeEdit', () => {
	it('turns on the slate switch when a take becomes a clean plate', () => {
		const a = take('a', 's1');
		const plan = planTypeEdit({ patch: [retype(a, 'cleanPlate')], takes: [a], slates: [slate('s1')], lightingSetups: [] });
		expect(plan.take).toEqual([retype(a, 'cleanPlate')]);
		expect(plan.slate).toEqual([{ id: 's1', key: 'cleanPlate', from: undefined, to: true }]);
		expect(plan.lightingSetup).toEqual([]);
		expect(plan.on).toEqual<SwitchRef[]>([{ scope: 'slate', id: 's1', key: 'cleanPlate' }]);
		expect(plan.left).toEqual([]);
	});

	it('turns on balls and chart on the lighting setup of the slate, only what is off', () => {
		const a = take('a', 's1');
		const plan = planTypeEdit({
			patch: [retype(a, 'ballsAndChart')],
			takes: [a],
			slates: [slate('s1', { lightingSetupId: 'L' })],
			lightingSetups: [lighting('L', { colourChart: true })]
		});
		expect(plan.slate).toEqual([]);
		expect(plan.lightingSetup).toEqual([{ id: 'L', key: 'referenceBalls', from: undefined, to: true }]);
		expect(plan.on).toEqual<SwitchRef[]>([{ scope: 'lightingSetup', id: 'L', key: 'referenceBalls' }]);
	});

	it('turns nothing on for balls and chart when the slate has no lighting setup', () => {
		const a = take('a', 's1');
		const plan = planTypeEdit({ patch: [retype(a, 'ballsAndChart')], takes: [a], slates: [slate('s1')], lightingSetups: [] });
		expect(plan.lightingSetup).toEqual([]);
		expect(plan.left).toEqual([]);
	});

	it('leaves a switch already on as it is, once for many takes', () => {
		const a = take('a', 's1');
		const b = take('b', 's1');
		const plan = planTypeEdit({ patch: [retype(a, 'cleanPlate'), retype(b, 'cleanPlate')], takes: [a, b], slates: [slate('s1')], lightingSetups: [] });
		expect(plan.slate).toEqual([{ id: 's1', key: 'cleanPlate', from: undefined, to: true }]);
		const on = planTypeEdit({ patch: [retype(a, 'cleanPlate')], takes: [a], slates: [slate('s1', { cleanPlate: true })], lightingSetups: [] });
		expect(on.slate).toEqual([]);
	});

	it('writes Main as no value, and drops what changes nothing', () => {
		const a = take('a', 's1');
		const b = take('b', 's1', { takeType: 'element' });
		const plan = planTypeEdit({ patch: [retype(a, 'main'), retype(b, 'main')], takes: [a, b], slates: [slate('s1')], lightingSetups: [] });
		expect(plan.take).toEqual([{ id: 'b', key: 'takeType', from: 'element', to: undefined }]);
	});

	it('passes other changes of the patch through as they are', () => {
		const a = take('a', 's1');
		const tilt = { id: 'a', key: 'tilt', from: undefined, to: 5 };
		const plan = planTypeEdit({ patch: [tilt], takes: [a], slates: [slate('s1')], lightingSetups: [] });
		expect(plan).toEqual({ take: [tilt], slate: [], lightingSetup: [], on: [], left: [] });
	});

	it('never turns a switch off', () => {
		const a = take('a', 's1', { takeType: 'cleanPlate' });
		const plan = planTypeEdit({ patch: [retype(a, undefined)], takes: [a], slates: [slate('s1', { cleanPlate: true })], lightingSetups: [] });
		expect(plan.slate).toEqual([]);
	});

	it('offers the slate switch when its last clean plate take leaves the type', () => {
		const a = take('a', 's1', { takeType: 'cleanPlate' });
		const b = take('b', 's1');
		const plan = planTypeEdit({ patch: [retype(a, 'shadowPlate')], takes: [a, b], slates: [slate('s1', { cleanPlate: true })], lightingSetups: [] });
		expect(plan.left).toEqual<SwitchRef[]>([{ scope: 'slate', id: 's1', key: 'cleanPlate' }]);
	});

	it('offers nothing while another take of the slate is still a clean plate', () => {
		const a = take('a', 's1', { takeType: 'cleanPlate' });
		const b = take('b', 's1', { takeType: 'cleanPlate' });
		const plan = planTypeEdit({ patch: [retype(a, undefined)], takes: [a, b], slates: [slate('s1', { cleanPlate: true })], lightingSetups: [] });
		expect(plan.left).toEqual([]);
	});

	it('offers nothing for a switch already off', () => {
		const a = take('a', 's1', { takeType: 'cleanPlate' });
		const plan = planTypeEdit({ patch: [retype(a, undefined)], takes: [a], slates: [slate('s1')], lightingSetups: [] });
		expect(plan.left).toEqual([]);
	});

	it('counts balls and chart takes across every slate on the lighting setup', () => {
		const a = take('a', 's1', { takeType: 'ballsAndChart' });
		const b = take('b', 's2', { takeType: 'ballsAndChart' });
		const slates = [slate('s1', { lightingSetupId: 'L' }), slate('s2', { lightingSetupId: 'L' })];
		const lights = [lighting('L', { referenceBalls: true, colourChart: true })];
		expect(planTypeEdit({ patch: [retype(a, undefined)], takes: [a, b], slates, lightingSetups: lights }).left).toEqual([]);
		expect(planTypeEdit({ patch: [retype(a, undefined), retype(b, undefined)], takes: [a, b], slates, lightingSetups: lights }).left).toEqual<SwitchRef[]>([
			{ scope: 'lightingSetup', id: 'L', key: 'referenceBalls' },
			{ scope: 'lightingSetup', id: 'L', key: 'colourChart' }
		]);
	});

	it('offers only the switches still on', () => {
		const a = take('a', 's1', { takeType: 'ballsAndChart' });
		const plan = planTypeEdit({ patch: [retype(a, undefined)], takes: [a], slates: [slate('s1', { lightingSetupId: 'L' })], lightingSetups: [lighting('L', { colourChart: true })] });
		expect(plan.left).toEqual<SwitchRef[]>([{ scope: 'lightingSetup', id: 'L', key: 'colourChart' }]);
	});

	it('turns on the new type and offers the old one in one change', () => {
		const a = take('a', 's1', { takeType: 'cleanPlate' });
		const plan = planTypeEdit({
			patch: [retype(a, 'ballsAndChart')],
			takes: [a],
			slates: [slate('s1', { cleanPlate: true, lightingSetupId: 'L' })],
			lightingSetups: [lighting('L')]
		});
		expect(plan.lightingSetup.map((c) => c.key)).toEqual(['referenceBalls', 'colourChart']);
		expect(plan.left).toEqual<SwitchRef[]>([{ scope: 'slate', id: 's1', key: 'cleanPlate' }]);
	});

	it('gives one list for a change across many slates', () => {
		const a = take('a', 's1', { takeType: 'cleanPlate' });
		const b = take('b', 's2', { takeType: 'cleanPlate' });
		const c = take('c', 's2', { takeType: 'cleanPlate' });
		const plan = planTypeEdit({
			patch: [retype(a, undefined), retype(b, undefined), retype(c, undefined)],
			takes: [a, b, c],
			slates: [slate('s1', { cleanPlate: true }), slate('s2', { cleanPlate: true })],
			lightingSetups: []
		});
		expect(plan.left).toEqual<SwitchRef[]>([
			{ scope: 'slate', id: 's1', key: 'cleanPlate' },
			{ scope: 'slate', id: 's2', key: 'cleanPlate' }
		]);
	});

	it('reads a stored Main as Main', () => {
		const a = take('a', 's1', { takeType: 'main' });
		const plan = planTypeEdit({ patch: [retype(a, undefined)], takes: [a], slates: [slate('s1', { cleanPlate: true })], lightingSetups: [] });
		expect(plan.take).toEqual([{ id: 'a', key: 'takeType', from: 'main', to: undefined }]);
		expect(plan.slate).toEqual([]);
		expect(plan.left).toEqual([]);
	});
});

describe('turnOffPatch', () => {
	it('turns off the switches that are still on', () => {
		const refs: SwitchRef[] = [
			{ scope: 'slate', id: 's1', key: 'cleanPlate' },
			{ scope: 'lightingSetup', id: 'L', key: 'referenceBalls' },
			{ scope: 'lightingSetup', id: 'L', key: 'colourChart' }
		];
		expect(turnOffPatch(refs, [slate('s1', { cleanPlate: true })], [lighting('L', { referenceBalls: true })])).toEqual({
			slate: [{ id: 's1', key: 'cleanPlate', from: true, to: undefined }],
			lightingSetup: [{ id: 'L', key: 'referenceBalls', from: true, to: undefined }]
		});
	});

	it('turns off a switch a reference kind turned on', () => {
		const refs: SwitchRef[] = [
			{ scope: 'lightingSetup', id: 'L', key: 'hdri' },
			{ scope: 'slate', id: 's1', key: 'lidar' }
		];
		expect(turnOffPatch(refs, [slate('s1', { lidar: true })], [lighting('L', { hdri: true })])).toEqual({
			slate: [{ id: 's1', key: 'lidar', from: true, to: undefined }],
			lightingSetup: [{ id: 'L', key: 'hdri', from: true, to: undefined }]
		});
	});
});

// Set references (#93): a reference of kind HDRI 360, Witness camera or Lidar scan follows the
// rule of the take type.
describe('KIND_SWITCHES', () => {
	it('turns on the lighting setup HDRI, the slate Witness camera and the slate Lidar scan', () => {
		expect(KIND_SWITCHES).toEqual({
			hdri360: [{ scope: 'lightingSetup', key: 'hdri' }],
			witnessCamera: [{ scope: 'slate', key: 'witnessCamera' }],
			lidarScan: [{ scope: 'slate', key: 'lidar' }]
		});
	});
});

describe('planReferenceEdit', () => {
	const ref = (id: string, slateId: string, kind: string): Reference => ({ id, slateId, kind, name: id });

	it('turns on the slate switch when a lidar scan or a witness camera clip is logged', () => {
		const plan = planReferenceEdit({ before: [], after: [ref('r1', 's1', 'lidarScan')], takes: [], slates: [slate('s1')], lightingSetups: [] });
		expect(plan.slate).toEqual([{ id: 's1', key: 'lidar', from: undefined, to: true }]);
		expect(plan.on).toEqual<SwitchRef[]>([{ scope: 'slate', id: 's1', key: 'lidar' }]);
		expect(plan.left).toEqual([]);
		const witness = planReferenceEdit({ before: [], after: [ref('r2', 's1', 'witnessCamera')], takes: [], slates: [slate('s1')], lightingSetups: [] });
		expect(witness.slate).toEqual([{ id: 's1', key: 'witnessCamera', from: undefined, to: true }]);
	});

	it('turns on the HDRI of the lighting setup for an HDRI 360, and nothing with no lighting setup', () => {
		const r = ref('r1', 's1', 'hdri360');
		const plan = planReferenceEdit({ before: [], after: [r], takes: [], slates: [slate('s1', { lightingSetupId: 'L' })], lightingSetups: [lighting('L')] });
		expect(plan.lightingSetup).toEqual([{ id: 'L', key: 'hdri', from: undefined, to: true }]);
		expect(plan.on).toEqual<SwitchRef[]>([{ scope: 'lightingSetup', id: 'L', key: 'hdri' }]);
		expect(planReferenceEdit({ before: [], after: [r], takes: [], slates: [slate('s1')], lightingSetups: [] }).on).toEqual([]);
	});

	it('turns nothing on for the other kinds, a project kind, or a switch already on', () => {
		for (const kind of ['video360', 'hdrReference', 'texturedModel', 'photogrammetry', 'splat', 'other', 'Drone survey']) {
			const plan = planReferenceEdit({ before: [], after: [ref('r', 's1', kind)], takes: [], slates: [slate('s1', { lightingSetupId: 'L' })], lightingSetups: [lighting('L')] });
			expect(plan.on, kind).toEqual([]);
		}
		expect(planReferenceEdit({ before: [], after: [ref('r', 's1', 'lidarScan')], takes: [], slates: [slate('s1', { lidar: true })], lightingSetups: [] }).slate).toEqual([]);
	});

	it('never turns a switch off', () => {
		const plan = planReferenceEdit({ before: [ref('r1', 's1', 'lidarScan')], after: [], takes: [], slates: [slate('s1', { lidar: true })], lightingSetups: [] });
		expect(plan.slate).toEqual([]);
	});

	it('offers the switch when the last reference of its kind goes', () => {
		const plan = planReferenceEdit({ before: [ref('r1', 's1', 'lidarScan')], after: [], takes: [], slates: [slate('s1', { lidar: true })], lightingSetups: [] });
		expect(plan.left).toEqual<SwitchRef[]>([{ scope: 'slate', id: 's1', key: 'lidar' }]);
	});

	it('offers nothing while another reference of the kind stays, or for a switch already off', () => {
		const a = ref('a', 's1', 'witnessCamera');
		const b = ref('b', 's1', 'witnessCamera');
		expect(planReferenceEdit({ before: [a, b], after: [b], takes: [], slates: [slate('s1', { witnessCamera: true })], lightingSetups: [] }).left).toEqual([]);
		expect(planReferenceEdit({ before: [a], after: [], takes: [], slates: [slate('s1')], lightingSetups: [] }).left).toEqual([]);
	});

	it('counts HDRI 360 references across every slate on the lighting setup', () => {
		const a = ref('a', 's1', 'hdri360');
		const b = ref('b', 's2', 'hdri360');
		const slates = [slate('s1', { lightingSetupId: 'L' }), slate('s2', { lightingSetupId: 'L' })];
		const lights = [lighting('L', { hdri: true })];
		expect(planReferenceEdit({ before: [a, b], after: [b], takes: [], slates, lightingSetups: lights }).left).toEqual([]);
		expect(planReferenceEdit({ before: [a], after: [], takes: [], slates, lightingSetups: lights }).left).toEqual<SwitchRef[]>([{ scope: 'lightingSetup', id: 'L', key: 'hdri' }]);
	});

	it('turns on the new kind and offers the old one when a kind changes', () => {
		const before = ref('r1', 's1', 'lidarScan');
		const after = { ...before, kind: 'witnessCamera' };
		const plan = planReferenceEdit({ before: [before], after: [after], takes: [], slates: [slate('s1', { lidar: true })], lightingSetups: [] });
		expect(plan.slate).toEqual([{ id: 's1', key: 'witnessCamera', from: undefined, to: true }]);
		expect(plan.left).toEqual<SwitchRef[]>([{ scope: 'slate', id: 's1', key: 'lidar' }]);
	});

	it('does nothing for an edit that keeps the kind', () => {
		const r = ref('r1', 's1', 'lidarScan');
		const plan = planReferenceEdit({ before: [r], after: [{ ...r, device: 'BLK360' }], takes: [], slates: [slate('s1', { lidar: true })], lightingSetups: [] });
		expect(plan).toEqual({ slate: [], lightingSetup: [], on: [], left: [] });
	});

	it('counts what a take holds as well, but only for its own switch', () => {
		// No take type and no kind share a switch today: a clean plate take keeps nothing of a lidar scan.
		const plan = planReferenceEdit({
			before: [ref('r1', 's1', 'lidarScan')],
			after: [],
			takes: [take('t', 's1', { takeType: 'cleanPlate' })],
			slates: [slate('s1', { lidar: true, cleanPlate: true })],
			lightingSetups: []
		});
		expect(plan.left).toEqual<SwitchRef[]>([{ scope: 'slate', id: 's1', key: 'lidar' }]);
	});
});

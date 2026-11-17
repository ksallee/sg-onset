import { describe, expect, it } from 'vitest';
import type { Reference, Slate } from '$lib/model/types';
import { afterWrites, parseLinked, planReferenceSlates, referenceSlatesKey, serializeLinked, type Linked } from './referenceSlates';

const slate = (id: string, lightingSetupId?: string): Slate => ({ id, shootDayId: 'd1', slateUID: id, ...(lightingSetupId ? { lightingSetupId } : {}) });
const ref = (id: string, slateId: string, kind: string): Reference => ({ id, slateId, kind, name: id, loggedAt: '2026-11-17T10:00:00Z' });

// 12A and 12B on the stage's lighting, 14 on the street. Flow PT ids: slates 1, 2, 3; references 10, 11.
const slates = [slate('12A', 'stage'), slate('12B', 'stage'), slate('14', 'street')];
const hdri = ref('hdri', '12A', 'hdri360');
const scan = ref('scan', '12B', 'lidarScan');
const remote = { '12A': 1, '12B': 2, '14': 3, hdri: 10, scan: 11 };

describe('planReferenceSlates', () => {
	it('links a lighting reference to every slate of its lighting setup, any other to its slate', () => {
		const plan = planReferenceSlates([hdri, scan], slates, remote, {});
		expect(plan.work).toEqual([
			{ reference: 'hdri', remoteId: 10, add: [1, 2], remove: [] },
			{ reference: 'scan', remoteId: 11, add: [2], remove: [] }
		]);
		expect(plan.linked).toEqual({ hdri: { remote: 10, slates: [1, 2] }, scan: { remote: 11, slates: [2] } });
	});

	it('writes nothing when Flow PT holds what each reference shows on', () => {
		const linked: Linked = { hdri: { remote: 10, slates: [1, 2] }, scan: { remote: 11, slates: [2] } };
		expect(planReferenceSlates([hdri, scan], slates, remote, linked)).toEqual({ work: [], linked });
	});

	it('adds a new slate of the lighting setup, now or later', () => {
		const later = [...slates, slate('12C', 'stage')];
		const plan = planReferenceSlates([hdri], later, { ...remote, '12C': 4 }, { hdri: { remote: 10, slates: [1, 2] } });
		expect(plan.work).toEqual([{ reference: 'hdri', remoteId: 10, add: [4], remove: [] }]);
	});

	it('moves it with its slate to another lighting setup, taking off only the slates it linked', () => {
		const moved = [slate('12A', 'street'), slate('12B', 'stage'), slate('14', 'street')];
		const plan = planReferenceSlates([hdri], moved, remote, { hdri: { remote: 10, slates: [1, 2] } });
		expect(plan.work).toEqual([{ reference: 'hdri', remoteId: 10, add: [3], remove: [2] }]);
		expect(plan.linked.hdri).toEqual({ remote: 10, slates: [1, 3] });
	});

	it('follows a change of kind', () => {
		const plan = planReferenceSlates([{ ...hdri, kind: 'lidarScan' }], slates, remote, { hdri: { remote: 10, slates: [1, 2] } });
		expect(plan.work).toEqual([{ reference: 'hdri', remoteId: 10, add: [], remove: [2] }]);
	});

	it('waits for a slate Flow PT does not hold yet, and links it once it does', () => {
		const plan = planReferenceSlates([hdri], slates, { ...remote, '12B': undefined }, {});
		expect(plan.work).toEqual([{ reference: 'hdri', remoteId: 10, add: [1], remove: [] }]);
		expect(planReferenceSlates([hdri], slates, remote, plan.linked).work).toEqual([{ reference: 'hdri', remoteId: 10, add: [2], remove: [] }]);
	});

	it('leaves a reference Flow PT does not hold, and drops one gone from the device', () => {
		const plan = planReferenceSlates([hdri], slates, { ...remote, hdri: undefined }, { scan: { remote: 11, slates: [2] } });
		expect(plan).toEqual({ work: [], linked: {} });
	});

	it('takes nothing off for a slate deleted: Flow PT drops it from the field itself', () => {
		const plan = planReferenceSlates([hdri], [slate('12A', 'stage')], { hdri: 10, '12A': 1 }, { hdri: { remote: 10, slates: [1, 2] } });
		expect(plan).toEqual({ work: [], linked: { hdri: { remote: 10, slates: [1] } } });
	});

	it('starts again on a reference made again under a new Flow PT id, as an undone delete is', () => {
		const plan = planReferenceSlates([hdri], slates, { ...remote, hdri: 12 }, { hdri: { remote: 10, slates: [1, 2] } });
		expect(plan.work).toEqual([{ reference: 'hdri', remoteId: 12, add: [1, 2], remove: [] }]);
	});
});

describe('afterWrites', () => {
	it('keeps what was there for a reference whose write failed, and the plan for the rest', () => {
		const before: Linked = { hdri: { remote: 10, slates: [1] } };
		const plan = planReferenceSlates([hdri, scan], slates, remote, before);
		expect(afterWrites(plan, before, ['hdri', 'scan'])).toEqual(before);
		expect(afterWrites(plan, before, ['scan'])).toEqual({ hdri: { remote: 10, slates: [1, 2] } });
		expect(afterWrites(plan, before, [])).toEqual(plan.linked);
	});
});

describe('the kept list', () => {
	it('is kept per project, and reads back', () => {
		expect(referenceSlatesKey('p1')).toBe('referenceSlates:p1');
		const linked: Linked = { hdri: { remote: 10, slates: [1, 2] } };
		expect(parseLinked(serializeLinked(linked))).toEqual(linked);
	});

	it('reads anything it cannot as nothing linked: the next sync adds again, and adding twice changes nothing', () => {
		for (const raw of [undefined, '', 'nope', '{"v":2,"refs":{}}', '{"v":1,"refs":{"hdri":{"remote":"x","slates":[1]}}}']) expect(parseLinked(raw)).toEqual({});
		expect(parseLinked('{"v":1,"refs":{"hdri":{"remote":10,"slates":[1,"2",3]}}}')).toEqual({ hdri: { remote: 10, slates: [1, 3] } });
	});
});

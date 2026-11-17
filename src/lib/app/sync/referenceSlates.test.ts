import { describe, expect, it } from 'vitest';
import type { Reference, Slate } from '$lib/model/types';
import { legacyReferenceSlatesKey, referenceSlateItems } from './referenceSlates';

const slate = (id: string, lightingSetupId?: string): Slate => ({ id, shootDayId: 'd1', slateUID: id, ...(lightingSetupId ? { lightingSetupId } : {}) });
const ref = (id: string, slateId: string, kind: string): Reference => ({ id, slateId, kind, name: id, loggedAt: '2026-11-17T10:00:00Z' });

// 12A and 12B on the stage's lighting, 14 on the street. Flow PT ids: slates 1, 2, 3; references 10, 11.
const slates = [slate('12A', 'stage'), slate('12B', 'stage'), slate('14', 'street')];
const hdri = ref('hdri', '12A', 'hdri360');
const scan = ref('scan', '12B', 'lidarScan');
const remote = { '12A': 1, '12B': 2, '14': 3, hdri: 10, scan: 11 };

describe('referenceSlateItems', () => {
	it('gives each reference Flow PT holds the slates it shows on: every slate of the lighting setup for a lighting reference, its slate for the rest', () => {
		expect(referenceSlateItems([hdri, scan], slates, remote)).toEqual([
			{ reference: 'hdri', remoteId: 10, slates: [1, 2] },
			{ reference: 'scan', remoteId: 11, slates: [2] }
		]);
	});

	it('follows the lighting setups and kinds as they are now', () => {
		const later = [slate('12A', 'street'), slate('12B', 'stage'), slate('14', 'street'), slate('12C', 'street')];
		expect(referenceSlateItems([hdri], later, { ...remote, '12C': 4 })).toEqual([{ reference: 'hdri', remoteId: 10, slates: [1, 3, 4] }]);
		expect(referenceSlateItems([{ ...hdri, kind: 'lidarScan' }], slates, remote)).toEqual([{ reference: 'hdri', remoteId: 10, slates: [1] }]);
	});

	it('leaves out a slate Flow PT does not hold yet, and a reference it does not hold', () => {
		expect(referenceSlateItems([hdri, scan], slates, { ...remote, '12B': undefined, scan: undefined })).toEqual([{ reference: 'hdri', remoteId: 10, slates: [1] }]);
	});
});

describe('legacyReferenceSlatesKey', () => {
	it('is the key an earlier build of this change kept its list under, removed now: nothing is kept', () => {
		expect(legacyReferenceSlatesKey('p1')).toBe('referenceSlates:p1');
	});
});

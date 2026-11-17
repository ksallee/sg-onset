import { describe, expect, it } from 'vitest';
import type { Reference } from '$lib/model/types';
import { countByKind, lastOfKind, newReference, nextReferenceName, referenceDetail, referenceLine, sortReferences } from './log';

const ref = (id: string, kind: string, name: string, loggedAt: string, more: Partial<Reference> = {}): Reference => ({ id, slateId: 's1', kind, name, loggedAt, ...more });
const label = (kind: string) => ({ hdri360: 'HDRI 360', lidarScan: 'Lidar scan', other: 'Other' })[kind] ?? kind;

describe('sortReferences', () => {
	it('lists references in the order they were logged, then by id', () => {
		const a = ref('a', 'hdri360', 'HDRI_0002', '2026-11-17T10:00:00Z');
		const b = ref('b', 'lidarScan', 'Scan 01', '2026-11-17T09:00:00Z');
		const c = ref('c', 'other', 'Notes', '2026-11-17T10:00:00Z');
		const d = ref('d', 'other', 'Undated', '');
		expect(sortReferences([c, a, b, d]).map((r) => r.id)).toEqual(['d', 'b', 'a', 'c']);
	});
});

describe('nextReferenceName', () => {
	it('steps the last run of digits, zeros kept', () => {
		expect(nextReferenceName('HDRI_0412')).toBe('HDRI_0413');
		expect(nextReferenceName('Scan 9')).toBe('Scan 10');
		expect(nextReferenceName('A003C012')).toBe('A003C013');
		expect(nextReferenceName('099')).toBe('100');
	});

	it('keeps an extension after the number', () => {
		expect(nextReferenceName('IMG_1234.DNG')).toBe('IMG_1235.DNG');
		expect(nextReferenceName('pano_07.exr')).toBe('pano_08.exr');
	});

	it('suggests nothing when there is no number to step, or nothing before', () => {
		expect(nextReferenceName('Bridge pano')).toBe('');
		expect(nextReferenceName('')).toBe('');
		expect(nextReferenceName(undefined)).toBe('');
	});
});

describe('lastOfKind', () => {
	it('is the reference of that kind logged last', () => {
		const refs = [
			ref('a', 'hdri360', 'HDRI_0002', '2026-11-17T10:00:00Z'),
			ref('b', 'hdri360', 'HDRI_0003', '2026-11-17T11:00:00Z'),
			ref('c', 'lidarScan', 'Scan 01', '2026-11-17T12:00:00Z')
		];
		expect(lastOfKind(refs, 'hdri360')?.id).toBe('b');
		expect(lastOfKind(refs, 'splat')).toBeUndefined();
	});
});

describe('newReference', () => {
	it('is the kind and the name, logged now, under the slate', () => {
		expect(newReference('r1', 's2', 'splat', ' Courtyard ', '2026-11-17T10:00:00Z')).toEqual({ id: 'r1', slateId: 's2', kind: 'splat', name: 'Courtyard', loggedAt: '2026-11-17T10:00:00Z' });
	});

	it('carries the device and the card or roll from the last of that kind, not the count or notes', () => {
		const last = ref('a', 'hdri360', 'HDRI_0002', '2026-11-17T09:00:00Z', { device: 'Ricoh Theta Z1', cardOrRoll: 'Card 2', count: 7, notes: 'Under the bridge' });
		expect(newReference('r1', 's2', 'hdri360', 'HDRI_0003', '2026-11-17T10:00:00Z', last)).toEqual({
			id: 'r1',
			slateId: 's2',
			kind: 'hdri360',
			name: 'HDRI_0003',
			device: 'Ricoh Theta Z1',
			cardOrRoll: 'Card 2',
			loggedAt: '2026-11-17T10:00:00Z'
		});
	});
});

describe('referenceDetail', () => {
	it('is what a row shows under the name: kind, device, card or roll, count', () => {
		expect(referenceDetail(ref('a', 'hdri360', 'HDRI_0002', '', { device: 'Theta Z1', cardOrRoll: 'A003', count: 3 }), label)).toBe('HDRI 360 · Theta Z1 · A003 · ×3');
		expect(referenceDetail(ref('a', 'Drone survey', 'Flight 1', ''), label)).toBe('Drone survey');
	});
});

describe('referenceLine', () => {
	it('is one reference in one line, for a file: kind, name, then what else is known', () => {
		expect(referenceLine(ref('a', 'hdri360', 'HDRI_0002', '', { device: 'Theta Z1', cardOrRoll: 'A003', count: 3, notes: 'Noon sun' }), label)).toBe('HDRI 360: HDRI_0002 (Theta Z1, A003, ×3, Noon sun)');
		expect(referenceLine(ref('a', 'lidarScan', 'Scan 01', ''), label)).toBe('Lidar scan: Scan 01');
	});

	it('keeps a line on one line', () => {
		expect(referenceLine(ref('a', 'other', 'Set\nwalk', '', { notes: 'two\r\nlines' }), label)).toBe('Other: Set walk (two lines)');
	});
});

describe('countByKind', () => {
	it('counts the references of each kind, in the order of the choices, project kinds included', () => {
		const refs = [
			ref('a', 'lidarScan', 'Scan 01', ''),
			ref('b', 'hdri360', 'HDRI_0002', ''),
			ref('c', 'hdri360', 'HDRI_0003', ''),
			ref('d', 'Drone survey', 'Flight 1', '')
		];
		expect(countByKind(refs, ['Drone survey'])).toEqual([
			{ kind: 'hdri360', n: 2 },
			{ kind: 'lidarScan', n: 1 },
			{ kind: 'Drone survey', n: 1 }
		]);
	});

	it('counts a kind the project no longer lists after the others, and no kind as Other', () => {
		const refs = [ref('a', 'Old kind', 'X', ''), ref('b', '', 'Y', ''), ref('c', 'hdri360', 'Z', '')];
		expect(countByKind(refs, [])).toEqual([
			{ kind: 'hdri360', n: 1 },
			{ kind: 'other', n: 1 },
			{ kind: 'Old kind', n: 1 }
		]);
	});
});

import { describe, expect, it } from 'vitest';
import type { Reference, Slate } from '$lib/model/types';
import { isLightingKind, LIGHTING_KINDS, shownBySlate, slatesOf } from './lighting';

const slate = (id: string, lightingSetupId?: string): Slate => ({ id, shootDayId: 'd1', slateUID: id, ...(lightingSetupId ? { lightingSetupId } : {}) });
const ref = (id: string, slateId: string, kind: string, loggedAt: string): Reference => ({ id, slateId, kind, name: id, loggedAt });

// 12A and 12B share the stage's lighting, 14 is on the street, 15 has none.
const s12A = slate('12A', 'stage');
const s12B = slate('12B', 'stage');
const s14 = slate('14', 'street');
const s15 = slate('15');
const slates = [s12A, s12B, s14, s15];

describe('LIGHTING_KINDS', () => {
	it('are HDRI 360, 360 video and HDR reference', () => {
		expect(LIGHTING_KINDS).toEqual(['hdri360', 'video360', 'hdrReference']);
	});

	it('leaves the other kinds and a project kind per slate', () => {
		for (const kind of LIGHTING_KINDS) expect(isLightingKind(kind)).toBe(true);
		for (const kind of ['witnessCamera', 'lidarScan', 'texturedModel', 'photogrammetry', 'splat', 'other', 'Drone survey', '', undefined]) expect(isLightingKind(kind)).toBe(false);
	});
});

describe('slatesOf', () => {
	it('puts a lighting reference on every slate of its slate lighting setup, in slate order', () => {
		expect(slatesOf(ref('h', '12B', 'hdri360', 't1'), slates)).toEqual(['12A', '12B']);
		expect(slatesOf(ref('v', '12A', 'video360', 't1'), slates)).toEqual(['12A', '12B']);
		expect(slatesOf(ref('r', '14', 'hdrReference', 't1'), slates)).toEqual(['14']);
	});

	it('keeps any other kind on its own slate', () => {
		expect(slatesOf(ref('l', '12A', 'lidarScan', 't1'), slates)).toEqual(['12A']);
		expect(slatesOf(ref('d', '12A', 'Drone survey', 't1'), slates)).toEqual(['12A']);
	});

	it('keeps a lighting reference on its own slate when that slate has no lighting setup or is not given', () => {
		expect(slatesOf(ref('h', '15', 'hdri360', 't1'), slates)).toEqual(['15']);
		expect(slatesOf(ref('h', 'gone', 'hdri360', 't1'), slates)).toEqual(['gone']);
	});

	it('follows its slate to another lighting setup', () => {
		const moved = [{ ...s12A, lightingSetupId: 'street' }, s12B, s14, s15];
		expect(slatesOf(ref('h', '12A', 'hdri360', 't1'), moved)).toEqual(['12A', '14']);
	});
});

describe('shownBySlate', () => {
	const hdri = ref('hdri', '12A', 'hdri360', '2026-11-17T10:00:00Z');
	const scan = ref('scan', '12B', 'lidarScan', '2026-11-17T09:00:00Z');
	const video = ref('video', '12B', 'video360', '2026-11-17T11:00:00Z');
	const street = ref('street', '14', 'hdri360', '2026-11-17T08:00:00Z');
	const shown = shownBySlate(slates, [video, street, hdri, scan]);
	const ids = (slateId: string) => (shown.get(slateId) ?? []).map((r) => r.id);

	it('gives each slate its own references and the lighting references of its lighting setup, in the order logged', () => {
		expect(ids('12A')).toEqual(['hdri', 'video']);
		expect(ids('12B')).toEqual(['scan', 'hdri', 'video']);
		expect(ids('14')).toEqual(['street']);
	});

	it('leaves out a slate that shows none', () => {
		expect(shown.has('15')).toBe(false);
	});

	it('shows each reference once on a slate', () => {
		expect(new Set(ids('12B')).size).toBe(ids('12B').length);
	});
});

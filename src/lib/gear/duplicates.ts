// When two records are the same piece of gear. Pure.
//
// Decision: the same model and the same serial number, compared without case or extra spaces.
// Two records with no serial number match on the model alone: a list imported twice must not
// double. One with a serial number and one without do not match: it may be a second unit.

import type { Camera, Lens } from '$lib/model/types';
import { normalise } from './list';
import type { GearScope } from './names';

function key(scope: GearScope, record: Camera | Lens): { model: string; serial: string } {
	const r = record as Record<string, unknown>;
	const text = (k: string) => (typeof r[k] === 'string' ? normalise(r[k] as string) : '');
	return scope === 'camera'
		? { model: text('cameraModel'), serial: text('cameraSerialNumber') }
		: { model: text('lensModel'), serial: text('lensSerialNumber') };
}

export function isSameGear(scope: GearScope, a: Camera | Lens, b: Camera | Lens): boolean {
	const ka = key(scope, a);
	const kb = key(scope, b);
	return ka.model !== '' && ka.model === kb.model && ka.serial === kb.serial;
}

/** The first of `existing` that is the same gear as `record`. */
export function findDuplicate<T extends Camera | Lens>(scope: GearScope, existing: readonly T[], record: Camera | Lens): T | undefined {
	return existing.find((e) => isSameGear(scope, e, record));
}

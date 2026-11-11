// The gear lists: search and order. Pure.

import type { Camera, CameraSetup, Lens } from '$lib/model/types';
import { cameraTitle, focalRange, lensKind, lensTitle } from './names';

/** Lower case, no accents, single spaces: what search compares. */
export function normalise(text: string): string {
	return text
		.normalize('NFD')
		.replace(/\p{M}/gu, '')
		.toLowerCase()
		.replace(/\s+/g, ' ')
		.trim();
}

/** Every word of `query` is in one of `fields`. An empty query matches. */
export function matchesQuery(fields: readonly (string | undefined)[], query: string): boolean {
	const words = normalise(query).split(' ').filter(Boolean);
	if (words.length === 0) return true;
	const hay = normalise(fields.filter(Boolean).join(' '));
	return words.every((w) => hay.includes(w));
}

export function searchCameras(cameras: readonly Camera[], query: string): Camera[] {
	return cameras.filter((c) => matchesQuery([c.cameraMake, c.cameraModel, c.cameraSerialNumber], query));
}

/** The words a lens is found by, beyond its text fields: its focal lengths, with and without mm. */
function focalWords(lens: Lens): string[] {
	const range = focalRange(lens);
	if (!range) return [];
	return [range.min, range.max].filter((n) => n !== undefined).flatMap((n) => [String(n), `${n}mm`]);
}

/** `kinds`: the words for prime and zoom in the app's language, so a search for "zoom" finds zooms. */
export function searchLenses(lenses: readonly Lens[], query: string, kinds?: { prime: string; zoom: string }): Lens[] {
	return lenses.filter((l) => {
		const kind = lensKind(l);
		const kindWord = kinds && kind !== 'unknown' ? kinds[kind] : undefined;
		return matchesQuery([l.lensMake, l.lensModel, l.lensSerialNumber, kindWord, ...focalWords(l)], query);
	});
}

export function searchSetups(setups: readonly CameraSetup[], cameras: readonly Camera[], lenses: readonly Lens[], query: string): CameraSetup[] {
	return setups.filter((s) => {
		const body = cameras.find((c) => c.id === s.cameraId);
		const lens = lenses.find((l) => l.id === s.lensId);
		return matchesQuery([s.cameraLabel, body && cameraTitle(body), lens && lensTitle(lens), ...(lens ? focalWords(lens) : [])], query);
	});
}

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
const compare = (a: string | undefined, b: string | undefined) => collator.compare(a ?? '', b ?? '');

/** By name, numbers in counting order, then by serial number. */
export function sortCameras(cameras: readonly Camera[]): Camera[] {
	return [...cameras].sort((a, b) => compare(cameraTitle(a), cameraTitle(b)) || compare(a.cameraSerialNumber, b.cameraSerialNumber));
}

const KIND_ORDER = { prime: 0, zoom: 1, unknown: 2 } as const;

/** Primes by focal length, then zooms by their short end, then lenses with no focal length; then by name and serial number. */
export function sortLenses(lenses: readonly Lens[]): Lens[] {
	return [...lenses].sort(
		(a, b) =>
			KIND_ORDER[lensKind(a)] - KIND_ORDER[lensKind(b)] ||
			(a.focalLength ?? 0) - (b.focalLength ?? 0) ||
			compare(lensTitle(a), lensTitle(b)) ||
			compare(a.lensSerialNumber, b.lensSerialNumber)
	);
}

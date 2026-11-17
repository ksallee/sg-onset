// The lens a clip names, found in the project's gear (Kevin, #109): by its model or its name (make
// and model), trimmed and compared without case, accents, spaces or punctuation. One lens: the
// match. None, or two or more: no match, and the preview says which. A lens is never created.
// Pure.

import { lensTitle } from '$lib/gear/names';
import type { Lens } from '$lib/model/types';

export type LensMatch = { kind: 'one'; lens: Lens } | { kind: 'none' } | { kind: 'many'; lenses: Lens[] };

/** A lens name as compared: lower case letters and digits, accents off. */
export function lensKey(text: string): string {
	return text
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]/g, '');
}

/** The keys a lens answers to: its model, its name, its make and model. */
function keysOf(lens: Lens): Set<string> {
	const names = [lens.lensModel ?? '', lensTitle(lens), `${lens.lensMake ?? ''} ${lens.lensModel ?? ''}`];
	return new Set(names.map(lensKey).filter((k) => k !== ''));
}

export function matchLens(name: string, lenses: readonly Lens[]): LensMatch {
	const key = lensKey(name);
	if (key === '') return { kind: 'none' };
	const found = lenses.filter((l) => keysOf(l).has(key));
	if (found.length === 1) return { kind: 'one', lens: found[0] };
	return found.length ? { kind: 'many', lenses: found } : { kind: 'none' };
}

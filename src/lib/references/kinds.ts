// The kinds of set reference: the built-in ones, and the kinds a project adds in Settings. A
// reference keeps its kind as text: a built-in key (`hdri360`), or a project kind as typed. Pure:
// labels come in from the message catalogue.

/** The built-in kinds, as the VFX supervisor listed them (Kevin, 2026-11-17). Other is last. */
export const KINDS = ['hdri360', 'video360', 'hdrReference', 'witnessCamera', 'lidarScan', 'texturedModel', 'photogrammetry', 'splat', 'other'] as const;
export type BuiltInKind = (typeof KINDS)[number];

export function isBuiltInKind(kind: string): kind is BuiltInKind {
	return (KINDS as readonly string[]).includes(kind);
}

const loose = (text: string) => text.trim().toLowerCase();

/**
 * The kinds to pick from: the built-in ones, with the project's own after them and before Other.
 * A project kind is listed once, and never one that spells a built-in key.
 */
export function kindChoices(projectKinds: readonly string[]): string[] {
	const own: string[] = [];
	const seen = new Set<string>(KINDS.map(loose));
	for (const kind of projectKinds) {
		const name = kind.trim();
		if (name === '' || seen.has(loose(name))) continue;
		seen.add(loose(name));
		own.push(name);
	}
	return [...KINDS.slice(0, -1), ...own, 'other'];
}

/** The message key of a built-in kind's label. A project kind has none: it shows as typed. */
export function kindLabelKey(kind: string): `references.kind.${BuiltInKind}` | undefined {
	return isBuiltInKind(kind) ? `references.kind.${kind}` : undefined;
}

/** A kind as shown. No kind shows as Other. `label` reads a message key. */
export function kindLabel(kind: string | undefined, label: (key: string) => string): string {
	const k = (kind ?? '').trim();
	if (k === '') return label('references.kind.other');
	const key = kindLabelKey(k);
	return key ? label(key) : k;
}

/**
 * Why `name` cannot be a new project kind: empty, or a kind already there (a built-in one by key
 * or label, or one of the project's), case and outer spaces ignored. Nothing when it can.
 * `builtInLabel` gives a built-in kind's label.
 */
export function kindProblem(name: string, projectKinds: readonly string[], builtInLabel: (kind: string) => string): 'empty' | 'taken' | undefined {
	const n = loose(name);
	if (n === '') return 'empty';
	const taken = [...KINDS, ...KINDS.map(builtInLabel), ...projectKinds].map(loose);
	return taken.includes(n) ? 'taken' : undefined;
}

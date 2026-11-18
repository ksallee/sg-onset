// The names an admin picks (#111): the display name each custom entity is looked for under, and for
// each field the app wants, the field it is. Set Up Fields plans with it instead of fixed names
// (schema.ts), and the resolution it makes keeps it, so the sync, the setup check, the Notes on
// Shots and the action of #106 all read the names chosen. The default is the names the app always
// used: a site set up before needs nothing. Pure.
//
// A field is named by where it is and its default name, `take.sg_focal_length`: stable whatever
// it is called on a site, and what the resolution keys its names by.

import { ENTITY_TYPES, wantedFields, type Column, type EntityScope, type FieldPlace } from './mapping';
import { codeName } from './names';

/** The scopes whose entity is a project custom entity, found by display name (findings/008). */
export const CUSTOM_SCOPES = ['take', 'lens', 'cameraSetup', 'lightingSetup', 'reference', 'setShot'] as const satisfies readonly EntityScope[];
export type CustomScope = (typeof CUSTOM_SCOPES)[number];

export function isCustomScope(name: string): name is CustomScope {
	return (CUSTOM_SCOPES as readonly string[]).includes(name);
}

/**
 * What a field the app wants is on a site:
 * - `display`: the field this display name makes (`codeName`), found or created. Where the name is
 *   held by a field of another type, `Onset <display>`, as always (README, decision 3).
 * - `field`: a field the site has, by its name. Used as it is, never created.
 */
export type FieldChoice = { display: string } | { field: string };

export type Naming = {
	/** The display name to look for, by custom scope. Left out: the app's own, "Take". */
	entities?: Partial<Record<CustomScope, string>>;
	/** The choice for a field, by `fieldKey`. Left out: the app's own display name. */
	fields?: Record<string, FieldChoice>;
};

/** The names the app always used. */
export const DEFAULT_NAMING: Naming = {};

/** A field's key in a naming: where it is and its default name. */
export function fieldKey(place: string, column: Pick<Column, 'name'>): string {
	return `${place}.${column.name}`;
}

/** The name an entity is given and shown under: the one chosen, or the app's own. */
export function entityName(naming: Naming | undefined, scope: EntityScope): string {
	return (isCustomScope(scope) ? naming?.entities?.[scope] : undefined) ?? ENTITY_TYPES[scope].displayName;
}

/** The display names a custom entity is found under: the one chosen alone, or the app's own and its other spellings. */
export function entityNames(naming: Naming | undefined, scope: CustomScope): readonly string[] {
	const chosen = naming?.entities?.[scope];
	if (chosen !== undefined) return [chosen];
	const want = ENTITY_TYPES[scope];
	return want.kind === 'custom' ? [want.displayName, ...(want.aliases ?? [])] : [want.displayName];
}

/** What a field the app wants is on the site, as chosen. */
export function fieldChoice(naming: Naming | undefined, place: string, column: Column): FieldChoice {
	return naming?.fields?.[fieldKey(place, column)] ?? { display: column.display };
}

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const loose = (text: string) => text.trim().toLowerCase();
/** ASCII only: a display name outside it loses its whole name to `sg_<data_type>` (corpus findings/117). */
const DISPLAY = /^[\x20-\x7e]+$/;
const FIELD = /^[a-z][a-z0-9_]*$/;
const KEY = /^[a-zA-Z]+\.[a-z][a-z0-9_]*$/;

function choiceOf(value: unknown): FieldChoice | undefined {
	if (!isObject(value)) return undefined;
	const keys = Object.keys(value);
	if (keys.length !== 1) return undefined;
	const { display, field } = value;
	if (typeof display === 'string' && display !== '' && display === display.trim() && DISPLAY.test(display)) return { display };
	if (typeof field === 'string' && FIELD.test(field)) return { field };
	return undefined;
}

/** The name a choice asks for on its entity. */
const askedName = (choice: FieldChoice) => ('field' in choice ? choice.field : codeName(choice.display));

/**
 * A naming, checked whole, or undefined. Refused: a shape it is not, a display name with outer
 * spaces or outside ASCII, two custom entities found under one name, two fields of one entity
 * asking for one name. A field key the app does not know is kept: it names nothing here.
 */
export function parseNaming(value: unknown): Naming | undefined {
	if (!isObject(value)) return undefined;
	const out: Naming = {};
	if (value.entities !== undefined) {
		if (!isObject(value.entities)) return undefined;
		const entities: Partial<Record<CustomScope, string>> = {};
		for (const [scope, name] of Object.entries(value.entities)) {
			if (!isCustomScope(scope) || typeof name !== 'string' || name === '' || name !== name.trim()) return undefined;
			entities[scope] = name;
		}
		out.entities = entities;
	}
	if (value.fields !== undefined) {
		if (!isObject(value.fields)) return undefined;
		const fields: Record<string, FieldChoice> = {};
		for (const [key, raw] of Object.entries(value.fields)) {
			const choice = choiceOf(raw);
			if (!KEY.test(key) || !choice) return undefined;
			fields[key] = choice;
		}
		out.fields = fields;
	}
	// Each custom entity under names no other one takes.
	const taken = new Set<string>();
	for (const scope of CUSTOM_SCOPES) {
		for (const name of entityNames(out, scope).map(loose)) {
			if (taken.has(name)) return undefined;
			taken.add(name);
		}
	}
	// Each field of an entity under a name no other field of it asks for.
	const asked = new Map<FieldPlace, Set<string>>();
	for (const { place, column } of wantedFields()) {
		const name = askedName(fieldChoice(out, place, column));
		const names = asked.get(place) ?? new Set<string>();
		if (names.has(name)) return undefined;
		asked.set(place, names.add(name));
	}
	return out;
}

/** The naming as one text, its keys in order: two namings with one text name everything alike. */
function canonical(naming: Naming | undefined): string {
	const sorted = <T>(record: Record<string, T> | undefined) => Object.fromEntries(Object.entries(record ?? {}).sort(([a], [b]) => a.localeCompare(b)));
	return JSON.stringify({ entities: sorted(naming?.entities), fields: sorted(naming?.fields) });
}

/** Whether two namings say the same. Nothing and an empty naming are the default. */
export function sameNaming(a: Naming | undefined, b: Naming | undefined): boolean {
	return canonical(a) === canonical(b);
}

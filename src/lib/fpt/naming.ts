// The names an admin picks (#111): the display name each custom entity is looked for under, and for
// each field the app wants, the field it is. Set Up Fields plans with it instead of fixed names
// (schema.ts), and the resolution it makes keeps it, so the sync, the setup check, the Notes on
// Shots and the action of #106 all read the names chosen. The default is the names the app always
// used: a site set up before needs nothing. Pure.
//
// A field is named by where it is and its default name, `take.sg_focal_length`: stable whatever
// it is called on a site, and what the resolution keys its names by.
//
// A project keeps its naming as JSON in `Project.sg_onset_naming` (Kevin, #111), and a file holds the
// same text. A text field stores JSON byte for byte, outer spaces stripped (corpus findings/158).

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
	if (typeof display === 'string' && display !== '') return { display };
	if (typeof field === 'string' && FIELD.test(field)) return { field };
	return undefined;
}

/** The name a choice asks for on its entity. */
export const askedName = (choice: FieldChoice): string => ('field' in choice ? choice.field : codeName(choice.display));

/** A naming's shape, whatever its problems, or undefined. */
function shapeOf(value: unknown): Naming | undefined {
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
	return out;
}

/**
 * - `display`: a display name with outer spaces, or a character outside ASCII.
 * - `entities`: two custom entities would be found under one name.
 * - `fields`: two fields of one entity ask for one name.
 */
export type NamingProblem =
	| { kind: 'display'; key: string }
	| { kind: 'entities'; scopes: CustomScope[]; name: string }
	| { kind: 'fields'; place: FieldPlace; keys: string[]; name: string };

/** What stops a naming being saved, each once. None: it is one. */
export function namingProblems(naming: Naming): NamingProblem[] {
	const out: NamingProblem[] = [];
	for (const [key, choice] of Object.entries(naming.fields ?? {})) {
		if ('display' in choice && (choice.display !== choice.display.trim() || !DISPLAY.test(choice.display))) out.push({ kind: 'display', key });
	}
	// Each custom entity under names no other one takes.
	const byName = new Map<string, CustomScope[]>();
	for (const scope of CUSTOM_SCOPES) {
		for (const name of new Set(entityNames(naming, scope).map(loose))) byName.set(name, [...(byName.get(name) ?? []), scope]);
	}
	for (const [name, scopes] of byName) if (scopes.length > 1) out.push({ kind: 'entities', scopes, name });
	// Each field of an entity under a name no other field of it asks for.
	const asked = new Map<string, { place: FieldPlace; keys: string[]; name: string }>();
	for (const { place, column } of wantedFields()) {
		const name = askedName(fieldChoice(naming, place, column));
		const at = `${place} ${name}`;
		const seen = asked.get(at) ?? { place, keys: [], name };
		seen.keys.push(fieldKey(place, column));
		asked.set(at, seen);
	}
	for (const seen of asked.values()) if (seen.keys.length > 1) out.push({ kind: 'fields', ...seen });
	return out;
}

/**
 * A naming, checked whole, or undefined. Refused: a shape it is not, or any of `namingProblems`. A
 * field key the app does not know is kept: it names nothing here.
 */
export function parseNaming(value: unknown): Naming | undefined {
	const shape = shapeOf(value);
	return shape && namingProblems(shape).length === 0 ? shape : undefined;
}

const sorted = <T>(record: Record<string, T> | undefined) => Object.fromEntries(Object.entries(record ?? {}).sort(([a], [b]) => a.localeCompare(b)));

/** The naming as one text, its keys in order: two namings with one text name everything alike. */
function canonical(naming: Naming | undefined): string {
	return JSON.stringify({ entities: sorted(naming?.entities), fields: sorted(naming?.fields) });
}

/** Whether two namings say the same. Nothing and an empty naming are the default. */
export function sameNaming(a: Naming | undefined, b: Naming | undefined): boolean {
	return canonical(a) === canonical(b);
}

/** The format of a naming as text. A text of a later version is read as unreadable, and never written over. */
export const NAMING_VERSION = 1;

/** A naming as text: what `Project.sg_onset_naming` holds and what a file holds. Its keys in order. */
export function writeNaming(naming: Naming): string {
	return JSON.stringify({ app: 'sg-onset', naming: NAMING_VERSION, entities: sorted(naming.entities), fields: sorted(naming.fields) });
}

/** What a text holds: a naming, or not `ok`: text this version cannot read. */
export type NamingRead = { ok: true; naming: Naming } | { ok: false };

/**
 * A naming from its text. Empty, the field reads null (corpus field_types/text.md): the default
 * names. The parsed value counts, never the text: Flow PT strips outer spaces (findings/158).
 */
export function readNaming(raw: unknown): NamingRead {
	if (raw === null || raw === undefined || raw === '') return { ok: true, naming: DEFAULT_NAMING };
	if (typeof raw !== 'string') return { ok: false };
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch {
		return { ok: false };
	}
	if (!isObject(value) || value.app !== 'sg-onset' || value.naming !== NAMING_VERSION) return { ok: false };
	const naming = parseNaming({ entities: value.entities ?? {}, fields: value.fields ?? {} });
	return naming ? { ok: true, naming } : { ok: false };
}

/** The naming with a custom entity looked for under `name`. Its own name, or none: back to the default. */
export function withEntity(naming: Naming, scope: CustomScope, name: string): Naming {
	const { [scope]: _old, ...entities } = naming.entities ?? {};
	const text = name.trim();
	if (text === '' || loose(text) === loose(ENTITY_TYPES[scope].displayName)) return { ...naming, entities };
	return { ...naming, entities: { ...entities, [scope]: text } };
}

/** The naming with a field's choice. None, or its own display name: back to the default. */
export function withField(naming: Naming, place: FieldPlace, column: Column, choice: FieldChoice | undefined): Naming {
	const key = fieldKey(place, column);
	const { [key]: _old, ...fields } = naming.fields ?? {};
	if (!choice || ('display' in choice && choice.display === column.display)) return { ...naming, fields };
	return { ...naming, fields: { ...fields, [key]: choice } };
}

/**
 * Every field given named `<prefix> <its display name>`, at once. A field mapped to one the site has
 * keeps it. No prefix: back to the app's own names.
 */
export function withPrefix(naming: Naming, prefix: string, fields: readonly { place: FieldPlace; column: Column }[]): Naming {
	const text = prefix.trim();
	let out = naming;
	for (const { place, column } of fields) {
		if ('field' in fieldChoice(out, place, column)) continue;
		out = withField(out, place, column, text ? { display: `${text} ${column.display}` } : undefined);
	}
	return out;
}

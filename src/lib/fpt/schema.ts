// Schema resolution: from what a site's schema says, which entity type holds each of our scopes,
// which of our fields are there, and which are still to create. Pure: the reads and the creates
// are in setup.ts.
//
// Shapes are the corpus's: endpoints/get_schema.md, endpoints/get_schema_type_fields.md.

import {
	ENTITY_SCOPES,
	ENTITY_TYPES,
	isOptionalColumn,
	isOptionalScope,
	NOTE_CAPTURED,
	NOTE_COLUMNS,
	NOTE_KEY,
	OPTIONAL_SCOPES,
	UUID,
	VERSION_COLUMNS,
	wantedColumns,
	type Column,
	type EntityScope,
	type FptDataType,
	type OptionalScope,
	type RequiredScope,
	type Target
} from './mapping';
import { codeName, reverseField } from './names';
import { VERSION } from './versions';

/**
 * Where a planned field is: one of our scopes' entities, Version, where a take's videos go, or
 * Note, where the Note on a Shot is kept (#97).
 */
export type PlanScope = EntityScope | 'version' | 'note';

/** Note, a stock type. */
export const NOTE = 'Note';

/** `GET /schema`, its `data`: one entry per enabled type, keyed by schema name. */
export type SchemaTypes = Record<string, { name: Property<string> }>;

/** A property as the schema wraps it. The outer `editable` is about the property, not the field. */
type Property<T> = { value: T; editable?: boolean };

/** One field of `GET /schema/<Type>/fields`, the parts we read. */
export type RawField = {
	name: Property<string>;
	data_type: Property<string>;
	editable?: Property<boolean>;
	unique?: Property<boolean>;
	properties?: { valid_types?: Property<unknown> } & Record<string, unknown>;
};
export type RawFields = Record<string, RawField>;

export type EntityResolution = {
	scope: EntityScope;
	kind: 'builtin' | 'custom';
	/** For a custom entity: the display name to give it. For a built-in one: what the site calls it. */
	displayName: string;
	/**
	 * - `missing`: a built-in type is switched off, or no custom entity has the display name. An
	 *   admin turns it on in the web interface; no API call does (corpus findings/122_onset_entity_types.md).
	 * - `ambiguous`: more than one custom entity has the display name. `candidates` lists them.
	 */
	status: 'found' | 'missing' | 'ambiguous';
	/** The schema name. For a built-in type, also when missing: it is what to switch on. */
	entityType?: string;
	candidates?: string[];
	/** The site syncs without it: what needs it waits (Kevin, #117). */
	optional?: true;
};

/** A project custom entity. Connection types are `CustomEntity29_sg_scene_Connection`. */
const CUSTOM_ENTITY = /^CustomEntity\d+$/;

// Display names are free text and may hold outer spaces (corpus findings/008_custom_entities.md).
const loose = (text: string) => text.trim().toLowerCase();

/** Finds the entity type of each scope in a site's type list. */
export function resolveEntities(types: SchemaTypes): EntityResolution[] {
	const customs = Object.keys(types).filter((name) => CUSTOM_ENTITY.test(name));
	return ENTITY_SCOPES.map((scope): EntityResolution => ({ ...resolveOne(scope, types, customs), ...(isOptionalScope(scope) ? { optional: true as const } : {}) }));
}

function resolveOne(scope: EntityScope, types: SchemaTypes, customs: string[]): EntityResolution {
	const want = ENTITY_TYPES[scope];
	if (want.kind === 'builtin') {
		// Presence in /schema is the enablement test (findings/008, findings/122).
		const there = types[want.entityType];
		return { scope, kind: 'builtin', displayName: there?.name.value.trim() || want.displayName, status: there ? 'found' : 'missing', entityType: want.entityType };
	}
	const accepted = [want.displayName, ...(want.aliases ?? [])].map(loose);
	const found = customs.filter((name) => accepted.includes(loose(types[name].name.value))).sort();
	const base = { scope, kind: 'custom' as const, displayName: want.displayName };
	if (found.length === 1) return { ...base, status: 'found', entityType: found[0] };
	if (found.length === 0) return { ...base, status: 'missing' };
	return { ...base, status: 'ambiguous', candidates: found };
}

/** The entity type of every scope, those optional when found, or nothing when a required one is not. */
export function entityTypesOf(entities: readonly EntityResolution[]): Resolution['entities'] | undefined {
	const out: Partial<Record<EntityScope, string>> = {};
	for (const e of entities) if (e.status === 'found' && e.entityType) out[e.scope] = e.entityType;
	return ENTITY_SCOPES.every((s) => isOptionalScope(s) || out[s]) ? (out as Resolution['entities']) : undefined;
}

/** The entity types found, whatever is missing. */
export function foundTypes(entities: readonly EntityResolution[]): Partial<Record<EntityScope, string>> {
	const out: Partial<Record<EntityScope, string>> = {};
	for (const e of entities) if (e.status === 'found' && e.entityType) out[e.scope] = e.entityType;
	return out;
}

export type FieldPlan = {
	scope: PlanScope;
	entityType: string;
	/** The field as the mapping names it. */
	column: Column;
	/** The name on this site: the one found, or the one a create will make. */
	name: string;
	displayName: string;
	dataType: FptDataType;
	/**
	 * - `present`: there, and of the right type.
	 * - `create`: to make.
	 * - `blocked`: cannot be made as things are. `reason` says why.
	 */
	status: 'present' | 'create' | 'blocked';
	reason?: string;
	unique?: true;
	/** For `entity` and `multi_entity`: the type to link. */
	validTypes?: string[];
	/**
	 * For a link field: the field the server adds on the linked type when it is created, or the
	 * one it added when it is present (corpus findings/142_reverse_field.md).
	 */
	reverse?: ReversePlan;
};

/** A field the server adds on a linked type. Visible, editable, and deleting it deletes the link too. */
export type ReversePlan = { entityType: string; name: string; displayName: string };

/** What else of the site the plan needs: what it calls each type, and the fields of the types outside our scopes. */
export type SiteContext = {
	/** Display name by entity type, from `GET /schema`. */
	names?: Record<string, string>;
	/** Fields of other linked types, by type: `Attachment`. A type left out is not checked for collisions. */
	others?: Record<string, RawFields>;
	/** The fields of Version, where a take's videos go. Left out: nothing is planned there. */
	version?: RawFields;
	/** The fields of Note, for the Notes on Shots (#97). Left out: nothing is planned there. */
	note?: RawFields;
};

function targetType(target: Target, types: Partial<Record<EntityScope, string>>): string | undefined {
	if (target === 'project') return 'Project';
	if (target === 'attachment') return 'Attachment';
	if (target === 'shot') return 'Shot';
	return types[target];
}

function mismatch(column: Column, field: RawField, valid: string | undefined): string | undefined {
	if (field.data_type.value !== column.dataType) return `is a ${field.data_type.value} field, not ${column.dataType}`;
	if (field.editable?.value === false) return 'is not editable';
	// `unique` is accepted at create and nowhere else (corpus findings/116_field_settings_create_update.md).
	if (column.unique && field.unique?.value !== true) return 'is not unique, and unique can only be set when a field is created';
	if (valid) {
		const types = field.properties?.valid_types?.value;
		if (!Array.isArray(types) || !types.includes(valid)) return `does not link ${valid}`;
	}
	return undefined;
}

/**
 * What to do about every field we want, on the entities that were found.
 *
 * A site field with our name and a fitting type is used as it is. Where the plain name is taken
 * by something else, ours steps aside to `sg_onset_<name>`, display name "Onset <name>". A display
 * name already shown by another field is avoided too: the server would answer 201 for a silent
 * `<name>_1` (corpus endpoints/post_schema_type_fields.md).
 */
export function planFields(types: Partial<Record<EntityScope, string>>, fields: Partial<Record<EntityScope, RawFields>>, site: SiteContext = {}): FieldPlan[] {
	const version = site.version ? VERSION_COLUMNS.map((column) => planColumn('version', VERSION, column, site.version!, types)) : [];
	const note = site.note ? NOTE_COLUMNS.map((column) => planColumn('note', NOTE, column, site.note!, types)) : [];
	return planReverses([...planOwn(types, fields), ...version, ...note], types, fields, site);
}

/**
 * The field each link create will add on the type it links, checked against what that type
 * holds and against what our other creates will add (corpus findings/142_reverse_field.md). A
 * link whose added field would take a name already there is not created: the server's choice
 * then is unmeasured, and a wrong guess cannot be undone by deleting, since deleting the added
 * field deletes the link too. A link already there is matched with the field it added.
 */
function planReverses(plans: FieldPlan[], types: Partial<Record<EntityScope, string>>, fields: Partial<Record<EntityScope, RawFields>>, site: SiteContext): FieldPlan[] {
	const scopeOf = new Map(ENTITY_SCOPES.filter((s) => types[s]).map((s) => [types[s]!, s]));
	const fieldsOf = (type: string): RawFields | undefined => {
		const scope = scopeOf.get(type);
		return scope ? fields[scope] : site.others?.[type];
	};
	const taken = new Map<string, Set<string>>();
	const takenOn = (type: string): Set<string> => {
		if (!taken.has(type)) {
			const ours = plans.filter((p) => p.entityType === type && p.status !== 'blocked').map((p) => p.name);
			taken.set(type, new Set([...Object.keys(fieldsOf(type) ?? {}), ...ours]));
		}
		return taken.get(type)!;
	};
	return plans.map((plan) => {
		const target = plan.validTypes?.[0];
		if (!target || plan.column.stock || plan.scope === 'version' || plan.scope === 'note' || (plan.dataType !== 'entity' && plan.dataType !== 'multi_entity') || plan.status === 'blocked') return plan;
		const source = site.names?.[plan.entityType]?.trim() || ENTITY_TYPES[plan.scope].displayName;
		const predicted = { entityType: target, ...reverseField(plan.entityType, source, plan.name, plan.displayName, plan.dataType) };
		const have = fieldsOf(target);
		if (plan.status === 'present') {
			if (have?.[predicted.name]) return { ...plan, reverse: { ...predicted, displayName: have[predicted.name].name.value } };
			const found = Object.entries(have ?? {}).find(
				([, f]) => f.data_type.value === 'multi_entity' && linksType(f, plan.entityType) && f.name.value.endsWith(` <-> ${plan.displayName}`)
			);
			return found ? { ...plan, reverse: { entityType: target, name: found[0], displayName: found[1].name.value } } : plan;
		}
		if (have === undefined) return { ...plan, reverse: predicted };
		const names = takenOn(target);
		if (names.has(predicted.name)) {
			const whose = have[predicted.name] ? 'which the site already has' : 'which another field of SG OnSet would add';
			return { ...plan, status: 'blocked', reason: `creating it would add ${target}.${predicted.name}, ${whose}. An admin renames that field, then runs Set Up Fields again` };
		}
		names.add(predicted.name);
		return { ...plan, reverse: predicted };
	});
}

const linksType = (field: RawField, type: string): boolean => {
	const valid = field.properties?.valid_types?.value;
	return Array.isArray(valid) && valid.includes(type);
};

function planOwn(types: Partial<Record<EntityScope, string>>, fields: Partial<Record<EntityScope, RawFields>>): FieldPlan[] {
	const plans: FieldPlan[] = [];
	for (const scope of ENTITY_SCOPES) {
		const entityType = types[scope];
		const have = fields[scope];
		if (!entityType || !have) continue;
		for (const column of wantedColumns(scope)) {
			// A link to an optional entity the site lacks waits for it, and blocks nothing (Kevin, #117).
			if (column.target && isOptionalScope(column.target) && !types[column.target]) continue;
			plans.push(planColumn(scope, entityType, column, have, types));
		}
	}
	return plans;
}

/** What to do about one field we want on a type, given the fields the type has. */
function planColumn(scope: PlanScope, entityType: string, column: Column, have: RawFields, types: Partial<Record<EntityScope, string>>): FieldPlan {
	const shown = new Set(Object.values(have).map((f) => loose(f.name.value)));
	const base = { scope, entityType, column, dataType: column.dataType, ...(column.unique ? { unique: true as const } : {}) };
	const valid = column.target ? targetType(column.target, types) : undefined;
	if (column.target && !valid) {
		const missing = ENTITY_TYPES[column.target as EntityScope].displayName;
		return { ...base, name: column.name, displayName: column.display, status: 'blocked', reason: `links ${missing}, which the site does not have yet` };
	}
	const links = valid ? { validTypes: [valid] } : {};
	const aside = column.display.startsWith('Onset ') ? [] : [`Onset ${column.display}`];
	const candidates = [column.display, ...aside].map((display) => ({ display, name: codeName(display) }));

	const usable = candidates.find((c) => have[c.name] && !mismatch(column, have[c.name], valid));
	if (usable) return { ...base, ...links, name: usable.name, displayName: have[usable.name].name.value, status: 'present' };
	const why = candidates.map((c) => {
		if (have[c.name]) return `${entityType}.${c.name} ${mismatch(column, have[c.name], valid)}`;
		return shown.has(loose(c.display)) ? `another ${entityType} field is already shown as "${c.display}"` : undefined;
	});
	const at = why.findIndex((w) => w === undefined);
	const reason = why.filter((w): w is string => w !== undefined).join('; ');
	if (at < 0) return { ...base, ...links, name: column.name, displayName: column.display, status: 'blocked', reason };
	return { ...base, ...links, name: candidates[at].name, displayName: candidates[at].display, status: 'create', ...(reason ? { reason } : {}) };
}

export type CreateInput = { dataType: FptDataType; displayName: string; properties: Record<string, unknown> };

/**
 * The create call for a planned field. Every setting goes in the create: `unique` and a
 * multi-entity's `valid_types` are accepted nowhere else (corpus findings/116). A checkbox needs a
 * default or the create is a 500 (endpoints/post_schema_type_fields.md).
 */
export function createInput(plan: FieldPlan): CreateInput {
	const properties: Record<string, unknown> = {};
	if (plan.unique) properties.unique = true;
	if (plan.validTypes) properties.valid_types = plan.validTypes;
	if (plan.dataType === 'checkbox') properties.default_value = false;
	properties.description = [plan.column.note, 'Written by SG OnSet.'].filter(Boolean).join('. ').replace('..', '.');
	return { dataType: plan.dataType, displayName: plan.displayName, properties };
}

/**
 * A site's schema as the transport needs it: the entity type of each scope, and the real name of
 * each field, by the name the mapping gives it. Cached on the device per site.
 */
export type Resolution = {
	version: 1;
	site: string;
	/** An optional entity is here only once it and every field of it, and every link to it, are there. */
	entities: Record<RequiredScope, string> & Partial<Record<OptionalScope, string>>;
	fields: Record<RequiredScope, Record<string, string>> & Partial<Record<OptionalScope, Record<string, string>>>;
	/** The name on the site of the client UUID field of Version, where a take's videos go. */
	versionUuid: string;
	/**
	 * The names on the site of the Note fields of the Notes on Shots (#97): the key and what the
	 * Note lists. Here only once both are there; until then the Notes wait.
	 */
	note?: { key: string; captured: string };
};

/** The fields of an optional scope and the fields that link it, by scope. */
function optionalColumns(optional: OptionalScope): { scope: EntityScope; column: Column }[] {
	return ENTITY_SCOPES.flatMap((scope) => wantedColumns(scope).filter((c) => isOptionalColumn(scope, c) && (scope === optional || c.target === optional)).map((column) => ({ scope, column })));
}

/**
 * The resolution, once every required entity is found and every field of theirs is present.
 * Otherwise nothing. An optional entity is in it only with all its fields and the fields that link
 * it; until then it is left out, and what needs it waits (Kevin, #117).
 */
export function toResolution(site: string, entities: readonly EntityResolution[], plans: readonly FieldPlan[]): Resolution | undefined {
	const types: Partial<Record<EntityScope, string>> | undefined = entityTypesOf(entities);
	if (!types) return undefined;
	const nameOf = (scope: EntityScope, column: Column) => {
		const plan = plans.find((p) => p.scope === scope && p.column.name === column.name);
		return plan?.status === 'present' ? plan.name : undefined;
	};
	const fields: Partial<Record<EntityScope, Record<string, string>>> = {};
	for (const scope of ENTITY_SCOPES) {
		if (isOptionalScope(scope)) continue;
		fields[scope] = {};
		for (const column of wantedColumns(scope)) {
			if (isOptionalColumn(scope, column)) continue;
			const name = nameOf(scope, column);
			if (!name) return undefined;
			fields[scope]![column.name] = name;
		}
	}
	for (const optional of OPTIONAL_SCOPES) {
		const wanted = optionalColumns(optional);
		const names = wanted.map(({ scope, column }) => nameOf(scope, column));
		if (!types[optional] || names.some((name) => !name)) {
			delete types[optional];
			continue;
		}
		wanted.forEach(({ scope, column }, i) => ((fields[scope] ??= {})[column.name] = names[i]!));
	}
	const uuid = plans.find((p) => p.scope === 'version' && p.column.name === UUID.name);
	if (uuid?.status !== 'present') return undefined;
	const noteOf = (column: Column) => plans.find((p) => p.scope === 'note' && p.column.name === column.name && p.status === 'present')?.name;
	const [key, captured] = [noteOf(NOTE_KEY), noteOf(NOTE_CAPTURED)];
	return {
		version: 1,
		site,
		entities: types as Resolution['entities'],
		fields: fields as Resolution['fields'],
		versionUuid: uuid.name,
		...(key && captured ? { note: { key, captured } } : {})
	};
}

/** Whether the site has the Note fields of the Notes on Shots (#97). */
export function hasNotes(resolution: Resolution): boolean {
	return resolution.note !== undefined;
}

/** Whether the site has an optional entity, with its fields and the fields that link it. */
export function hasScope(resolution: Resolution, scope: OptionalScope): boolean {
	return typeof resolution.entities[scope] === 'string';
}

/** The name on the site of a mapped field. A stock field is its own name. */
export function fieldName(resolution: Resolution, scope: EntityScope, column: Column): string {
	const fields: Partial<Record<EntityScope, Record<string, string>>> = resolution.fields;
	return column.stock ? column.name : (fields[scope]?.[column.name] ?? column.name);
}

export function serializeResolution(resolution: Resolution): string {
	return JSON.stringify(resolution);
}

/** What the cache held, if it is a resolution of this site and still names every field we want. */
export function parseResolution(raw: string | undefined | null, site: string): Resolution | undefined {
	if (!raw) return undefined;
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch {
		return undefined;
	}
	if (value === null || typeof value !== 'object') return undefined;
	const r = value as Partial<Resolution>;
	// Without `versionUuid`: written before videos went up as Versions. Resolve again.
	if (r.version !== 1 || r.site !== site || !r.entities || !r.fields || typeof r.versionUuid !== 'string') return undefined;
	// Without `note`: the Notes on Shots wait, the rest syncs. A `note` kept must name both fields.
	if (r.note !== undefined && (r.note === null || typeof r.note.key !== 'string' || typeof r.note.captured !== 'string')) return undefined;
	const entities: Partial<Record<EntityScope, unknown>> = r.entities;
	const fields: Partial<Record<EntityScope, Record<string, unknown>>> = r.fields;
	for (const scope of ENTITY_SCOPES) {
		if (isOptionalScope(scope)) continue;
		if (typeof entities[scope] !== 'string' || !fields[scope]) return undefined;
		// A catalogue field added since the cache was written has no name here: resolve again.
		for (const column of wantedColumns(scope)) if (!isOptionalColumn(scope, column) && typeof fields[scope]![column.name] !== 'string') return undefined;
	}
	// An optional entity left out is fine. One kept must still name every field it needs.
	for (const optional of OPTIONAL_SCOPES) {
		if (entities[optional] === undefined) continue;
		if (typeof entities[optional] !== 'string') return undefined;
		for (const { scope, column } of optionalColumns(optional)) if (typeof fields[scope]?.[column.name] !== 'string') return undefined;
	}
	return r as Resolution;
}

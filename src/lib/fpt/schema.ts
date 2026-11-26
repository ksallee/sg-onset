// Schema resolution: from what a site's schema says, which entity type holds each of our scopes,
// which of our fields are there, and which are still to create. Pure: the reads and the creates
// are in setup.ts.
//
// Shapes are the corpus's: endpoints/get_schema.md, endpoints/get_schema_type_fields.md.

import {
	ENTITY_SCOPES,
	ENTITY_TYPES,
	fieldMaps,
	isOptionalColumn,
	isOptionalScope,
	NOTE_CAPTURED,
	NOTE_COLUMNS,
	NOTE_KEY,
	OPTIONAL_SCOPES,
	PROJECT_COLUMNS,
	PROJECT_KINDS,
	PROJECT_RIGS,
	PROJECT_TEMPLATES,
	UUID,
	VERSION_COLUMNS,
	wantedColumns,
	type Column,
	type EntityScope,
	type FieldPlace,
	type FptDataType,
	type OptionalScope,
	type RequiredScope,
	type Target
} from './mapping';
import { DEFAULT_NAMING, entityName, entityNames, fieldChoice, parseNaming, sameNaming, type CustomScope, type Naming } from './naming';
import { codeName, reverseField } from './names';
import { LIST_TABLES, type ListTable } from './lists';
import { VERSION } from './versions';

/**
 * Where a planned field is: one of our scopes' entities, Version, where a take's videos go, Note,
 * where the Note on a Shot is kept (#97), or Project, where the shared lists are kept (#110).
 */
export type PlanScope = FieldPlace;

/** Note, a stock type. */
export const NOTE = 'Note';

/** Project, a stock type. */
export const PROJECT = 'Project';

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

/** Whether a type of /schema is a project custom entity slot. */
export const isCustomEntityType = (type: string): boolean => CUSTOM_ENTITY.test(type);

// Display names are free text and may hold outer spaces (corpus findings/008_custom_entities.md).
const loose = (text: string) => text.trim().toLowerCase();

/** Finds the entity type of each scope in a site's type list, a custom one under the name the naming gives it (#111). */
export function resolveEntities(types: SchemaTypes, naming: Naming = DEFAULT_NAMING): EntityResolution[] {
	const customs = Object.keys(types).filter((name) => CUSTOM_ENTITY.test(name));
	return ENTITY_SCOPES.map((scope): EntityResolution => ({ ...resolveOne(scope, types, customs, naming), ...(isOptionalScope(scope) ? { optional: true as const } : {}) }));
}

function resolveOne(scope: EntityScope, types: SchemaTypes, customs: string[], naming: Naming): EntityResolution {
	const want = ENTITY_TYPES[scope];
	if (want.kind === 'builtin') {
		// Presence in /schema is the enablement test (findings/008, findings/122).
		const there = types[want.entityType];
		return { scope, kind: 'builtin', displayName: there?.name.value.trim() || want.displayName, status: there ? 'found' : 'missing', entityType: want.entityType };
	}
	const accepted = entityNames(naming, scope as CustomScope).map(loose);
	const found = customs.filter((name) => accepted.includes(loose(types[name].name.value))).sort();
	const base = { scope, kind: 'custom' as const, displayName: entityName(naming, scope) };
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
	/** The fields of Project, for the shared lists (#110). Left out: nothing is planned there. */
	project?: RawFields;
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

/** The stock fields the mapping names records and projects by: never offered for another field. */
const STOCK_NAMES = new Set(['code', 'description', 'project']);

/**
 * The fields of an entity a wanted field may be mapped to (#111): of its type, editable, linking
 * what it links, unique when it must be, as a field found under our name must be. The stock fields
 * of the mapping and the names other fields ask for (`taken`) are left out. By name.
 */
export function fieldOptions(column: Column, have: RawFields, types: Partial<Record<EntityScope, string>>, taken: ReadonlySet<string>): { name: string; displayName: string }[] {
	const valid = column.target ? targetType(column.target, types) : undefined;
	if (column.target && !valid) return [];
	return Object.entries(have)
		.filter(([name, field]) => !STOCK_NAMES.has(name) && !taken.has(name) && !mismatch(column, field, valid))
		.map(([name, field]) => ({ name, displayName: field.name.value }))
		.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * A site's schema as read: its type list, and the fields of each type read, by type. Read once,
 * it is planned under any naming (`planSite`), so the review of #111 needs no second read.
 */
export type SiteSchema = { types: SchemaTypes; fields: Record<string, RawFields> };

/** The linked types outside our scopes whose fields a plan checks: a link of ours adds a field on each (findings/142). */
export const OTHER_TYPES = ['Attachment', 'Shot'];

/** What Set Up Fields would find and plan on a site read, under a naming. Pure. */
export function planSite(site: SiteSchema, naming: Naming = DEFAULT_NAMING): { entities: EntityResolution[]; plans: FieldPlan[] } {
	const entities = resolveEntities(site.types, naming);
	const types = foundTypes(entities);
	const fields: Partial<Record<EntityScope, RawFields>> = {};
	for (const scope of ENTITY_SCOPES) if (types[scope] && site.fields[types[scope]!]) fields[scope] = site.fields[types[scope]!];
	// An entity found whose fields were not read is planned as not found: nothing is asked of it.
	for (const scope of ENTITY_SCOPES) if (!fields[scope]) delete types[scope];
	const others = Object.fromEntries(OTHER_TYPES.filter((t) => site.fields[t]).map((t) => [t, site.fields[t]]));
	const names = Object.fromEntries(Object.entries(site.types).map(([type, t]) => [type, t.name.value]));
	return { entities, plans: planFields(types, fields, { names, others, version: site.fields.Version, note: site.fields.Note, project: site.fields.Project }, naming) };
}

/**
 * What to do about every field we want, on the entities that were found.
 *
 * A site field with our name and a fitting type is used as it is. Where the plain name is taken
 * by something else, ours steps aside to `sg_onset_<name>`, display name "Onset <name>". A display
 * name already shown by another field is avoided too: the server would answer 201 for a silent
 * `<name>_1` (corpus endpoints/post_schema_type_fields.md).
 *
 * Each field goes by the naming (#111): the display name chosen in place of ours, or a field of the
 * site, used as it is and never created. The default naming plans what the app always did.
 */
export function planFields(
	types: Partial<Record<EntityScope, string>>,
	fields: Partial<Record<EntityScope, RawFields>>,
	site: SiteContext = {},
	naming: Naming = DEFAULT_NAMING
): FieldPlan[] {
	const version = site.version ? VERSION_COLUMNS.map((column) => planColumn('version', VERSION, column, site.version!, types, naming)) : [];
	const note = site.note ? NOTE_COLUMNS.map((column) => planColumn('note', NOTE, column, site.note!, types, naming)) : [];
	const project = site.project ? PROJECT_COLUMNS.map((column) => planColumn('project', PROJECT, column, site.project!, types, naming)) : [];
	return planReverses([...planOwn(types, fields, naming), ...version, ...note, ...project], types, fields, site, naming);
}

/**
 * The field each link create will add on the type it links, checked against what that type
 * holds and against what our other creates will add (corpus findings/142_reverse_field.md). A
 * link whose added field would take a name already there is not created: the server's choice
 * then is unmeasured, and a wrong guess cannot be undone by deleting, since deleting the added
 * field deletes the link too. A link already there is matched with the field it added.
 */
function planReverses(plans: FieldPlan[], types: Partial<Record<EntityScope, string>>, fields: Partial<Record<EntityScope, RawFields>>, site: SiteContext, naming: Naming): FieldPlan[] {
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
		if (!target || plan.column.stock || plan.scope === 'version' || plan.scope === 'note' || plan.scope === 'project' || (plan.dataType !== 'entity' && plan.dataType !== 'multi_entity') || plan.status === 'blocked') return plan;
		const source = site.names?.[plan.entityType]?.trim() || entityName(naming, plan.scope);
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

function planOwn(types: Partial<Record<EntityScope, string>>, fields: Partial<Record<EntityScope, RawFields>>, naming: Naming): FieldPlan[] {
	const plans: FieldPlan[] = [];
	for (const scope of ENTITY_SCOPES) {
		const entityType = types[scope];
		const have = fields[scope];
		if (!entityType || !have) continue;
		for (const column of wantedColumns(scope)) {
			// A link to an optional entity the site lacks waits for it, and blocks nothing (Kevin, #117).
			if (column.target && isOptionalScope(column.target) && !types[column.target]) continue;
			plans.push(planColumn(scope, entityType, column, have, types, naming));
		}
	}
	return plans;
}

/** What to do about one field we want on a type, given the fields the type has and the naming. */
function planColumn(scope: PlanScope, entityType: string, column: Column, have: RawFields, types: Partial<Record<EntityScope, string>>, naming: Naming): FieldPlan {
	const choice = fieldChoice(naming, scope, column);
	const base = { scope, entityType, column, dataType: column.dataType, ...(column.unique ? { unique: true as const } : {}) };
	const valid = column.target ? targetType(column.target, types) : undefined;
	if (column.target && !valid) {
		const missing = entityName(naming, column.target as EntityScope);
		const asked = 'field' in choice ? { name: choice.field, displayName: choice.field } : { name: codeName(choice.display), displayName: choice.display };
		return { ...base, ...asked, status: 'blocked', reason: `links ${missing}, which the site does not have yet` };
	}
	const links = valid ? { validTypes: [valid] } : {};
	if ('field' in choice) {
		// A field of the site the admin picked: used as it is, or not at all. Never created.
		const name = choice.field;
		const field = have[name];
		const wrong = field ? mismatch(column, field, valid) : 'is not on the site';
		if (!wrong && field) return { ...base, ...links, name, displayName: field.name.value, status: 'present' };
		return { ...base, ...links, name, displayName: field?.name.value ?? name, status: 'blocked', reason: `${entityType}.${name} ${wrong}` };
	}
	const display = choice.display;
	const shown = new Set(Object.values(have).map((f) => loose(f.name.value)));
	const aside = display.startsWith('Onset ') ? [] : [`Onset ${display}`];
	const candidates = [display, ...aside].map((d) => ({ display: d, name: codeName(d) }));

	const usable = candidates.find((c) => have[c.name] && !mismatch(column, have[c.name], valid));
	if (usable) return { ...base, ...links, name: usable.name, displayName: have[usable.name].name.value, status: 'present' };
	const why = candidates.map((c) => {
		if (have[c.name]) return `${entityType}.${c.name} ${mismatch(column, have[c.name], valid)}`;
		return shown.has(loose(c.display)) ? `another ${entityType} field is already shown as "${c.display}"` : undefined;
	});
	const at = why.findIndex((w) => w === undefined);
	const reason = why.filter((w): w is string => w !== undefined).join('; ');
	if (at < 0) return { ...base, ...links, name: codeName(display), displayName: display, status: 'blocked', reason };
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
	/**
	 * The names on the site of the Project fields of the shared lists (#110): the templates, the
	 * kinds of set reference, and the rigs (#138). Each list follows its own field (Kevin,
	 * 2026-11-25): a field not there is left out, and its list waits on the device.
	 */
	project?: ProjectFields;
	/**
	 * The names an admin picked that it was resolved with (#111, naming.ts). Absent: the default,
	 * the names the app always used, as in a resolution kept before names could be picked.
	 */
	naming?: Naming;
};

/** The names of the Project fields of the shared lists, those there (#110, #138). */
export type ProjectFields = { templates?: string; referenceKinds?: string; rigs?: string };

/** The key of `Resolution.project` that names each list's field. */
export const LIST_FIELDS: Record<ListTable, keyof ProjectFields> = { template: 'templates', referenceKind: 'referenceKinds', rig: 'rigs' };

/** The fields of an optional scope and the fields that link it, by scope. An optional field of its own (#138) is not among them. */
function optionalColumns(optional: OptionalScope): { scope: EntityScope; column: Column }[] {
	return ENTITY_SCOPES.flatMap((scope) =>
		wantedColumns(scope)
			.filter((c) => !c.optional && isOptionalColumn(scope, c) && (scope === optional || c.target === optional))
			.map((column) => ({ scope, column }))
	);
}

/**
 * The resolution, once every required entity is found and every field of theirs is present.
 * Otherwise nothing. An optional entity is in it only with all its fields and the fields that link
 * it; until then it is left out, and what needs it waits (Kevin, #117). The fields are keyed by the
 * name the mapping gives them, whatever the naming calls them on the site, and the naming is kept.
 */
export function toResolution(site: string, entities: readonly EntityResolution[], plans: readonly FieldPlan[], naming: Naming = DEFAULT_NAMING): Resolution | undefined {
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
			// An optional field (#138) is named when it is there; until then its values wait.
			if (column.optional) {
				const name = nameOf(scope, column);
				if (name) fields[scope]![column.name] = name;
				continue;
			}
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
	const projectOf = (column: Column) => plans.find((p) => p.scope === 'project' && p.column.name === column.name && p.status === 'present')?.name;
	const lists: ProjectFields = {};
	for (const [key, column] of [['templates', PROJECT_TEMPLATES], ['referenceKinds', PROJECT_KINDS], ['rigs', PROJECT_RIGS]] as const) {
		const name = projectOf(column);
		if (name) lists[key] = name;
	}
	return {
		version: 1,
		site,
		entities: types as Resolution['entities'],
		fields: fields as Resolution['fields'],
		versionUuid: uuid.name,
		...(key && captured ? { note: { key, captured } } : {}),
		...(Object.keys(lists).length ? { project: lists } : {}),
		...(sameNaming(naming, DEFAULT_NAMING) ? {} : { naming })
	};
}

/** The names a resolution was made with: the default when it keeps none. */
export function namingOf(resolution: Resolution): Naming {
	return resolution.naming ?? DEFAULT_NAMING;
}

/** Whether the site has the Note fields of the Notes on Shots (#97). */
export function hasNotes(resolution: Resolution): boolean {
	return resolution.note !== undefined;
}

/** The shared lists whose Project field the site lacks (#110, #138): they wait on the device. */
export function missingLists(resolution: Resolution): ListTable[] {
	return LIST_TABLES.filter((table) => typeof resolution.project?.[LIST_FIELDS[table]] !== 'string');
}

/**
 * The keys whose optional field (#138) the site lacks, as `<scope>.<key>`, in mapping order: what waits on the device (app/sync/waiting.ts). An optional entity the site lacks is not
 * listed: its records wait whole.
 */
export function missingFields(resolution: Resolution): string[] {
	const fields: Partial<Record<EntityScope, Record<string, string>>> = resolution.fields;
	const entities: Partial<Record<EntityScope, string>> = resolution.entities;
	return ENTITY_SCOPES.filter((scope) => typeof entities[scope] === 'string').flatMap((scope) => fieldMaps(scope).filter((m) => m.columns.some((c) => c.optional && typeof fields[scope]?.[c.name] !== 'string')).map((m) => `${scope}.${m.key}`));
}

/** Whether the site has a mapped field: a stock field always, an optional one once it is made (#138). */
export function hasField(resolution: Resolution, scope: EntityScope, column: Column): boolean {
	const fields: Partial<Record<EntityScope, Record<string, string>>> = resolution.fields;
	return column.stock === true || !column.optional || typeof fields[scope]?.[column.name] === 'string';
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

/**
 * What the cache held, if it is a resolution of this site and still names every field we want.
 * With `naming`, only one made with those names (#111): another is read again.
 */
export function parseResolution(raw: string | undefined | null, site: string, naming?: Naming): Resolution | undefined {
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
	// Without `project`, or a field of it: that list waits, the rest syncs. What a `project` kept names
	// must be names: one kept before the rigs (#138) names two, and is good.
	if (r.project !== undefined && (r.project === null || typeof r.project !== 'object' || Object.values(r.project).some((v) => typeof v !== 'string'))) return undefined;
	// Without `naming`: the default names. A `naming` kept must be one, and the one asked for.
	if (r.naming !== undefined && !parseNaming(r.naming)) return undefined;
	if (naming !== undefined && !sameNaming(r.naming, naming)) return undefined;
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

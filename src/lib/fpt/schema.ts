// Schema resolution: from what a site's schema says, which entity type holds each of our scopes,
// which of our fields are there, and which are still to create. Pure: the reads and the creates
// are in setup.ts.
//
// Shapes are the corpus's: endpoints/get_schema.md, endpoints/get_schema_type_fields.md.

import { ENTITY_SCOPES, ENTITY_TYPES, wantedColumns, type Column, type EntityScope, type FptDataType, type Target } from './mapping';
import { codeName } from './names';

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
};

/** A project custom entity. Connection types are `CustomEntity29_sg_scene_Connection`. */
const CUSTOM_ENTITY = /^CustomEntity\d+$/;

// Display names are free text and may hold outer spaces (corpus findings/008_custom_entities.md).
const loose = (text: string) => text.trim().toLowerCase();

/** Finds the entity type of each scope in a site's type list. */
export function resolveEntities(types: SchemaTypes): EntityResolution[] {
	const customs = Object.keys(types).filter((name) => CUSTOM_ENTITY.test(name));
	return ENTITY_SCOPES.map((scope): EntityResolution => {
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
	});
}

/** The entity type of every scope, or nothing when one is not found. */
export function entityTypesOf(entities: readonly EntityResolution[]): Record<EntityScope, string> | undefined {
	const out: Partial<Record<EntityScope, string>> = {};
	for (const e of entities) if (e.status === 'found' && e.entityType) out[e.scope] = e.entityType;
	return ENTITY_SCOPES.every((s) => out[s]) ? (out as Record<EntityScope, string>) : undefined;
}

/** The entity types found, whatever is missing. */
export function foundTypes(entities: readonly EntityResolution[]): Partial<Record<EntityScope, string>> {
	const out: Partial<Record<EntityScope, string>> = {};
	for (const e of entities) if (e.status === 'found' && e.entityType) out[e.scope] = e.entityType;
	return out;
}

export type FieldPlan = {
	scope: EntityScope;
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
};

function targetType(target: Target, types: Partial<Record<EntityScope, string>>): string | undefined {
	if (target === 'project') return 'Project';
	if (target === 'attachment') return 'Attachment';
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
export function planFields(types: Partial<Record<EntityScope, string>>, fields: Partial<Record<EntityScope, RawFields>>): FieldPlan[] {
	const plans: FieldPlan[] = [];
	for (const scope of ENTITY_SCOPES) {
		const entityType = types[scope];
		const have = fields[scope];
		if (!entityType || !have) continue;
		const shown = new Set(Object.values(have).map((f) => loose(f.name.value)));
		for (const column of wantedColumns(scope)) {
			const base = { scope, entityType, column, dataType: column.dataType, ...(column.unique ? { unique: true as const } : {}) };
			const valid = column.target ? targetType(column.target, types) : undefined;
			if (column.target && !valid) {
				const missing = ENTITY_TYPES[column.target as EntityScope].displayName;
				plans.push({ ...base, name: column.name, displayName: column.display, status: 'blocked', reason: `links ${missing}, which the site does not have yet` });
				continue;
			}
			const links = valid ? { validTypes: [valid] } : {};
			const aside = column.display.startsWith('Onset ') ? [] : [`Onset ${column.display}`];
			const candidates = [column.display, ...aside].map((display) => ({ display, name: codeName(display) }));

			const usable = candidates.find((c) => have[c.name] && !mismatch(column, have[c.name], valid));
			if (usable) {
				plans.push({ ...base, ...links, name: usable.name, displayName: have[usable.name].name.value, status: 'present' });
				continue;
			}
			const why = candidates.map((c) => {
				if (have[c.name]) return `${entityType}.${c.name} ${mismatch(column, have[c.name], valid)}`;
				return shown.has(loose(c.display)) ? `another ${entityType} field is already shown as "${c.display}"` : undefined;
			});
			const at = why.findIndex((w) => w === undefined);
			const reason = why.filter((w): w is string => w !== undefined).join('; ');
			if (at < 0) {
				plans.push({ ...base, ...links, name: column.name, displayName: column.display, status: 'blocked', reason });
				continue;
			}
			plans.push({ ...base, ...links, name: candidates[at].name, displayName: candidates[at].display, status: 'create', ...(reason ? { reason } : {}) });
		}
	}
	return plans;
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
	entities: Record<EntityScope, string>;
	fields: Record<EntityScope, Record<string, string>>;
};

/** The resolution, once every entity is found and every field is present. Otherwise nothing. */
export function toResolution(site: string, entities: readonly EntityResolution[], plans: readonly FieldPlan[]): Resolution | undefined {
	const types = entityTypesOf(entities);
	if (!types) return undefined;
	const fields = {} as Record<EntityScope, Record<string, string>>;
	for (const scope of ENTITY_SCOPES) {
		fields[scope] = {};
		for (const column of wantedColumns(scope)) {
			const plan = plans.find((p) => p.scope === scope && p.column.name === column.name);
			if (plan?.status !== 'present') return undefined;
			fields[scope][column.name] = plan.name;
		}
	}
	return { version: 1, site, entities: types, fields };
}

/** The name on the site of a mapped field. A stock field is its own name. */
export function fieldName(resolution: Resolution, scope: EntityScope, column: Column): string {
	return column.stock ? column.name : (resolution.fields[scope][column.name] ?? column.name);
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
	if (r.version !== 1 || r.site !== site || !r.entities || !r.fields) return undefined;
	for (const scope of ENTITY_SCOPES) {
		if (typeof r.entities[scope] !== 'string' || !r.fields[scope]) return undefined;
		// A catalogue field added since the cache was written has no name here: resolve again.
		for (const column of wantedColumns(scope)) if (typeof r.fields[scope][column.name] !== 'string') return undefined;
	}
	return r as Resolution;
}

// The setup check: is this site ready for the app, and if not, exactly what is missing. The UI
// calls it after sign-in and shows the report. It reads the schema, creates the fields it may,
// and keeps the result on the device for the transport. No UI here: the report is data.

import { TransportError } from '$lib/outbox/transport';
import { ApiRefusal, createApi, type Api, type FptOptions } from './api';
import { resolutionKey } from './cache';
import { isPermissionRefusal } from './errors';
import { ENTITY_SCOPES, type EntityScope, type FptDataType } from './mapping';
import {
	createInput,
	foundTypes,
	parseResolution,
	planFields,
	resolveEntities,
	serializeResolution,
	toResolution,
	type EntityResolution,
	type FieldPlan,
	type RawFields,
	type Resolution
} from './schema';

export type FieldReport = {
	scope: EntityScope;
	entityType: string;
	/** The field's name on the site: `sg_focal_length`. */
	name: string;
	displayName: string;
	dataType: FptDataType;
	/**
	 * - `present`: it was there.
	 * - `created`: this check made it.
	 * - `missing`: not there, and the check was told not to create.
	 * - `needsAdmin`: the person signed in may not create fields. An admin creates it, with the
	 *   display name, the data type, `unique` and `validTypes` given here.
	 * - `blocked`: it cannot be made as the site is. `reason` says why.
	 * - `failed`: the site refused the create, or made another field than asked. `reason` says what.
	 */
	status: 'present' | 'created' | 'missing' | 'needsAdmin' | 'blocked' | 'failed';
	reason?: string;
	/** The field must be created unique. It cannot be made unique afterwards. */
	unique?: true;
	/** The entity type the field links. */
	validTypes?: string[];
};

export type SetupReport = {
	/** Every entity is found and every field is there: sync can run. */
	ready: boolean;
	site: string;
	/**
	 * One per scope. `missing` or `ambiguous` is for an admin, in the web interface: enable a custom
	 * entity for projects and name it `displayName`, or switch the built-in type on. No API call
	 * does either (corpus findings/122_onset_entity_types.md).
	 */
	entities: EntityResolution[];
	/** One per field we want, on the entities that were found. */
	fields: FieldReport[];
	/** Whether a field create went through. Absent when none was tried. */
	canCreateFields?: boolean;
};

const siteOf = (options: FptOptions) => options.site.replace(/\/+$/, '');

async function inspect(api: Api, signal?: AbortSignal): Promise<{ entities: EntityResolution[]; plans: FieldPlan[] }> {
	const entities = resolveEntities(await api.types(signal));
	const types = foundTypes(entities);
	const fields: Partial<Record<EntityScope, RawFields>> = {};
	// The fields of a type that is not in /schema are a 404 (corpus findings/008): only the found ones are read.
	await Promise.all(
		ENTITY_SCOPES.filter((scope) => types[scope]).map(async (scope) => {
			fields[scope] = await api.fields(types[scope]!, signal);
		})
	);
	return { entities, plans: planFields(types, fields) };
}

const reportOf = (plan: FieldPlan, status: FieldReport['status'], reason = plan.reason): FieldReport => ({
	scope: plan.scope,
	entityType: plan.entityType,
	name: plan.name,
	displayName: plan.displayName,
	dataType: plan.dataType,
	status,
	...(reason ? { reason } : {}),
	...(plan.unique ? { unique: true as const } : {}),
	...(plan.validTypes ? { validTypes: plan.validTypes } : {})
});

/**
 * Reads the site's schema, creates the fields that are missing unless `createFields` is false,
 * and says what is left for a person to do. Field creation needs admin rights: at the first
 * refusal it stops creating and lists every field left as `needsAdmin`.
 *
 * Throws a `TransportError` when the site cannot be asked: `unreachable`, `unauthorized`, `failed`.
 */
export async function checkSetup(options: FptOptions & { createFields?: boolean; signal?: AbortSignal }): Promise<SetupReport> {
	const api = createApi(options);
	const site = siteOf(options);
	const { signal } = options;
	const { entities, plans } = await inspect(api, signal);

	const fields: FieldReport[] = [];
	const settled: FieldPlan[] = [];
	let allowed: boolean | undefined;
	for (const plan of plans) {
		if (plan.status !== 'create') {
			fields.push(reportOf(plan, plan.status));
			settled.push(plan);
			continue;
		}
		if (options.createFields === false) fields.push(reportOf(plan, 'missing'));
		else if (allowed === false) fields.push(reportOf(plan, 'needsAdmin'));
		else {
			try {
				const name = await api.createField(plan.entityType, createInput(plan), signal);
				allowed = true;
				// A 201 does not mean the name asked for: a display name in use gives `<name>_1` (corpus
				// endpoints/post_schema_type_fields.md). A field under another name is not ours to find again.
				if (name === plan.name) {
					fields.push(reportOf(plan, 'created'));
					settled.push({ ...plan, status: 'present' });
					continue;
				}
				fields.push(reportOf(plan, 'failed', `the site created ${plan.entityType}.${name} instead of ${plan.name}: an admin deletes it and empties the field trash`));
			} catch (error) {
				if (!(error instanceof ApiRefusal)) throw error;
				// What the site answers a person who may not create fields is not in the corpus.
				if (isPermissionRefusal(error.failure)) {
					allowed = false;
					fields.push(reportOf(plan, 'needsAdmin', error.failure.title));
				} else fields.push(reportOf(plan, 'failed', error.failure.title));
			}
		}
		settled.push(plan);
	}

	const resolution = toResolution(site, entities, settled);
	if (resolution) await options.schemaCache.set(resolutionKey(site), serializeResolution(resolution));
	else await options.schemaCache.delete(resolutionKey(site));
	return { ready: resolution !== undefined, site, entities, fields, ...(allowed !== undefined ? { canCreateFields: allowed } : {}) };
}

/** What stands between the site and a sync, in a line. */
function missing(entities: EntityResolution[], plans: FieldPlan[]): string {
	const names = [
		...entities.filter((e) => e.status !== 'found').map((e) => `the ${e.displayName} entity`),
		...plans.filter((p) => p.status !== 'present').map((p) => `${p.entityType}.${p.name}`)
	];
	const shown = names.slice(0, 5).join(', ');
	return names.length > 5 ? `${shown} and ${names.length - 5} more` : shown;
}

/**
 * The site's schema as the transport needs it: from the cache, or read from the site. It never
 * creates anything: that is `checkSetup`, which the app runs after sign-in. A site that is not
 * ready throws `failed` and names what is missing.
 */
export async function loadResolution(api: Api, options: FptOptions, signal?: AbortSignal): Promise<Resolution> {
	const site = siteOf(options);
	const cached = parseResolution(await options.schemaCache.get(resolutionKey(site)), site);
	if (cached) return cached;
	const { entities, plans } = await inspect(api, signal);
	const resolution = toResolution(site, entities, plans);
	if (!resolution) throw new TransportError('failed', `Flow Production Tracking is not set up for sg-onset. Missing: ${missing(entities, plans)}.`);
	await options.schemaCache.set(resolutionKey(site), serializeResolution(resolution));
	return resolution;
}

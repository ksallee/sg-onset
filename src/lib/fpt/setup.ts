// The setup check: is this site ready for the app, and if not, exactly what is missing. The UI
// calls it after sign-in and shows the report. It reads the schema, creates the fields it may,
// and keeps the result on the device for the transport. No UI here: the report is data.

import { TransportError } from '$lib/outbox/transport';
import { t } from '$lib/i18n/messages';
import { ACTION_FIELDS, ACTION_MENU_ITEM, actionMenuData, actionMenuFilter, actionMenuPlan, actionMenuRowsOf, addProjectData } from './actionMenu';
import { ApiRefusal, createApi, type Api, type FptOptions } from './api';
import { resolutionKey } from './cache';
import { isFieldCreateRefusal, isPermissionRefusal } from './errors';
import { ENTITY_SCOPES, isOptionalColumn, type EntityScope, type FptDataType } from './mapping';
import { DEFAULT_NAMING, type Naming } from './naming';
import { SHOT } from './shots';
import {
	createInput,
	foundTypes,
	NOTE,
	parseResolution,
	PROJECT,
	planFields,
	resolveEntities,
	serializeResolution,
	toResolution,
	type EntityResolution,
	type FieldPlan,
	type PlanScope,
	type RawFields,
	type Resolution
} from './schema';
import { VERSION } from './versions';

export type FieldReport = {
	/** The scope whose entity holds the field, or `version`: Version, where a take's videos go. */
	scope: PlanScope;
	entityType: string;
	/** The field's name on the site: `sg_focal_length`. */
	name: string;
	displayName: string;
	dataType: FptDataType;
	/**
	 * - `present`: it was there.
	 * - `created`: this check made it.
	 * - `missing`: not there, and the check was told not to create.
	 * - `needsAdmin`: the person signed in may not create fields (findings/132). An Admin runs Set
	 *   Up Fields.
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
	/**
	 * The fields Flow PT adds on the linked types for our link fields: one per link field (corpus
	 * findings/142_reverse_field.md). Shown so an admin is not surprised by them, and told not to
	 * delete them: deleting one deletes our link field too.
	 */
	reverseFields: ReverseReport[];
	/** Whether a field create went through. Absent when none was tried. */
	canCreateFields?: boolean;
	/**
	 * The Action Menu Item "Send set data to artists" (#106, actionMenu.ts): one per entity type,
	 * Shot and Set Shot when its slot is found. Absent when no project was given.
	 */
	action?: { title: string; url: string; items: ActionReport[] };
};

export type ActionReport = {
	/** `Shot`, or the Set Shot slot. */
	entityType: string;
	/**
	 * - `present`: there, for the project.
	 * - `added`: this check made it, or added the project to it.
	 * - `missing`: not there, and the check was told not to create.
	 * - `needsAdmin`: the account may not create one (findings/156: an Artist gets 400 code 104).
	 * - `failed`: the site refused, or did not answer. `reason` says what.
	 */
	status: 'present' | 'added' | 'missing' | 'needsAdmin' | 'failed';
	reason?: string;
};

export type ReverseReport = {
	/** The linked type the field is on. */
	entityType: string;
	name: string;
	displayName: string;
	/** Our link field that makes it: `CustomEntity09.sg_slate`. */
	source: string;
	/** `present`: there. `willAppear`: Set Up Fields will make it, by creating the link. */
	status: 'present' | 'willAppear';
};

const siteOf = (options: FptOptions) => options.site.replace(/\/+$/, '');

/** Linked types outside our scopes: a link field of ours adds a field on each (findings/142). */
const OTHERS = ['Attachment', SHOT];

async function inspect(api: Api, naming: Naming, signal?: AbortSignal): Promise<{ entities: EntityResolution[]; plans: FieldPlan[] }> {
	const listed = await api.types(signal);
	const entities = resolveEntities(listed, naming);
	const types = foundTypes(entities);
	const fields: Partial<Record<EntityScope, RawFields>> = {};
	const others: Record<string, RawFields> = {};
	let version: RawFields | undefined;
	let note: RawFields | undefined;
	let project: RawFields | undefined;
	// The fields of a type that is not in /schema are a 404 (corpus findings/008): only the found ones are read.
	// Attachment's and Shot's too: the photos field and the Shots field add one there each, checked
	// for a clash (findings/134, 142). Version's: a take's videos go there, under our client UUID
	// (versions.ts).
	await Promise.all([
		...ENTITY_SCOPES.filter((scope) => types[scope]).map(async (scope) => {
			fields[scope] = await api.fields(types[scope]!, signal);
		}),
		...OTHERS.filter((type) => listed[type]).map(async (type) => {
			others[type] = await api.fields(type, signal);
		}),
		...(listed[VERSION]
			? [
					api.fields(VERSION, signal).then((f) => {
						version = f;
					})
				]
			: []),
		// Note's: the Notes on Shots keep their key and what they list there (#97).
		...(listed[NOTE]
			? [
					api.fields(NOTE, signal).then((f) => {
						note = f;
					})
				]
			: []),
		// Project's: the shared lists, the templates and the kinds of set reference, are kept there (#110).
		...(listed[PROJECT]
			? [
					api.fields(PROJECT, signal).then((f) => {
						project = f;
					})
				]
			: [])
	]);
	const names = Object.fromEntries(Object.entries(listed).map(([type, t]) => [type, t.name.value]));
	return { entities, plans: planFields(types, fields, { names, others, version, note, project }, naming) };
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
 * refusal it stops creating and marks every field left `needsAdmin`. A link field whose added
 * field would clash with one already there is `blocked`, never created. No field is ever
 * deleted or changed: deleting a field a link added deletes the link too (findings/142). Every
 * entity and field is looked for, and made, under the names of `naming` (#111).
 *
 * Throws a `TransportError` when the site cannot be asked: `unreachable`, `unauthorized`, `failed`.
 */
export async function checkSetup(
	options: FptOptions & {
		createFields?: boolean;
		signal?: AbortSignal;
		/** The Flow PT project the device is linked to, and the item's URL (actionMenu.ts): the Action Menu Item is looked for, and made with `createFields`. */
		actionMenu?: { projectId: number; url: string };
	}
): Promise<SetupReport> {
	const api = createApi(options);
	const site = siteOf(options);
	const { signal } = options;
	const naming = options.naming ?? DEFAULT_NAMING;
	const { entities, plans } = await inspect(api, naming, signal);

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
		else if (allowed === false) fields.push(reportOf(plan, 'needsAdmin', ''));
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
				// An Artist gets 500 code 105 "User doesn't have permission to create a Field"
				// (findings/132). Matched exactly, with the looser words as a fallback for the
				// groups not measured (Manager, Vendor). Then nothing more is tried: an Admin runs
				// Set Up Fields, and the report says no more than that.
				if (isFieldCreateRefusal(error.failure) || isPermissionRefusal(error.failure)) {
					allowed = false;
					fields.push(reportOf(plan, 'needsAdmin', ''));
				} else fields.push(reportOf(plan, 'failed', error.failure.title));
			}
		}
		settled.push(plan);
	}

	const resolution = toResolution(site, entities, settled, naming);
	if (resolution) await options.schemaCache.set(resolutionKey(site), serializeResolution(resolution));
	else await options.schemaCache.delete(resolutionKey(site));
	const action = options.actionMenu ? await actionMenu(api, entities, options.actionMenu, options.createFields !== false, signal) : undefined;
	return {
		ready: resolution !== undefined,
		site,
		entities,
		fields,
		reverseFields: reversesOf(settled, fields),
		...(allowed !== undefined ? { canCreateFields: allowed } : {}),
		...(action ? { action } : {})
	};
}

/**
 * The Action Menu Item on Shot, and on Set Shot when its slot is found (#106): looked for by title
 * and URL, made or given the project with `create`. It decides nothing about readiness and never
 * throws: the fields are made by then, and a refusal or no answer is said on its line.
 */
async function actionMenu(api: Api, entities: EntityResolution[], at: { projectId: number; url: string }, create: boolean, signal?: AbortSignal): Promise<NonNullable<SetupReport['action']>> {
	const title = t('sync.action.title');
	const setShot = entities.find((e) => e.scope === 'setShot' && e.status === 'found')?.entityType;
	const entityTypes = [SHOT, ...(setShot ? [setShot] : [])];
	const reasonOf = (error: unknown) => (error instanceof ApiRefusal ? error.failure.title : error instanceof TransportError ? error.message || error.kind : String(error));
	let rows;
	try {
		rows = actionMenuRowsOf(await api.searchAll(ACTION_MENU_ITEM, actionMenuFilter(title, at.url), ACTION_FIELDS, signal));
	} catch (error) {
		return { title, url: at.url, items: entityTypes.map((entityType) => ({ entityType, status: 'failed', reason: reasonOf(error) })) };
	}
	const items: ActionReport[] = [];
	let denied = false;
	for (const step of actionMenuPlan({ entityTypes, projectId: at.projectId, title, url: at.url, rows })) {
		const { entityType } = step;
		if (step.kind === 'present') items.push({ entityType, status: 'present' });
		else if (!create) items.push({ entityType, status: 'missing' });
		else if (denied) items.push({ entityType, status: 'needsAdmin' });
		else {
			try {
				if (step.kind === 'create') await api.create(ACTION_MENU_ITEM, actionMenuData(entityType, at.projectId, title, at.url), signal);
				else await api.update(ACTION_MENU_ITEM, step.id, addProjectData(at.projectId), signal);
				items.push({ entityType, status: 'added' });
			} catch (error) {
				// An Artist: 400 code 104 "cannot be created by this user" (findings/156). The next would fare the same.
				if (error instanceof ApiRefusal && isPermissionRefusal(error.failure)) {
					denied = true;
					items.push({ entityType, status: 'needsAdmin' });
				} else items.push({ entityType, status: 'failed', reason: reasonOf(error) });
			}
		}
	}
	return { title, url: at.url, items };
}

/** The added fields: those there, and those the links still to create will add. */
function reversesOf(plans: readonly FieldPlan[], fields: readonly FieldReport[]): ReverseReport[] {
	const out: ReverseReport[] = [];
	for (const plan of plans) {
		if (!plan.reverse) continue;
		const made = fields.find((f) => f.entityType === plan.entityType && f.name === plan.name)?.status;
		if (made === 'failed' || made === 'blocked') continue;
		const status = plan.status === 'present' && made !== 'needsAdmin' && made !== 'missing' ? 'present' : 'willAppear';
		out.push({ ...plan.reverse, source: `${plan.entityType}.${plan.name}`, status });
	}
	return out;
}

/** What stands between the site and a sync, in a line. */
function missing(entities: EntityResolution[], plans: FieldPlan[]): string {
	const names = [
		// An optional entity and its fields stop nothing (Kevin, #117).
		...entities.filter((e) => e.status !== 'found' && !e.optional).map((e) => `the ${e.displayName} entity`),
		...(plans.some((p) => p.scope === 'version') ? [] : [`the ${VERSION} entity`]),
		// The Note fields stop nothing either: the Notes on Shots wait for them (#97). Nor do the
		// Project fields: the shared lists wait for them (#110).
		...plans.filter((p) => p.status !== 'present' && p.scope !== 'note' && p.scope !== 'project' && (p.scope === 'version' || !isOptionalColumn(p.scope, p.column))).map((p) => `${p.entityType}.${p.name}`)
	];
	const shown = names.slice(0, 5).join(', ');
	return names.length > 5 ? `${shown} and ${names.length - 5} more` : shown;
}

/**
 * The site's schema as the transport needs it: from the cache, or read from the site. It never
 * creates anything: that is `checkSetup`, which the app runs after sign-in. A site that is not
 * ready throws `failed` and names what is missing.
 *
 * With `naming`, one kept under other names is read again under those (#111). Without, one kept is
 * used whatever its names, and one read is read under the default names.
 */
export async function loadResolution(api: Api, options: FptOptions, signal?: AbortSignal): Promise<Resolution> {
	const site = siteOf(options);
	const cached = parseResolution(await options.schemaCache.get(resolutionKey(site)), site, options.naming);
	if (cached) return cached;
	const naming = options.naming ?? DEFAULT_NAMING;
	const { entities, plans } = await inspect(api, naming, signal);
	const resolution = toResolution(site, entities, plans, naming);
	if (!resolution) throw new TransportError('failed', `Flow Production Tracking is not set up for SG OnSet. Missing: ${missing(entities, plans)}.`);
	await options.schemaCache.set(resolutionKey(site), serializeResolution(resolution));
	return resolution;
}

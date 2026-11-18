// The setup check: is this site ready for the app, and if not, exactly what is missing. The UI
// calls it after sign-in and shows the report. It reads the schema, creates the fields it may,
// and keeps the result on the device for the transport. No UI here: the report is data.

import { TransportError } from '$lib/outbox/transport';
import { t } from '$lib/i18n/messages';
import { ACTION_FIELDS, ACTION_MENU_ITEM, actionMenuData, actionMenuFilter, actionMenuPlan, actionMenuRowsOf, addProjectData } from './actionMenu';
import { ApiRefusal, createApi, type Api, type FptOptions } from './api';
import { resolutionKey } from './cache';
import { isFieldCreateRefusal, isPermissionRefusal } from './errors';
import { ENTITY_SCOPES, isOptionalColumn, isRecordScope, PROJECT_NAMING, UUID, type FptDataType } from './mapping';
import { DEFAULT_NAMING, readNaming, sameNaming, writeNaming, type Naming } from './naming';
import { SHOT } from './shots';
import {
	createInput,
	foundTypes,
	isCustomEntityType,
	NOTE,
	OTHER_TYPES,
	parseResolution,
	PROJECT,
	planSite,
	resolveEntities,
	serializeResolution,
	toResolution,
	type EntityResolution,
	type FieldPlan,
	type PlanScope,
	type RawFields,
	type Resolution,
	type SchemaTypes,
	type SiteSchema
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
	/**
	 * The names the check went by (#111) and what the project keeps of them. Absent when no project
	 * was given. `unreadable`: saved by a later version; nothing was planned (decision 82).
	 */
	naming?: { saved: ProjectNaming['saved']; naming: Naming };
};

/**
 * What a Flow PT project keeps of the names (#111), in `Project.sg_onset_naming`:
 * - `none`: no field, or an empty one: the default names.
 * - `saved`: names an admin saved.
 * - `unreadable`: text this version cannot read, from a later version. Never guessed at, never written over.
 */
export type ProjectNaming = { saved: 'none' | 'saved' | 'unreadable'; naming: Naming };

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

/** What was read before the site: the type list and Project's fields, read for the project's names. */
type Known = { listed?: SchemaTypes; project?: RawFields };

/**
 * Reads what Set Up Fields plans from (`planSite`): the type list, then at once the fields of the
 * types found under the naming, of Attachment and Shot, Version, Note and Project. The fields of a
 * type not in /schema are a 404 (corpus findings/008): only the listed ones are read. Attachment's
 * and Shot's because the photos field and the Shots field add one there each, checked for a clash
 * (findings/134, 142); Version's for a take's videos (versions.ts); Note's for the Notes on Shots
 * (#97); Project's for the shared lists (#110) and the names (#111). `allCustoms`: the fields of
 * every custom entity too, for the review of the names, which may look for any of them.
 */
export async function readSite(api: Api, naming: Naming, signal?: AbortSignal, known: Known & { allCustoms?: boolean } = {}): Promise<SiteSchema> {
	const listed = known.listed ?? (await api.types(signal));
	const types = foundTypes(resolveEntities(listed, naming));
	const wanted = [
		...ENTITY_SCOPES.flatMap((scope) => (types[scope] ? [types[scope]!] : [])),
		...OTHER_TYPES.filter((type) => listed[type]),
		...[VERSION, NOTE, PROJECT].filter((type) => listed[type] && !(type === PROJECT && known.project)),
		...(known.allCustoms ? Object.keys(listed).filter(isCustomEntityType).sort() : [])
	];
	const fields: Record<string, RawFields> = known.project ? { [PROJECT]: known.project } : {};
	await Promise.all(
		[...new Set(wanted)].map(async (type) => {
			fields[type] = await api.fields(type, signal);
		})
	);
	return { types: listed, fields };
}

async function inspect(api: Api, naming: Naming, signal?: AbortSignal, known: Known = {}): Promise<{ entities: EntityResolution[]; plans: FieldPlan[] }> {
	return planSite(await readSite(api, naming, signal, known), naming);
}

/**
 * The names a project keeps (#111), from Project's fields as read. No `sg_onset_naming`: the
 * default names, and nothing more is asked. Else one read of its value, named: a Project read
 * without fields carries every field (corpus findings/158). Not visible to the person: the default.
 */
export async function readProjectNaming(api: Api, projectId: number, projectFields: RawFields | undefined, signal?: AbortSignal): Promise<ProjectNaming> {
	if (!projectFields?.[PROJECT_NAMING.name]) return { saved: 'none', naming: DEFAULT_NAMING };
	const [row] = await api.search(PROJECT, ['id', 'is', projectId], [PROJECT_NAMING.name], 1, signal);
	const raw = row?.attributes[PROJECT_NAMING.name];
	const read = readNaming(raw);
	if (!read.ok) return { saved: 'unreadable', naming: DEFAULT_NAMING };
	return { saved: raw ? 'saved' : 'none', naming: read.naming };
}

/** The names a project keeps, Project's fields unread: the field alone (404 when the site has none, findings/157), then its value. */
export async function currentNaming(api: Api, projectId: number, signal?: AbortSignal): Promise<ProjectNaming> {
	const field = await api.field(PROJECT, PROJECT_NAMING.name, undefined, signal);
	return readProjectNaming(api, projectId, field ? { [PROJECT_NAMING.name]: field } : undefined, signal);
}

/**
 * The names a check goes by: those asked for, else the project's (#111), else the default. Reading
 * the project's first reads the type list and Project's fields, which the check then uses.
 */
async function namesOf(api: Api, options: FptOptions, signal?: AbortSignal): Promise<{ known: Known; named?: ProjectNaming; naming: Naming }> {
	if (options.naming || options.projectId === undefined) return { known: {}, naming: options.naming ?? DEFAULT_NAMING };
	const listed = await api.types(signal);
	const project = listed[PROJECT] ? await api.fields(PROJECT, signal) : undefined;
	const named = await readProjectNaming(api, options.projectId, project, signal);
	return { known: { listed, ...(project ? { project } : {}) }, named, naming: named.naming };
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
 * entity and field is looked for, and made, under the names of `naming`, else those the project
 * keeps (`projectId`), else the default (#111). Names saved by a later version stop it: nothing is
 * planned or made, and the report says so.
 *
 * Throws a `TransportError` when the site cannot be asked: `unreachable`, `unauthorized`, `failed`.
 */
export async function checkSetup(options: CheckOptions): Promise<SetupReport> {
	const { report, resolution } = await runSetup(options);
	const site = siteOf(options);
	if (resolution) await options.schemaCache.set(resolutionKey(site), serializeResolution(resolution));
	else await options.schemaCache.delete(resolutionKey(site));
	return report;
}

type CheckOptions = FptOptions & {
	createFields?: boolean;
	signal?: AbortSignal;
	/** The Flow PT project the device is linked to, and the item's URL (actionMenu.ts): the Action Menu Item is looked for, and made with `createFields`. */
	actionMenu?: { projectId: number; url: string };
};

/** `checkSetup`, keeping nothing on the device: the report, and the resolution to keep. */
async function runSetup(options: CheckOptions): Promise<{ report: SetupReport; resolution?: Resolution }> {
	const api = createApi(options);
	const site = siteOf(options);
	const { signal } = options;
	const { known, named, naming } = await namesOf(api, options, signal);
	const said = named ? { naming: { saved: named.saved, naming } } : {};
	if (named?.saved === 'unreadable') return { report: { ready: false, site, entities: [], fields: [], reverseFields: [], ...said } };
	const { entities, plans } = await inspect(api, naming, signal, known);

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
	const action = options.actionMenu ? await actionMenu(api, entities, options.actionMenu, options.createFields !== false, signal) : undefined;
	const report: SetupReport = {
		ready: resolution !== undefined,
		site,
		entities,
		fields,
		reverseFields: reversesOf(settled, fields),
		...(allowed !== undefined ? { canCreateFields: allowed } : {}),
		...(action ? { action } : {}),
		...said
	};
	return { report, ...(resolution ? { resolution } : {}) };
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
 * used whatever its names, and one read is read under the project's names (`projectId`), else the
 * default names. Names saved by a later version throw `failed` (decision 82).
 */
export async function loadResolution(api: Api, options: FptOptions, signal?: AbortSignal): Promise<Resolution> {
	const site = siteOf(options);
	const cached = parseResolution(await options.schemaCache.get(resolutionKey(site)), site, options.naming);
	if (cached) return cached;
	const { known, named, naming } = await namesOf(api, options, signal);
	if (named?.saved === 'unreadable') throw new TransportError('failed', t('sync.names.unreadable'));
	const { entities, plans } = await inspect(api, naming, signal, known);
	const resolution = toResolution(site, entities, plans, naming);
	if (!resolution) throw new TransportError('failed', `Flow Production Tracking is not set up for SG OnSet. Missing: ${missing(entities, plans)}.`);
	await options.schemaCache.set(resolutionKey(site), serializeResolution(resolution));
	return resolution;
}

// ---------------------------------------------------------------------------- the names (#111)

/**
 * Whether the project has synced: Flow PT holds a record of it that SG OnSet wrote, one with our
 * client UUID (`is_not` null matches the rows that hold a value, corpus field_types/text.md). One
 * search of a row per entity, the gear first, until one is found. Kevin, #111: once synced, the
 * names in use stay as they are.
 */
export async function projectSynced(api: Api, entities: readonly EntityResolution[], plans: readonly FieldPlan[], projectId: number, signal?: AbortSignal): Promise<boolean> {
	const order = ['shootDay', 'camera', 'lens', 'lightingSetup', 'cameraSetup', 'slate', 'take', 'reference'] as const;
	for (const scope of order) {
		if (!isRecordScope(scope)) continue;
		const type = entities.find((e) => e.scope === scope && e.status === 'found')?.entityType;
		const uuid = plans.find((p) => p.scope === scope && p.column.name === UUID.name && p.status === 'present')?.name;
		if (!type || !uuid) continue;
		const conditions = [['project', 'is', { type: PROJECT, id: projectId }], [uuid, 'is_not', null]] as [string, string, unknown][];
		if ((await api.search(type, { logical_operator: 'and', conditions }, ['id'], 1, signal)).length) return true;
	}
	return false;
}

/**
 * What the review of the names needs (#111): the site read once, every custom entity's fields
 * included, so it is planned under any names with no second read; what the project keeps; whether
 * it has synced, under the names it keeps; whether the person may save (findings/159: `editable` per
 * caller predicted every answer). `canSave` is undefined while the field is not there: whether its
 * create and write are allowed is known only by trying.
 */
export type NamesReview = { site: SiteSchema; named: ProjectNaming; synced: boolean; canSave?: boolean };

export async function readNamesReview(options: FptOptions & { projectId: number; signal?: AbortSignal }): Promise<NamesReview> {
	const api = createApi(options);
	const { signal, projectId } = options;
	const listed = await api.types(signal);
	const project = listed[PROJECT] ? await api.fields(PROJECT, signal) : undefined;
	const named = await readProjectNaming(api, projectId, project, signal);
	const site = await readSite(api, named.naming, signal, { listed, ...(project ? { project } : {}), allCustoms: true });
	const { entities, plans } = planSite(site, named.naming);
	const synced = await projectSynced(api, entities, plans, projectId, signal);
	const field = project?.[PROJECT_NAMING.name] ? await api.field(PROJECT, PROJECT_NAMING.name, projectId, signal) : undefined;
	return { site, named, synced, ...(field ? { canSave: field.editable?.value !== false } : {}) };
}

/**
 * What saving the names came to:
 * - `saved`: kept on the project; the fields made under them.
 * - `unchanged`: the project keeps them already; Set Up Fields ran as before.
 * - `notReady`: not kept. The site is not ready under them and was under the names it keeps:
 *   another device would stop syncing. The fields made stay, unused.
 * - `needsAdmin`: this account may not make the field or write it (findings/157, 159).
 * - `unreadable`: the project keeps names of a later version: never written over.
 * - `failed`: the site refused, or another device saved names at the same moment. `reason` says.
 */
export type NamesOutcome = 'saved' | 'unchanged' | 'notReady' | 'needsAdmin' | 'unreadable' | 'failed';

/**
 * Set Up Fields under names an admin picked (#111): makes `Project.sg_onset_naming` if the site has
 * none, makes the fields under the names, then keeps the names on the project, so every device of
 * it reads them. The names are kept unless the site is not ready under them while it was under the
 * names the project keeps: no device then goes from syncing to stopped (decision 83). The schema on
 * this device follows what the project keeps. The write is read back and its parsed value compared
 * (findings/158).
 */
export async function setUpNames(options: CheckOptions & { projectId: number; naming: Naming }): Promise<{ report: SetupReport; names: NamesOutcome; reason?: string }> {
	const api = createApi(options);
	const { signal, projectId, naming } = options;
	const kept = (report: SetupReport, names: NamesOutcome, reason?: string) => ({ report, names, ...(reason ? { reason } : {}) });
	const { naming: _asked, ...byProject } = options;
	const listed = await api.types(signal);
	const project = listed[PROJECT] ? await api.fields(PROJECT, signal) : undefined;
	const named = await readProjectNaming(api, projectId, project, signal);
	if (named.saved === 'unreadable') return kept(await checkSetup({ ...byProject, createFields: false }), 'unreadable');
	if (sameNaming(named.naming, naming)) return kept(await checkSetup({ ...byProject, createFields: true }), 'unchanged');

	const before = planSite(await readSite(api, named.naming, signal, { listed, ...(project ? { project } : {}) }), named.naming);
	const readyBefore = toResolution(siteOf(options), before.entities, before.plans, named.naming) !== undefined;

	// The field of the names: this account must be able to write it, or to make it (findings/157, 159).
	const field = project?.[PROJECT_NAMING.name] ? await api.field(PROJECT, PROJECT_NAMING.name, projectId, signal) : undefined;
	if (field?.editable?.value === false) return kept(await checkSetup({ ...byProject, createFields: false }), 'needsAdmin');
	if (!project?.[PROJECT_NAMING.name]) {
		const plan: FieldPlan = { scope: 'project', entityType: PROJECT, column: PROJECT_NAMING, name: PROJECT_NAMING.name, displayName: PROJECT_NAMING.display, dataType: 'text', status: 'create' };
		try {
			const made = await api.createField(PROJECT, createInput(plan), signal);
			if (made !== PROJECT_NAMING.name) return kept(await checkSetup({ ...byProject, createFields: false }), 'failed', `the site created ${PROJECT}.${made} instead of ${PROJECT_NAMING.name}: an admin deletes it and empties the field trash`);
		} catch (error) {
			if (!(error instanceof ApiRefusal)) throw error;
			const denied = isFieldCreateRefusal(error.failure) || isPermissionRefusal(error.failure);
			return kept(await checkSetup({ ...byProject, createFields: false }), denied ? 'needsAdmin' : 'failed', denied ? undefined : error.failure.title);
		}
	}

	const run = await runSetup({ ...options, createFields: true });
	if (!run.report.ready && readyBefore) {
		// The schema on this device stays under the names the project keeps.
		await checkSetup({ ...byProject, createFields: false });
		return kept(run.report, 'notReady');
	}
	try {
		await api.update(PROJECT, projectId, { [PROJECT_NAMING.name]: writeNaming(naming) }, signal);
	} catch (error) {
		if (!(error instanceof ApiRefusal)) throw error;
		await checkSetup({ ...byProject, createFields: false });
		return isPermissionRefusal(error.failure) ? kept(run.report, 'needsAdmin') : kept(run.report, 'failed', error.failure.title);
	}
	const now = await readProjectNaming(api, projectId, { [PROJECT_NAMING.name]: field ?? { name: { value: PROJECT_NAMING.display }, data_type: { value: 'text' } } }, signal);
	if (now.saved === 'unreadable' || !sameNaming(now.naming, naming)) {
		await checkSetup({ ...byProject, createFields: false });
		return kept(run.report, 'failed', t('sync.names.raced'));
	}
	const cache = resolutionKey(siteOf(options));
	if (run.resolution) await options.schemaCache.set(cache, serializeResolution(run.resolution));
	else await options.schemaCache.delete(cache);
	return kept({ ...run.report, naming: { saved: 'saved', naming } }, 'saved');
}

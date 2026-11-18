// The review of the names an admin picks (#111), as the sync sheet shows it: each custom entity and
// each field the app wants, with what the site has under the names on the page, what stays as it
// is once the project has synced (Kevin, #111), and what stops a save. The site is read once
// (lib/fpt/setup.ts, `readNamesReview`) and planned here under every draft. Pure.

import { wantedFields, type Column, type EntityScope, type FieldPlace } from '$lib/fpt/mapping';
import {
	askedName,
	CUSTOM_SCOPES,
	entityName,
	fieldChoice,
	fieldKey,
	namingProblems,
	withEntity,
	withField,
	type CustomScope,
	type FieldChoice,
	type Naming,
	type NamingProblem
} from '$lib/fpt/naming';
import { fieldOptions, foundTypes, isCustomEntityType, planSite, toResolution, type FieldPlan } from '$lib/fpt/schema';
import type { FieldReport, NamesReview, ReverseReport, SetupReport } from '$lib/fpt/setup';
import { isOptionalScope } from '$lib/fpt/mapping';
import { t } from '$lib/i18n/messages';

export interface EntityRow {
	scope: CustomScope;
	/** The app's own name: "Take". */
	defaultName: string;
	/** The name on the page. */
	name: string;
	/** Under the name on the page. */
	status: 'found' | 'missing' | 'ambiguous';
	entityType?: string;
	candidates?: string[];
	/** The site syncs without it (Kevin, #117). */
	optional: boolean;
	/** Found under the names the project keeps, and the project has synced: it stays as it is. */
	locked: boolean;
	/** The name on the page is not the one the project keeps. */
	changed: boolean;
}

export interface FieldRow {
	/** `take.sg_focal_length`. */
	key: string;
	place: FieldPlace;
	column: Column;
	/** `keep`: the app's own name. `rename`: another display name. `field`: a field of the site. */
	choice: 'keep' | 'rename' | 'field';
	/** The display name asked for: the app's own, or the one typed. A field of the site: its own. */
	display: string;
	/** For `field`: the field of the site. */
	field?: string;
	/** The name on the site it has or would get. */
	name: string;
	/** What the site shows it as, or would. */
	shown: string;
	/**
	 * - `present`: there. `create`: Set Up Fields makes it. `blocked`: it cannot be used, `reason` says why.
	 * - `waiting`: its entity is not on the site under the name on the page.
	 */
	status: 'present' | 'create' | 'blocked' | 'waiting';
	reason?: string;
	/** There under the names the project keeps, and the project has synced: it stays as it is. */
	locked: boolean;
	changed: boolean;
	/** The fields of the site it may use: of its type, not asked for by another field. */
	options: { name: string; displayName: string }[];
}

export interface FieldGroup {
	place: FieldPlace;
	/** The entity's name on the page: "Shot Take", or Version, Note, Project. */
	entity: string;
	fields: FieldRow[];
}

export interface NamesView {
	/** The project has synced: what is in use stays as it is. */
	synced: boolean;
	/** Nothing can be saved: this account may not, or the project keeps names of a later version. */
	readOnly: boolean;
	unreadable: boolean;
	entities: EntityRow[];
	groups: FieldGroup[];
	/** The display names of the site's custom entities, to pick one from. */
	siteEntities: string[];
	problems: NamingProblem[];
	/** Entities and fields whose name on the page differs from the one the project keeps. */
	changes: number;
	/** The site is ready under the names on the page. */
	ready: boolean;
	/** Changes to review, none of them a problem, and an account that may save. */
	canReview: boolean;
}

const PLACE_NAMES: Partial<Record<FieldPlace, string>> = { version: 'Version', note: 'Note', project: 'Project' };

/** The entity a field place is on, under the names on the page. */
function placeName(draft: Naming, place: FieldPlace): string {
	return PLACE_NAMES[place] ?? entityName(draft, place as EntityScope);
}

const sameChoice = (a: FieldChoice, b: FieldChoice) => JSON.stringify(a) === JSON.stringify(b);

const planOf = (plans: readonly FieldPlan[], place: FieldPlace, column: Column) => plans.find((p) => p.scope === place && p.column.name === column.name);

export function namesView(review: NamesReview, draft: Naming): NamesView {
	const saved = review.named.naming;
	const before = planSite(review.site, saved);
	const after = planSite(review.site, draft);
	const types = foundTypes(after.entities);
	const unreadable = review.named.saved === 'unreadable';
	const typeOfPlace = (place: FieldPlace): string | undefined => (place === 'version' ? 'Version' : place === 'note' ? 'Note' : place === 'project' ? 'Project' : types[place as EntityScope]);

	const entities: EntityRow[] = CUSTOM_SCOPES.map((scope) => {
		const now = after.entities.find((e) => e.scope === scope)!;
		const was = before.entities.find((e) => e.scope === scope)!;
		return {
			scope,
			defaultName: entityName({}, scope),
			name: entityName(draft, scope),
			status: now.status,
			...(now.entityType ? { entityType: now.entityType } : {}),
			...(now.candidates ? { candidates: now.candidates } : {}),
			optional: isOptionalScope(scope),
			locked: review.synced && was.status === 'found',
			changed: draft.entities?.[scope] !== saved.entities?.[scope]
		};
	});

	const groups: FieldGroup[] = [];
	for (const { place, column } of wantedFields()) {
		const choice = fieldChoice(draft, place, column);
		const plan = planOf(after.plans, place, column);
		const type = typeOfPlace(place);
		const have = type ? review.site.fields[type] : undefined;
		// The names the other fields of the entity ask for: not offered here.
		// Its own default field too: that is Keep.
		const taken = new Set([column.name, ...wantedFields().filter((w) => w.place === place && w.column.name !== column.name).map((w) => askedName(fieldChoice(draft, w.place, w.column)))]);
		const row: FieldRow = {
			key: fieldKey(place, column),
			place,
			column,
			choice: 'field' in choice ? 'field' : choice.display === column.display ? 'keep' : 'rename',
			display: 'field' in choice ? (have?.[choice.field]?.name.value ?? choice.field) : choice.display,
			...('field' in choice ? { field: choice.field } : {}),
			name: plan?.name ?? askedName(choice),
			shown: plan?.displayName ?? ('field' in choice ? choice.field : choice.display),
			status: plan ? plan.status : 'waiting',
			...(plan?.reason ? { reason: plan.reason } : {}),
			locked: review.synced && planOf(before.plans, place, column)?.status === 'present',
			changed: !sameChoice(fieldChoice(draft, place, column), fieldChoice(saved, place, column)),
			options: have && plan ? fieldOptions(column, have, types, taken) : []
		};
		const group = groups.find((g) => g.place === place);
		if (group) group.fields.push(row);
		else groups.push({ place, entity: placeName(draft, place), fields: [row] });
	}

	const problems = namingProblems(draft);
	const changes = entities.filter((e) => e.changed).length + groups.reduce((n, g) => n + g.fields.filter((f) => f.changed).length, 0);
	const readOnly = unreadable || review.canSave === false;
	return {
		synced: review.synced,
		readOnly,
		unreadable,
		entities,
		groups,
		siteEntities: Object.entries(review.site.types)
			.filter(([type]) => isCustomEntityType(type))
			.map(([, v]) => v.name.value.trim())
			.sort((a, b) => a.localeCompare(b)),
		problems,
		changes,
		ready: toResolution('', after.entities, after.plans, draft) !== undefined,
		canReview: !readOnly && changes > 0 && problems.length === 0
	};
}

/** The fields an admin may name now: every one, less those in use once the project has synced. */
export function editableFields(view: NamesView): { place: FieldPlace; column: Column }[] {
	return view.groups.flatMap((g) => g.fields.filter((f) => !f.locked).map((f) => ({ place: f.place, column: f.column })));
}

/**
 * The names of a file, on the page. Once the project has synced, what is in use keeps the name the
 * project keeps (Kevin, #111): `kept` counts the names of the file left aside for it.
 */
export function importNames(view: NamesView, draft: Naming, imported: Naming): { naming: Naming; kept: number } {
	let naming: Naming = imported;
	let kept = 0;
	for (const e of view.entities) {
		if (!e.locked) continue;
		const keep = entityName(draft, e.scope);
		if (entityName(imported, e.scope) !== keep) kept++;
		naming = withEntity(naming, e.scope, keep);
	}
	for (const f of view.groups.flatMap((g) => g.fields)) {
		if (!f.locked) continue;
		const keep = fieldChoice(draft, f.place, f.column);
		if (!sameChoice(keep, fieldChoice(imported, f.place, f.column))) kept++;
		naming = withField(naming, f.place, f.column, keep);
	}
	return { naming, kept };
}

/** Each problem in a line. */
export function problemLines(view: NamesView, draft: Naming = {}): string[] {
	const label = (key: string) => {
		const row = view.groups.flatMap((g) => g.fields).find((f) => f.key === key);
		return row ? t('sync.names.problem.field', { entity: view.groups.find((g) => g.place === row.place)!.entity, field: row.column.display }) : key;
	};
	return view.problems.map((p) => {
		if (p.kind === 'display') return t('sync.names.problem.display', { field: label(p.key) });
		if (p.kind === 'entities') return t('sync.names.problem.entities', { name: entityName(draft, p.scopes[0]) });
		return t('sync.names.problem.fields', { entity: view.groups.find((g) => g.place === p.place)?.entity ?? p.place, name: p.name });
	});
}

/**
 * The setup report under the names on the page: what Set Up Fields would find and make, for the
 * review before it runs. Planned from the site as read; nothing is asked of Flow PT.
 */
export function draftReport(review: NamesReview, site: string, draft: Naming): SetupReport {
	const { entities, plans } = planSite(review.site, draft);
	const fields: FieldReport[] = plans.map((p) => ({
		scope: p.scope,
		entityType: p.entityType,
		name: p.name,
		displayName: p.displayName,
		dataType: p.dataType,
		status: p.status === 'create' ? 'missing' : p.status,
		...(p.reason ? { reason: p.reason } : {}),
		...(p.unique ? { unique: true as const } : {}),
		...(p.validTypes ? { validTypes: p.validTypes } : {})
	}));
	const reverseFields: ReverseReport[] = plans.flatMap((p) =>
		p.reverse && p.status !== 'blocked' ? [{ ...p.reverse, source: `${p.entityType}.${p.name}`, status: p.status === 'present' ? ('present' as const) : ('willAppear' as const) }] : []
	);
	return { ready: toResolution(site, entities, plans, draft) !== undefined, site, entities, fields, reverseFields, naming: { saved: review.named.saved, naming: draft } };
}

/** What the names on the page change, entities first: for the review before Set Up Fields. */
export function changeLines(view: NamesView): { title: string; detail: string }[] {
	return [
		...view.entities.filter((e) => e.changed).map((e) => ({ title: e.defaultName, detail: e.name })),
		...view.groups.flatMap((g) => g.fields.filter((f) => f.changed).map((f) => ({ title: `${g.entity}, ${f.column.display}`, detail: f.choice === 'field' ? f.display : f.shown })))
	];
}

/** The file the names of a project are exported to. */
export function namesFileName(project: string): string {
	const slug = project
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return slug ? `sg-onset-names-${slug}.json` : 'sg-onset-names.json';
}

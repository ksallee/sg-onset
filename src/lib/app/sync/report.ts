// The setup report of `checkSetup` (lib/fpt/setup.ts), as the sync sheet shows it: what was found,
// what an admin must do and with which exact name, which fields are there, made, or wait for an
// admin. Pure.

import type { FieldReport, ReverseReport, SetupReport } from '$lib/fpt';
import type { EntityScope } from '$lib/fpt';

/**
 * - `found`: there.
 * - `enable`: an admin enables a custom entity for projects and names it `displayName`. The app
 *   finds it by that name, never by slot number.
 * - `switchOn`: an admin switches the built-in entity on.
 * - `keepOne`: more than one custom entity has the name; `candidates` lists them.
 */
export type EntityAction = 'found' | 'enable' | 'switchOn' | 'keepOne';

export interface EntityLine {
	scope: EntityScope;
	displayName: string;
	action: EntityAction;
	entityType?: string;
	candidates?: string[];
}

export interface FieldLine {
	/** The entity's name as the site shows it, or as it must be named. */
	entity: string;
	name: string;
	displayName: string;
	dataType: FieldReport['dataType'];
	reason?: string;
	unique?: true;
	validTypes?: string[];
}

export type FieldStatus = FieldReport['status'];
const STATUSES: FieldStatus[] = ['present', 'created', 'missing', 'needsAdmin', 'blocked', 'failed'];

export interface SetupView {
	ready: boolean;
	entities: EntityLine[];
	/** Entities an admin must act on. */
	entitiesToFix: number;
	counts: Record<FieldStatus, number>;
	fields: Record<FieldStatus, FieldLine[]>;
	/** The person may not create fields here. */
	permission: boolean;
	/** "Set Up Fields" would do something. */
	canSetUpFields: boolean;
	/** The fields Flow PT adds for our links: those still to come first. */
	reverse: ReverseLine[];
	/** How many will appear when Set Up Fields runs. */
	reverseToCome: number;
}

export interface ReverseLine {
	/** The linked entity's name as the site shows it. */
	entity: string;
	name: string;
	displayName: string;
	status: ReverseReport['status'];
}

function actionOf(e: SetupReport['entities'][number]): EntityAction {
	if (e.status === 'found') return 'found';
	if (e.status === 'ambiguous') return 'keepOne';
	return e.kind === 'builtin' ? 'switchOn' : 'enable';
}

export function setupView(report: SetupReport): SetupView {
	const entities: EntityLine[] = report.entities.map((e) => ({
		scope: e.scope,
		displayName: e.displayName,
		action: actionOf(e),
		...(e.entityType ? { entityType: e.entityType } : {}),
		...(e.candidates ? { candidates: e.candidates } : {})
	}));
	const nameOf = new Map(report.entities.map((e) => [e.scope, e.displayName]));
	const fields = Object.fromEntries(STATUSES.map((s) => [s, [] as FieldLine[]])) as Record<FieldStatus, FieldLine[]>;
	for (const f of report.fields) {
		fields[f.status].push({
			entity: nameOf.get(f.scope) ?? f.entityType,
			name: f.name,
			displayName: f.displayName,
			dataType: f.dataType,
			...(f.reason ? { reason: f.reason } : {}),
			...(f.unique ? { unique: true as const } : {}),
			...(f.validTypes ? { validTypes: f.validTypes } : {})
		});
	}
	const counts = Object.fromEntries(STATUSES.map((s) => [s, fields[s].length])) as Record<FieldStatus, number>;
	const typeName = new Map(report.entities.filter((e) => e.entityType).map((e) => [e.entityType!, e.displayName]));
	const reverse: ReverseLine[] = [...(report.reverseFields ?? [])]
		.sort((a, b) => Number(a.status === 'present') - Number(b.status === 'present'))
		.map((r) => ({ entity: typeName.get(r.entityType) ?? r.entityType, name: r.name, displayName: r.displayName, status: r.status }));
	return {
		ready: report.ready,
		entities,
		entitiesToFix: entities.filter((e) => e.action !== 'found').length,
		counts,
		fields,
		permission: report.canCreateFields === false || counts.needsAdmin > 0,
		canSetUpFields: counts.missing > 0 && report.canCreateFields !== false,
		reverse,
		reverseToCome: reverse.filter((r) => r.status === 'willAppear').length
	};
}

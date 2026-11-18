// Every request the app sends Flow PT, against the fake site: Set Up Fields on a bare site, a push of
// every key of every scope, the uploads, the lookups and reads, the links of slates and set
// references, the Notes on Shots, the action of #106, and the deletes. `golden.requests.json` was
// written from the code before the names became an admin's choice (#111): with the default names,
// the app must send exactly that. With every name changed, it sends the same requests under the
// names chosen, and creates no field an admin mapped to one the site has.

import { describe, expect, it } from 'vitest';
import type { BlobRef, PushOp, UploadSession } from '$lib/outbox/transport';
import type { Op, RemoteId } from '$lib/outbox/types';
import { createApi, type FptOptions } from './api';
import { memoryKeyValue } from './cache';
import { BEARER, fakeFpt, type FakeFpt } from './fakeFpt';
import { fieldMaps, wantedFields, type EntityScope } from './mapping';
import { codeName } from './names';
import { fieldChoice, fieldKey, parseNaming, type FieldChoice, type Naming } from './naming';
import { previewSend, sendSetData } from './sendSetData';
import { checkSetup, loadResolution } from './setup';
import { rawField } from './testkit';
import { createFptTransport } from './transport';

/** The record of each scope, by its id on the device. */
const IDS: Record<string, string> = { project: 'p1', shootDay: 'd1', camera: 'c1', lens: 'l1', lightingSetup: 'ls1', cameraSetup: 'cs1', slate: 's1', take: 't1', reference: 'r1' };

/** A value of every key of a scope, as the device stores it. */
export function everyKey(scope: EntityScope): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const map of fieldMaps(scope)) {
		const column = map.columns[0];
		const v = ((): unknown => {
			switch (map.kind) {
				case 'ref':
					return IDS[column.target as string];
				case 'text':
					return `${scope} ${map.key}`;
				case 'stringList':
					return map.key === 'vfxShots' ? ['SH010', 'SH020'] : ['cleanPlate', 'ballsAndChart'];
				case 'rational':
					return { num: 24000, denom: 1001 };
				case 'date':
					return '2026-11-11';
				case 'timestamp':
					return map.key.endsWith('End') || map.key === 'endedAt' ? '2026-11-11T09:00:30.000Z' : '2026-11-11T09:00:00.000Z';
				case 'integer':
					return 3;
				case 'number':
					return 2.8;
				case 'boolean':
					return true;
				case 'length':
					return { m: 1.5 };
				case 'dimensions':
					return column.dataType === 'number' ? { width: 4608, height: 3164 } : { width: 36.7, height: 25.54 };
			}
		})();
		out[map.key] = v;
	}
	if (scope === 'take') out.takeType = 'cleanPlate';
	if (scope === 'reference') out.kind = 'hdri360';
	return out;
}

/** The parts of a request a site sees, in a form a file can hold. */
export function logOf(fpt: FakeFpt): unknown[] {
	return fpt.requests.map((r) => ({
		method: r.method,
		host: r.host,
		path: r.path,
		...([...r.query.keys()].length ? { query: Object.fromEntries(r.query) } : {}),
		...(r.body !== undefined ? { body: r.body } : {})
	}));
}

let n = 0;
const op = (o: Exclude<Op, { kind: 'blob' }>, links: Record<string, RemoteId> = {}, remoteId?: RemoteId): PushOp => ({
	entryId: `e${++n}`,
	op: o,
	dependsOn: Object.keys(links),
	links,
	...(remoteId !== undefined ? { remoteId } : {})
});

/**
 * The whole run on a bare site. `extra` goes in every call's options. Answers the requests, from the
 * first schema read to the last delete.
 */
export async function goldenRun(fpt: FakeFpt, extra: Partial<FptOptions> = {}): Promise<unknown[]> {
	const projectId = fpt.seed('Project', { name: 'Show' });
	const project = { type: 'Project', id: projectId };
	const base: FptOptions = { site: fpt.site, bearer: async () => BEARER, fetch: fpt.fetch, schemaCache: memoryKeyValue(), online: () => fpt.online, now: () => fpt.clock.t, ...extra };

	// Set Up Fields, with the Action Menu Item (#106).
	const report = await checkSetup({ ...base, createFields: true, actionMenu: { projectId, url: 'https://onset.example/action/send-set-data' } });
	expect(report.ready).toBe(true);

	// Editorial made SH010 already, with a Task for an artist.
	const artist = fpt.seed('HumanUser', { name: 'Ana' });
	const shot = fpt.seed('Shot', { code: 'SH010', project });
	fpt.seed('Task', { content: 'Comp', project, entity: { type: 'Shot', id: shot }, task_assignees: [{ type: 'HumanUser', id: artist }] });

	const transport = createFptTransport({ ...base, projectId });
	const remote: Record<string, RemoteId> = {};
	const push = async (ops: PushOp[]) => {
		const result = await transport.push(ops);
		if (result.outcome !== 'applied') throw new Error(`refused: ${JSON.stringify(result.refusals)}`);
		for (const o of ops) if (result.remoteIds[o.entryId] !== undefined) remote[o.op.recordId] = result.remoteIds[o.entryId];
	};
	const linksOf = (fields: Record<string, unknown>) =>
		Object.fromEntries(Object.values(fields).flatMap((v) => (typeof v === 'string' && remote[v] !== undefined ? [[v, remote[v]]] : [])));
	const create = (scope: EntityScope | 'project' | 'still' | 'template' | 'referenceKind', id: string, fields: Record<string, unknown>) => op({ kind: 'create', table: scope, recordId: id, fields }, linksOf(fields));

	await push([create('project', 'p1', { name: 'Show' })]);
	await push(['shootDay', 'camera', 'lens', 'lightingSetup'].map((s) => create(s as EntityScope, IDS[s], everyKey(s as EntityScope))));
	await push(['cameraSetup', 'slate'].map((s) => create(s as EntityScope, IDS[s], everyKey(s as EntityScope))));
	await push(['take', 'reference'].map((s) => create(s as EntityScope, IDS[s], everyKey(s as EntityScope))));
	await push([
		create('still', 'ph1', { takeId: 't1', capturedAt: '2026-11-11T09:01:02.000Z', caption: 'Chart' }),
		create('still', 'v1', { takeId: 't1', capturedAt: '2026-11-11T09:02:00.000Z', caption: 'Witness' })
	]);

	// A photo, a video and a setup diagram, each sent as the runner sends a file.
	const send = async (ref: BlobRef) => {
		const session: UploadSession = await transport.beginUpload(ref);
		const part = await transport.uploadPart(session, { index: 0, data: new Blob([new Uint8Array(ref.size)], { type: ref.type }) });
		const done = await transport.finishUpload(session, [part]);
		expect(await transport.verifyUpload(ref, done.remoteId)).toMatchObject({ verified: true });
	};
	await send({ table: 'still', recordId: 'ph1', blobId: 'b-ph1', size: 1200, type: 'image/jpeg', recordRemoteId: remote.ph1 });
	await send({ table: 'still', recordId: 'v1', blobId: 'b-v1', size: 2400, type: 'video/quicktime', recordRemoteId: remote.v1 });
	await send({ table: 'slate', recordId: 's1', blobId: 'b-dg1', size: 900, type: 'image/png', variant: 'diagram', recordRemoteId: remote.s1 });

	// What the runner asks back.
	const scopes = Object.keys(IDS).filter((s) => s !== 'project') as EntityScope[];
	expect(await transport.lookup(scopes.map((s) => ({ table: s, id: IDS[s] })))).toHaveLength(scopes.length);
	const read = await transport.read(scopes.map((s) => ({ table: s, id: IDS[s], remoteId: remote[IDS[s]], keys: Object.keys(everyKey(s)) })));
	expect(read).toHaveLength(scopes.length);

	// Edits: a take, the slate's codes.
	await push([
		op({ kind: 'update', table: 'take', recordId: 't1', changes: { tStop: { base: 2.8, value: 4 }, circleTake: { base: true, value: false }, lensId: { base: 'l1', value: undefined } } }, {}, remote.t1),
		op({ kind: 'update', table: 'slate', recordId: 's1', changes: { vfxShots: { base: ['SH010', 'SH020'], value: ['SH010'] } } }, {}, remote.s1)
	]);

	// The lists a show shares (#110): a template and a kind of set reference, then all read back.
	await push([
		create('template', 'tp1', { projectId: 'p1', name: 'Day ext', scope: 'take', values: { tStop: 2.8 } }),
		create('referenceKind', 'k1', { projectId: 'p1', name: 'Drone scan' })
	]);
	expect(await transport.readShared()).toHaveLength(6);

	// When a drain ends: the slates, the references, the Notes.
	const shots = await transport.linkShots([{ slate: 's1', remoteId: remote.s1 as number, codes: ['SH010'] }]);
	expect(shots).toEqual([{ slate: 's1', several: [], shots: [shot] }]);
	expect(await transport.linkReferenceSlates([{ reference: 'r1', remoteId: remote.r1 as number, slates: [remote.s1 as number] }])).toEqual([]);
	expect(await transport.writeNotes([shot])).toMatchObject([{ shot, outcome: 'created' }]);

	// After wrap, from a desktop: Send set data to artists.
	const desk: FptOptions = { ...base, schemaCache: memoryKeyValue() };
	const api = createApi(desk);
	const res = await loadResolution(api, desk);
	await previewSend(api, res, projectId, { kind: 'shot', ids: [shot] });
	await sendSetData(api, res, projectId, { kind: 'shot', ids: [shot] });

	// Deletes: the photo, the reference.
	await push([op({ kind: 'delete', table: 'still', recordId: 'ph1' }, {}, remote.ph1), op({ kind: 'delete', table: 'reference', recordId: 'r1' }, {}, remote.r1)]);

	return logOf(fpt);
}

/**
 * Every field renamed "Studio …", and every custom entity. Four fields go to fields the site has:
 * names one entity alone holds, so the default log can be renamed whatever the entity.
 */
export const STUDIO: Naming = (() => {
	const fields: Record<string, FieldChoice> = Object.fromEntries(wantedFields().map(({ place, column }) => [fieldKey(place, column), { display: `Studio ${column.display}` }]));
	fields['take.sg_circled'] = { field: 'sg_circle' };
	fields['lens.sg_focal_length_long_end'] = { field: 'sg_long_end_mm' };
	fields['setShot.sg_onset_matched'] = { field: 'sg_matched' };
	fields['note.sg_onset_captured'] = { field: 'sg_note_list' };
	return { entities: { take: 'Shot Take', lens: 'Glass', cameraSetup: 'Camera Rig', lightingSetup: 'Lighting Rig', reference: 'Set Ref', setShot: 'Shot Code' }, fields };
})();

/** A bare site whose custom entities have the names STUDIO looks for, with the four fields it maps. */
export function studioSite(): FakeFpt {
	const fpt = fakeFpt({ fields: 'bare' });
	const names: Record<string, string> = { CustomEntity09: 'Shot Take', CustomEntity19: 'Glass', CustomEntity10: 'Camera Rig', CustomEntity11: 'Lighting Rig', CustomEntity21: 'Set Ref', CustomEntity22: 'Shot Code' };
	for (const [type, name] of Object.entries(names)) fpt.types[type] = { name: { value: name } };
	fpt.fields.CustomEntity09.sg_circle = rawField('checkbox', 'Circle');
	fpt.fields.CustomEntity19.sg_long_end_mm = rawField('float', 'Long End mm');
	fpt.fields.CustomEntity22.sg_matched = rawField('checkbox', 'Matched');
	fpt.fields.Note.sg_note_list = rawField('text', 'Note List');
	return fpt;
}

/**
 * The default log as the naming would have it: each field's name and display name changed, and no
 * create of a field mapped to one the site has.
 */
function renamed(log: unknown[], naming: Naming): unknown[] {
	const names = new Map<string, string>();
	const displays = new Map<string, string>();
	const mapped = new Set<string>();
	for (const { place, column } of wantedFields()) {
		const choice = fieldChoice(naming, place, column);
		const name = 'field' in choice ? choice.field : codeName(choice.display);
		// One name for every entity, or the log could not be renamed without knowing which.
		if (names.has(column.name) && names.get(column.name) !== name) throw new Error(`${column.name} is named two ways`);
		names.set(column.name, name);
		if ('field' in choice) mapped.add(column.display);
		else displays.set(column.display, choice.display);
	}
	type Logged = { method: string; path: string; body?: { properties?: { property_name: string; value: unknown }[] } };
	const displayOf = (r: Logged) => r.body?.properties?.find((p) => p.property_name === 'name')?.value as string | undefined;
	const isCreate = (r: Logged) => r.method === 'POST' && /^\/api\/v1\/schema\/[^/]+\/fields$/.test(r.path);
	const text = (s: string) =>
		s
			.split(/([.,/])/)
			.map((t) => names.get(t) ?? t)
			.join('');
	const walk = (v: unknown): unknown => {
		if (typeof v === 'string') return text(v);
		if (Array.isArray(v)) return v.map(walk);
		if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [names.get(k) ?? k, walk(x)]));
		return v;
	};
	return (log as Logged[])
		.filter((r) => !(isCreate(r) && mapped.has(displayOf(r) ?? '')))
		.map((r) => {
			if (!isCreate(r)) return walk(r);
			const body = { ...r.body, properties: r.body!.properties!.map((p) => (p.property_name === 'name' ? { ...p, value: displays.get(p.value as string) ?? p.value } : p)) };
			return walk({ ...r, body });
		});
}

/**
 * The read of the names a project keeps (#111) that a transport makes at its first call needing the
 * schema: new since the list was recorded, and asserted on its own. A site without the field
 * answers 404 (corpus findings/157).
 */
const namesRead = (r: unknown) => (r as { method: string; path: string }).method === 'GET' && (r as { path: string }).path === '/api/v1/schema/Project/fields/sg_onset_naming';

describe('the requests the app sends', () => {
	it('are the requests it sent before the names were an admin’s choice, and one read of the project’s names', async () => {
		const log = await goldenRun(fakeFpt({ fields: 'bare' }));
		expect(log.filter(namesRead)).toHaveLength(1);
		await expect(JSON.stringify(log.filter((r) => !namesRead(r)), null, 1)).toMatchFileSnapshot('./golden.requests.json');
	});

	it('are the same requests under the names an admin chose, everywhere', async () => {
		expect(parseNaming(STUDIO)).toEqual(STUDIO);
		// Names given to the transport are not read from the project: the read is left out of both.
		const plain = (await goldenRun(fakeFpt({ fields: 'bare' }))).filter((r) => !namesRead(r));
		const fpt = studioSite();
		const studio = await goldenRun(fpt, { naming: STUDIO });
		expect(studio).toEqual(renamed(plain, STUDIO));
		// No default name of ours is asked for, and the fields mapped are never created.
		const sent = JSON.stringify(studio);
		for (const name of ['sg_onset_uuid', 'sg_focal_length', 'sg_photos', 'sg_set_shots', 'sg_onset_key', 'sg_circled', 'sg_onset_captured']) expect(sent).not.toMatch(new RegExp(`\\b${name}\\b`));
		expect(fpt.fields.CustomEntity09.sg_studio_focal_length).toBeDefined();
		expect(fpt.fields.CustomEntity09.sg_focal_length).toBeUndefined();
	});
});

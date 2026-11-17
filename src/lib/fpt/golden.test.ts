// Every request the app sends Flow PT, against the fake site: Set Up Fields on a bare site, a push of
// every key of every scope, the uploads, the lookups and reads, the links of slates and set
// references, the Notes on Shots, the action of #106, and the deletes. `golden.requests.json` was
// written from the code before the names became an admin's choice (#111): with the default names,
// the app must send exactly that.

import { describe, expect, it } from 'vitest';
import type { BlobRef, PushOp, UploadSession } from '$lib/outbox/transport';
import type { Op, RemoteId } from '$lib/outbox/types';
import { createApi, type FptOptions } from './api';
import { memoryKeyValue } from './cache';
import { BEARER, fakeFpt, type FakeFpt } from './fakeFpt';
import { fieldMaps, type EntityScope } from './mapping';
import { previewSend, sendSetData } from './sendSetData';
import { checkSetup, loadResolution } from './setup';
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
	const create = (scope: EntityScope | 'project' | 'still', id: string, fields: Record<string, unknown>) => op({ kind: 'create', table: scope, recordId: id, fields }, linksOf(fields));

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

describe('the requests the app sends', () => {
	it('are the requests it sent before the names were an admin’s choice', async () => {
		const log = await goldenRun(fakeFpt({ fields: 'bare' }));
		await expect(JSON.stringify(log, null, 1)).toMatchFileSnapshot('./golden.requests.json');
	});
});

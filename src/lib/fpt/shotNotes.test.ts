// The Notes on Shots (#97) through the transport, against the fake site (corpus shapes). Everything
// the Note says is read from Flow PT: a take another device sent is in it, the device's own store
// is never asked.

import { describe, expect, it } from 'vitest';
import type { RemoteId } from '$lib/outbox/types';
import type { PushOp } from '$lib/outbox/transport';
import { memoryKeyValue } from './cache';
import { BEARER, fakeFpt, type FakeFpt } from './fakeFpt';
import { createFptTransport } from './transport';

const TAKE = 'CustomEntity09';
const REFERENCE = 'CustomEntity21';
type Ref = { type: string; id: number };

function world(options: { fields?: 'complete' | 'bare' } = {}) {
	const fpt = fakeFpt(options);
	const projectId = fpt.seed('Project', { name: 'Show' });
	const cache = memoryKeyValue();
	const make = () => createFptTransport({ site: fpt.site, bearer: async () => BEARER, fetch: fpt.fetch, schemaCache: cache, projectId, now: () => fpt.clock.t, online: () => fpt.online });
	return { fpt, projectId, make, transport: make() };
}
type World = ReturnType<typeof world>;

let n = 0;
const create = (table: string, recordId: string, fields: Record<string, unknown>, links: Record<string, RemoteId> = {}): PushOp => ({
	entryId: `e${++n}`,
	op: { kind: 'create', table, recordId, fields },
	dependsOn: Object.keys(links),
	links
});
async function sent(w: World, o: PushOp): Promise<number> {
	const result = await w.transport.push([o]);
	if (result.outcome !== 'applied') throw new Error(`refused: ${JSON.stringify(result.refusals)}`);
	return Number(result.remoteIds[o.entryId]);
}

/**
 * Two Shots; slate 42A for the first, 42B for both. Takes, one a clean plate and one with balls and
 * chart at its tail, an HDRI on 42A, a photo and its annotated copy on take 1. The first Shot's Task
 * is assigned to a person and a Group, the second's to another person.
 */
async function shoot(w: World, options: { reference?: boolean } = {}) {
	const { fpt, projectId } = w;
	const project = { type: 'Project', id: projectId };
	const a = fpt.seed('Shot', { code: 'SMP_042_0010', project });
	const b = fpt.seed('Shot', { code: 'SMP_042_0020', project });
	const person = fpt.seed('HumanUser', { name: 'Ana' });
	const other = fpt.seed('HumanUser', { name: 'Ben' });
	const group = fpt.seed('Group', { code: 'Comp' });
	const taskA = fpt.seed('Task', { content: 'Comp', project, entity: { type: 'Shot', id: a }, task_assignees: [{ type: 'HumanUser', id: person }, { type: 'Group', id: group }] });
	const taskB = fpt.seed('Task', { content: 'Comp', project, entity: { type: 'Shot', id: b }, task_assignees: [{ type: 'HumanUser', id: other }] });
	const d1 = await sent(w, create('shootDay', 'd1', { projectId: 'p1', shootDate: '2026-11-11' }, { p1: projectId }));
	const s1 = await sent(w, create('slate', 's1', { shootDayId: 'd1', slateUID: '42A', vfxShots: ['SMP_042_0010'] }, { d1 }));
	const s2 = await sent(w, create('slate', 's2', { shootDayId: 'd1', slateUID: '42B', vfxShots: ['SMP_042_0010', 'SMP_042_0020'] }, { d1 }));
	const t1 = await sent(w, create('take', 't1', { slateId: 's1', take: '1' }, { s1 }));
	await sent(w, create('take', 't2', { slateId: 's1', take: '2', takeType: 'cleanPlate' }, { s1 }));
	await sent(w, create('take', 't3', { slateId: 's2', take: '1', takeTail: ['ballsAndChart'] }, { s2 }));
	if (options.reference !== false) await sent(w, create('reference', 'r1', { slateId: 's1', kind: 'hdri360', name: 'HDRI_0412' }, { s1 }));
	// A photo and its annotated copy, as the upload leaves them on the take (stills.ts).
	const photo = fpt.seed('Attachment', { filename: 'onset_ph1_b1.jpg' });
	const copy = fpt.seed('Attachment', { filename: 'onset_ph1_b2-annotated.jpg' });
	fpt.rows.get(`${TAKE}:${t1}`)!.values.sg_photos = [
		{ type: 'Attachment', id: photo },
		{ type: 'Attachment', id: copy }
	];
	return { a, b, person, other, group, taskA, taskB, s1, s2 };
}

const notes = (fpt: FakeFpt) => fpt.live('Note');
const noteOf = (fpt: FakeFpt, shot: number) => notes(fpt).find((r) => (r.values.note_links as Ref[]).some((l) => l.id === shot))!;
const writes = (fpt: FakeFpt) => fpt.requests.filter((r) => r.method !== 'GET' && /\/entity\/(notes|replies)(\/|$)/.test(r.path) && !r.path.endsWith('_search'));

describe('writeNotes', () => {
	it('writes one Note per Shot, from whoever syncs, about the Shot, on its Tasks, to the people and Groups on them', async () => {
		const w = world();
		const s = await shoot(w);
		expect(await w.transport.writeNotes([s.b, s.a])).toEqual([
			{ shot: s.a, outcome: 'created' },
			{ shot: s.b, outcome: 'created' }
		]);
		expect(notes(w.fpt)).toHaveLength(2);
		const note = noteOf(w.fpt, s.a);
		expect(note.values).toMatchObject({
			project: { type: 'Project', id: w.projectId },
			subject: 'Set data for SMP_042_0010',
			note_links: [{ type: 'Shot', id: s.a }],
			tasks: [{ type: 'Task', id: s.taskA }],
			// A Group stays a Group: its members follow the Note (findings/147, 150).
			addressings_to: [
				{ type: 'Group', id: s.group },
				{ type: 'HumanUser', id: s.person }
			],
			sg_onset_key: `${w.projectId}:shot:${s.a}`
		});
		expect(note.values.content).toBe(
			[
				'Elements',
				'Clean plate: 42A take 2',
				'Balls and chart tail: 42B take 1',
				'',
				'Takes',
				'42A: 1, 2',
				'42B: 1',
				'',
				'References',
				'HDRI 360: HDRI_0412',
				'',
				'Photos: 1'
			].join('\n')
		);
		expect(String(note.values.sg_onset_captured).split(' ')).toContain('reference:' + w.fpt.byUuid(REFERENCE, 'r1')!.id);
		// The other Shot gets 42B only.
		expect(noteOf(w.fpt, s.b).values.content).toContain('42B: 1');
		expect(noteOf(w.fpt, s.b).values.content).not.toContain('42A');
		// One create each, not in a batch: validated, as recipes/026 makes it. No author is named.
		const creates = writes(w.fpt);
		expect(creates.map((r) => `${r.method} ${r.path}`)).toEqual(['POST /api/v1/entity/notes', 'POST /api/v1/entity/notes']);
		expect(creates.every((r) => !('user' in (r.body as object)) && !('created_by' in (r.body as object)))).toBe(true);
	});

	// Kevin, 2026-11-17: a sync with nothing new for a Shot writes nothing, new people or not.
	it('writes nothing at a later sync with nothing new, even with someone newly assigned', async () => {
		const w = world();
		const s = await shoot(w);
		await w.transport.writeNotes([s.a, s.b]);
		const before = writes(w.fpt).length;
		w.fpt.rows.get(`Task:${s.taskA}`)!.values.task_assignees = [{ type: 'HumanUser', id: s.person }, { type: 'HumanUser', id: s.other }];
		expect(await w.make().writeNotes([s.a, s.b])).toEqual([
			{ shot: s.a, outcome: 'unchanged' },
			{ shot: s.b, outcome: 'unchanged' }
		]);
		expect(writes(w.fpt).length).toBe(before);
	});

	// Kevin, 2026-11-17: more material rewrites the Note in place and a reply says what was added.
	// The people newly assigned are added; nobody is removed.
	it('rewrites the Note in place when more was captured, adds the newly assigned, and replies with what was added', async () => {
		const w = world();
		const s = await shoot(w);
		await w.transport.writeNotes([s.a]);
		const note = noteOf(w.fpt, s.a);
		// Another device sends take 3 on 42A: it is in Flow PT only. Someone else joins the Task.
		await sent(w, create('take', 't9', { slateId: 's1', take: '3', takeTail: ['cleanPlate'] }, { s1: s.s1 }));
		w.fpt.rows.get(`Task:${s.taskA}`)!.values.task_assignees = [{ type: 'HumanUser', id: s.other }];
		const before = writes(w.fpt).length;
		expect(await w.make().writeNotes([s.a])).toEqual([{ shot: s.a, outcome: 'updated' }]);
		expect(notes(w.fpt)).toHaveLength(1);
		const [put, reply] = writes(w.fpt).slice(before);
		expect(put).toMatchObject({ method: 'PUT', path: `/api/v1/entity/notes/${note.id}` });
		expect(put.body).toMatchObject({ addressings_to: { multi_entity_update_mode: 'add', value: [{ type: 'HumanUser', id: s.other }] } });
		expect(reply).toMatchObject({ method: 'POST', path: '/api/v1/entity/replies' });
		expect(reply.body).toEqual({ entity: { type: 'Note', id: note.id }, content: ['Added:', 'Clean plate tail: 42A take 3'].join('\n') });
		expect(writes(w.fpt).length).toBe(before + 2);
		const after = noteOf(w.fpt, s.a);
		expect(after.id).toBe(note.id);
		expect(after.values.content).toContain('42A: 1, 2, 3');
		expect(after.values.addressings_to).toEqual([
			{ type: 'Group', id: s.group },
			{ type: 'HumanUser', id: s.person },
			{ type: 'HumanUser', id: s.other }
		]);
		expect(w.fpt.live('Reply')).toHaveLength(1);
		// And then nothing more.
		expect(await w.make().writeNotes([s.a])).toEqual([{ shot: s.a, outcome: 'unchanged' }]);
	});

	// `empty`, apart from `unchanged`: the page of #106 says which (nothing shot yet, or nothing new).
	it('writes no Note for a Shot with nothing captured yet, and says it is empty', async () => {
		const w = world();
		const project = { type: 'Project', id: w.projectId };
		const shot = w.fpt.seed('Shot', { code: 'SMP_050_0010', project });
		const d1 = await sent(w, create('shootDay', 'd1', { projectId: 'p1', shootDate: '2026-11-11' }, { p1: w.projectId }));
		await sent(w, create('slate', 's1', { shootDayId: 'd1', slateUID: '50', vfxShots: ['SMP_050_0010'] }, { d1 }));
		expect(await w.transport.writeNotes([shot])).toEqual([{ shot, outcome: 'empty' }]);
		expect(notes(w.fpt)).toEqual([]);
	});

	// findings/146: a second Note for the key is refused. Another device made it since the lookup.
	it('makes no second Note when another device made it since the lookup, and goes on with the others', async () => {
		const w = world();
		const s = await shoot(w);
		w.fpt.failNext((r) => r.method === 'POST' && r.path === '/api/v1/entity/notes', {
			status: 400,
			body: { errors: [{ status: 400, code: 104, title: 'Create failed for [Note]: The value for the Onset Key field is required to be unique. <br> ' }] }
		});
		expect(await w.transport.writeNotes([s.a, s.b])).toEqual([
			{ shot: s.a, outcome: 'failed' },
			{ shot: s.b, outcome: 'created' }
		]);
		expect(notes(w.fpt)).toHaveLength(1);
	});

	it('stops writing when Flow PT stops answering, and writes the rest at the next sync', async () => {
		const w = world();
		const s = await shoot(w);
		w.fpt.failNext((r) => r.method === 'POST' && r.path === '/api/v1/entity/notes', 'network');
		expect(await w.transport.writeNotes([s.a, s.b])).toEqual([
			{ shot: s.a, outcome: 'failed' },
			{ shot: s.b, outcome: 'failed' }
		]);
		expect(await w.transport.writeNotes([s.a, s.b])).toEqual([
			{ shot: s.a, outcome: 'created' },
			{ shot: s.b, outcome: 'created' }
		]);
	});

	// The Note fields are optional (#97): a site set up before them syncs the rest.
	it('writes nothing on a site without the Note fields', async () => {
		const w = world();
		const s = await shoot(w);
		delete w.fpt.fields.Note.sg_onset_key;
		delete w.fpt.fields.Note.sg_onset_captured;
		const fresh = createFptTransport({ site: w.fpt.site, bearer: async () => BEARER, fetch: w.fpt.fetch, schemaCache: memoryKeyValue(), projectId: w.projectId, online: () => true });
		expect(await fresh.writeNotes([s.a])).toBeUndefined();
		expect(w.fpt.requests.some((r) => r.path.startsWith('/api/v1/entity/notes'))).toBe(false);
	});

	// Kevin, #117: Set Reference is optional. The Note lists what Flow PT holds: on a site without
	// it, no references, and Flow PT is asked nothing about them.
	it('writes the Notes on a site without Set Reference, with no references', async () => {
		const w = world();
		delete w.fpt.types.CustomEntity21;
		const s = await shoot(w, { reference: false });
		expect(await w.transport.writeNotes([s.a, s.b])).toEqual([
			{ shot: s.a, outcome: 'created' },
			{ shot: s.b, outcome: 'created' }
		]);
		const content = String(noteOf(w.fpt, s.a).values.content);
		expect(content).toContain('42A: 1, 2');
		expect(content).not.toContain('References');
		expect(String(noteOf(w.fpt, s.a).values.sg_onset_captured)).not.toContain('reference:');
		expect(w.fpt.requests.some((r) => r.path.includes('custom_entity21'))).toBe(false);
	});

	it('writes nothing for a Shot of another project', async () => {
		const w = world();
		await shoot(w);
		const elsewhere = w.fpt.seed('Shot', { code: 'SMP_042_0010', project: { type: 'Project', id: w.fpt.seed('Project', { name: 'Other' }) } });
		expect(await w.transport.writeNotes([elsewhere])).toEqual([]);
		expect(notes(w.fpt)).toEqual([]);
	});
});

// "Send set data to artists" (#106) against the fake site (corpus shapes): a desktop with nothing on
// it, after wrap. The slates synced from the iPad while no Shot existed; editorial made the Shots
// since. Everything is read from Flow PT.

import { describe, expect, it } from 'vitest';
import type { RemoteId } from '$lib/outbox/types';
import type { PushOp } from '$lib/outbox/transport';
import { TransportError } from '$lib/outbox/transport';
import { createApi } from './api';
import { memoryKeyValue } from './cache';
import { BEARER, fakeFpt, type FakeFpt } from './fakeFpt';
import { previewSend, sendSetData } from './sendSetData';
import { loadResolution } from './setup';
import { createFptTransport } from './transport';

const SET_SHOT = 'CustomEntity22';
type Ref = { type: string; id: number };

function world(options: { fields?: 'complete' | 'bare' } = {}) {
	const fpt = fakeFpt(options);
	const projectId = fpt.seed('Project', { name: 'Show' });
	const project = { type: 'Project', id: projectId };
	// The iPad: its transport, its own schema cache.
	const ipad = createFptTransport({ site: fpt.site, bearer: async () => BEARER, fetch: fpt.fetch, schemaCache: memoryKeyValue(), projectId, now: () => fpt.clock.t, online: () => fpt.online });
	// The desktop: an empty cache, the person's own session.
	const options_ = { site: fpt.site, bearer: async () => BEARER, fetch: fpt.fetch, schemaCache: memoryKeyValue(), online: () => fpt.online };
	const api = createApi(options_);
	const res = () => loadResolution(api, options_);
	return { fpt, projectId, project, ipad, api, res };
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
	const result = await w.ipad.push([o]);
	if (result.outcome !== 'applied') throw new Error(`refused: ${JSON.stringify(result.refusals)}`);
	return Number(result.remoteIds[o.entryId]);
}

/** The shoot, synced while no Shot existed: 42A for SH010, 42B for SH010 and SH020, a take on each. */
async function shoot(w: World) {
	const d1 = await sent(w, create('shootDay', 'd1', { projectId: 'p1', shootDate: '2026-11-11' }, { p1: w.projectId }));
	const s1 = await sent(w, create('slate', 's1', { shootDayId: 'd1', slateUID: '42A', vfxShots: ['SH010'] }, { d1 }));
	const s2 = await sent(w, create('slate', 's2', { shootDayId: 'd1', slateUID: '42B', vfxShots: ['SH010', 'SH020'] }, { d1 }));
	await sent(w, create('take', 't1', { slateId: 's1', take: '1', takeType: 'cleanPlate' }, { s1 }));
	await sent(w, create('take', 't2', { slateId: 's2', take: '1' }, { s2 }));
	const setShot = (code: string) => w.fpt.live(SET_SHOT).find((r) => r.values.code === code)!;
	return { s1, s2, setShot };
}

/** Turnover: editorial makes the Shots, each with a Task assigned to an artist. */
function turnover(w: World, codes: string[]) {
	const artist = w.fpt.seed('HumanUser', { name: 'Ana' });
	const shots = codes.map((code) => {
		const id = w.fpt.seed('Shot', { code, project: w.project });
		w.fpt.seed('Task', { content: 'Comp', project: w.project, entity: { type: 'Shot', id }, task_assignees: [{ type: 'HumanUser', id: artist }] });
		return id;
	});
	return { artist, shots };
}

const links = (fpt: FakeFpt, type: string, id: number, field: string) => ((fpt.rows.get(`${type}:${id}`)!.values[field] as Ref[] | undefined) ?? []).map((r) => r.id).sort((a, b) => a - b);
const notes = (fpt: FakeFpt) => fpt.live('Note');
const writes = (fpt: FakeFpt) => fpt.requests.filter((r) => r.method !== 'GET' && !r.path.endsWith('/_search'));

describe('previewSend', () => {
	it('names the project and the rows as Flow PT holds them, and counts those it does not hold', async () => {
		const w = world();
		await shoot(w);
		const { shots } = turnover(w, ['SH020', 'SH010']);
		const elsewhere = w.fpt.seed('Shot', { code: 'X010', project: { type: 'Project', id: w.fpt.seed('Project', { name: 'Other' }) } });
		const before = writes(w.fpt).length;
		const preview = await previewSend(w.api, await w.res(), w.projectId, { kind: 'shot', ids: [...shots, elsewhere, 999999] });
		expect(preview).toEqual({
			project: 'Show',
			kind: 'shot',
			rows: [
				{ id: shots[1], code: 'SH010' },
				{ id: shots[0], code: 'SH020' }
			],
			missing: 2,
			notes: true
		});
		// Looking writes nothing.
		expect(writes(w.fpt).length).toBe(before);
	});

	it('Set Shots by their name now', async () => {
		const w = world();
		const s = await shoot(w);
		const preview = await previewSend(w.api, await w.res(), w.projectId, { kind: 'setShot', ids: [s.setShot('SH020').id] });
		expect(preview.rows).toEqual([{ id: s.setShot('SH020').id, code: 'SH020' }]);
	});
});

describe('sendSetData', () => {
	it('on Shots: matches their Set Shots on the code, links the slates, writes one Note per Shot to the artists', async () => {
		const w = world();
		const s = await shoot(w);
		const { artist, shots } = turnover(w, ['SH010', 'SH020']);
		const [sh010, sh020] = shots;
		expect(links(w.fpt, 'Slate', s.s2, 'sg_shots')).toEqual([]);

		const result = await sendSetData(w.api, await w.res(), w.projectId, { kind: 'shot', ids: shots });

		// The Set Shots hold the Shots now, and are marked matched: never again on any device.
		expect(links(w.fpt, SET_SHOT, s.setShot('SH010').id, 'sg_shots')).toEqual([sh010]);
		expect(s.setShot('SH010').values.sg_onset_matched).toBe(true);
		// Each slate links the Shots of its Set Shots.
		expect(links(w.fpt, 'Slate', s.s1, 'sg_shots')).toEqual([sh010]);
		expect(links(w.fpt, 'Slate', s.s2, 'sg_shots')).toEqual([sh010, sh020]);
		// One Note per Shot, to the artist on its Task.
		expect(notes(w.fpt)).toHaveLength(2);
		const note = notes(w.fpt).find((r) => (r.values.note_links as Ref[])[0].id === sh010)!;
		expect(note.values.addressings_to).toEqual([{ type: 'HumanUser', id: artist }]);
		expect(note.values.content).toContain('Clean plate: 42A take 1');

		expect(result).toEqual({
			kind: 'shot',
			shots: [
				{ shot: { id: sh010, code: 'SH010' }, linked: true, setShots: 1, slates: 2, slatesFailed: false, note: 'created' },
				{ shot: { id: sh020, code: 'SH020' }, linked: true, setShots: 1, slates: 1, slatesFailed: false, note: 'created' }
			],
			waiting: [],
			missing: 0,
			stopped: false
		});
	});

	it('run again: nothing new, nothing written', async () => {
		const w = world();
		await shoot(w);
		const { shots } = turnover(w, ['SH010', 'SH020']);
		await sendSetData(w.api, await w.res(), w.projectId, { kind: 'shot', ids: shots });
		const before = writes(w.fpt).length;
		const again = await sendSetData(w.api, await w.res(), w.projectId, { kind: 'shot', ids: shots });
		expect(writes(w.fpt).length).toBe(before);
		expect(again.shots.map((r) => [r.linked, r.note])).toEqual([
			[false, 'unchanged'],
			[false, 'unchanged']
		]);
	});

	it('only what was selected: a slate’s other code keeps its Set Shot, unmatched, and gets no Note', async () => {
		const w = world();
		const s = await shoot(w);
		const { shots } = turnover(w, ['SH010', 'SH020']);
		const result = await sendSetData(w.api, await w.res(), w.projectId, { kind: 'shot', ids: [shots[0]] });
		expect(result.shots.map((r) => r.shot.code)).toEqual(['SH010']);
		expect(s.setShot('SH020').values.sg_onset_matched).not.toBe(true);
		expect(links(w.fpt, 'Slate', s.s2, 'sg_set_shots')).toEqual([s.setShot('SH010').id, s.setShot('SH020').id].sort((a, b) => a - b));
		expect(links(w.fpt, 'Slate', s.s2, 'sg_shots')).toEqual([shots[0]]);
		expect(notes(w.fpt)).toHaveLength(1);
	});

	it('matches once: a Set Shot a person emptied after a match stays empty (#102)', async () => {
		const w = world();
		const s = await shoot(w);
		const { shots } = turnover(w, ['SH010']);
		const row = s.setShot('SH010');
		row.values.sg_onset_matched = true;
		row.values.sg_shots = [];
		const result = await sendSetData(w.api, await w.res(), w.projectId, { kind: 'shot', ids: shots });
		expect(links(w.fpt, SET_SHOT, row.id, 'sg_shots')).toEqual([]);
		expect(result.shots).toEqual([{ shot: { id: shots[0], code: 'SH010' }, linked: false, setShots: 0, slates: 0, slatesFailed: false, note: 'empty' }]);
		expect(notes(w.fpt)).toEqual([]);
	});

	it('on Set Shots: a Shot set by hand in Flow PT reaches the slates and gets its Note; one with no Shot waits', async () => {
		const w = world();
		const s = await shoot(w);
		// Editorial named it otherwise: a person set it on the Set Shot by hand, no flag.
		const { shots } = turnover(w, ['SEQ01_0010']);
		w.fpt.rows.get(`${SET_SHOT}:${s.setShot('SH010').id}`)!.values.sg_shots = [{ type: 'Shot', id: shots[0] }];
		const result = await sendSetData(w.api, await w.res(), w.projectId, { kind: 'setShot', ids: [s.setShot('SH010').id, s.setShot('SH020').id] });
		expect(links(w.fpt, 'Slate', s.s1, 'sg_shots')).toEqual([shots[0]]);
		expect(result.shots).toEqual([{ shot: { id: shots[0], code: 'SEQ01_0010' }, linked: false, setShots: 1, slates: 2, slatesFailed: false, note: 'created' }]);
		expect(result.waiting).toEqual([{ id: s.setShot('SH020').id, code: 'SH020' }]);
	});

	it('on Set Shots: the code match runs for those selected', async () => {
		const w = world();
		const s = await shoot(w);
		const { shots } = turnover(w, ['SH020']);
		const result = await sendSetData(w.api, await w.res(), w.projectId, { kind: 'setShot', ids: [s.setShot('SH020').id] });
		expect(s.setShot('SH020').values.sg_onset_matched).toBe(true);
		expect(result.shots).toEqual([{ shot: { id: shots[0], code: 'SH020' }, linked: true, setShots: 1, slates: 1, slatesFailed: false, note: 'created' }]);
	});

	it('counts the selected rows Flow PT does not hold in the project', async () => {
		const w = world();
		await shoot(w);
		const { shots } = turnover(w, ['SH010']);
		const elsewhere = w.fpt.seed('Shot', { code: 'SH010', project: { type: 'Project', id: w.fpt.seed('Project', { name: 'Other' }) } });
		const result = await sendSetData(w.api, await w.res(), w.projectId, { kind: 'shot', ids: [shots[0], elsewhere, 999999] });
		expect(result.missing).toBe(2);
		expect(result.shots.map((r) => r.shot.id)).toEqual([shots[0]]);
	});

	it('the links go on a site without the Note fields; the Notes wait', async () => {
		const w = world();
		const s = await shoot(w);
		delete w.fpt.fields.Note.sg_onset_key;
		delete w.fpt.fields.Note.sg_onset_captured;
		const { shots } = turnover(w, ['SH010']);
		const result = await sendSetData(w.api, await w.res(), w.projectId, { kind: 'shot', ids: shots });
		expect(links(w.fpt, 'Slate', s.s1, 'sg_shots')).toEqual(shots);
		expect(result.shots[0].note).toBe('waits');
		expect(notes(w.fpt)).toEqual([]);
	});

	it('a slate write refused is that slate’s, said on its Shot', async () => {
		const w = world();
		const s = await shoot(w);
		const { shots } = turnover(w, ['SH010']);
		w.fpt.failNext((r) => r.method === 'PUT' && r.path.endsWith(`/slates/${s.s1}`), { status: 400, body: { errors: [{ status: 400, code: 103, title: 'No' }] } });
		const result = await sendSetData(w.api, await w.res(), w.projectId, { kind: 'shot', ids: shots });
		expect(result.shots[0]).toMatchObject({ slates: 2, slatesFailed: true, note: 'created' });
		expect(links(w.fpt, 'Slate', s.s2, 'sg_shots')).toEqual(shots);
	});

	it('no answer at the start: throws, and nothing is written', async () => {
		const w = world();
		await shoot(w);
		const { shots } = turnover(w, ['SH010']);
		const res = await w.res();
		const before = writes(w.fpt).length;
		w.fpt.online = false;
		await expect(sendSetData(w.api, res, w.projectId, { kind: 'shot', ids: shots })).rejects.toBeInstanceOf(TransportError);
		expect(writes(w.fpt).length).toBe(before);
	});

	it('no answer part way: what went is said, and the run says it stopped', async () => {
		const w = world();
		await shoot(w);
		const { shots } = turnover(w, ['SH010']);
		// The slates' search gets no answer, after the match landed.
		w.fpt.failNext((r) => r.path.endsWith('/slates/_search'), 'network', 5);
		const result = await sendSetData(w.api, await w.res(), w.projectId, { kind: 'shot', ids: shots });
		expect(result.stopped).toBe(true);
		expect(result.shots[0]).toMatchObject({ linked: true });
	});
});

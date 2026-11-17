// Sync through the app's wiring: the store and editor as the app opens them, the real runner, the
// real FPT transport, against the fake site of lib/fpt (corpus shapes). Nothing leaves the test.

import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import { memoryKeyValue } from '$lib/fpt/cache';
import { BEARER, fakeFpt, type FakeFpt } from '$lib/fpt/fakeFpt';
import type { Page, PageEvent } from '$lib/outbox/foreground';
import type { DrainReport } from '$lib/outbox/runner';
import { openStore, type DexieStore } from '$lib/store/dexieStore';
import { createEditor } from '../editor';
import { createSyncEngine, type SyncEngine } from './engine';
import { setupView } from './report';
import { nextStep, setupReview, type ReviewAction, type ReviewStep } from './review';
import { syncStatus } from './status';

const TAKE = 'CustomEntity09';
const SET_SHOT = 'CustomEntity22';
let n = 0;

function setup(options: { fields?: 'complete' | 'bare'; beforeDrain?: (store: DexieStore) => Promise<void> } = {}) {
	const fpt = fakeFpt(options);
	const fptProject = fpt.seed('Project', { name: 'Show', is_template: false, is_demo: false, archived: false });
	fpt.seed('Project', { name: 'Template', is_template: true, is_demo: false, archived: false });
	const other = fpt.seed('Project', { name: 'Other Show', is_template: false, is_demo: false, archived: false });
	return { fpt, fptProject, other, ...device(fpt, options) };
}

/** One device: its store, editor, page, session and sync engine, on the site given. */
function device(fpt: FakeFpt, options: { beforeDrain?: (store: DexieStore) => Promise<void> } = {}) {
	const store = openStore({ name: `sync-${++n}`, indexedDB: new IDBFactory(), IDBKeyRange, now: () => fpt.clock.t });
	const edit = createEditor(store, () => undefined);

	// The page starts hidden, so nothing drains until a test says so.
	const world = { visible: false, online: true };
	const handlers = new Map<PageEvent, Set<() => void>>();
	const page: Page = {
		visible: () => world.visible,
		online: () => world.online,
		now: () => fpt.clock.t,
		listen(event, fn) {
			if (!handlers.has(event)) handlers.set(event, new Set());
			handlers.get(event)!.add(fn);
			return () => handlers.get(event)!.delete(fn);
		},
		timer: () => () => undefined
	};
	const emit = (event: PageEvent) => handlers.get(event)?.forEach((fn) => fn());

	// The session as lib/auth/session.svelte keeps it: a refused token is forgotten, the state expires.
	const auth = { token: 'tok' as string | null, refuse: false };
	const bearer = async () => {
		if (!auth.token) throw new Error('Not signed in to Flow PT.');
		if (auth.refuse) {
			auth.token = null;
			throw Object.assign(new Error('refused'), { status: 400, body: { errors: [{ status: 400, code: 102, title: 'Bad session token' }] } });
		}
		return BEARER;
	};

	const kv = memoryKeyValue();
	const engine = createSyncEngine({
		store,
		site: () => fpt.site,
		canSync: () => auth.token !== null,
		bearer,
		fetch: ((input, init) => fpt.fetch(input, init)) as typeof fetch,
		schemaCache: memoryKeyValue(),
		kv,
		page,
		...(options.beforeDrain ? { beforeDrain: () => options.beforeDrain!(store) } : {})
	});
	return { store, edit, world, emit, auth, kv, engine };
}

type S = ReturnType<typeof setup>;

const photo = () => new Blob([new Uint8Array(10)], { type: 'image/jpeg' });

/** Project, shoot day, slate, take, photo: as the app makes them. */
async function shoot(s: S) {
	await s.edit.create('project', { id: 'p1', name: 'Show' });
	await s.edit.create('shootDay', { id: 'd1', projectId: 'p1', shootDate: '2026-11-11' });
	await s.edit.create('slate', { id: 's1', shootDayId: 'd1', slateUID: '42A' });
	await s.edit.create('take', { id: 't1', slateId: 's1', take: '1', startedAt: '2026-11-11T09:00:00.000Z', circleTake: false, tStop: 2.8 });
	await s.edit.create('still', { id: 'ph1', takeId: 't1', capturedAt: '2026-11-11T09:01:02.000Z' }, { attach: { blob: photo() } });
}

async function linked(s: S) {
	await s.engine.setProject('p1');
	expect(await s.engine.link({ id: s.fptProject, name: 'Show' })).toBe('linked');
	expect(s.engine.state.ready).toBe(true);
}

/** Drains, moving the clock to each retry, until nothing is scheduled. */
async function settle(engine: SyncEngine, fpt: FakeFpt): Promise<DrainReport> {
	for (let i = 0; i < 50; i++) {
		const report = await engine.syncNow();
		if (!report) throw new Error('the runner is not running');
		if (report.stopped !== 'waiting') return report;
		fpt.clock.t = report.waitUntil!;
	}
	throw new Error('never settled');
}

const ref = (v: unknown) => v as { type: string; id: number };

describe('the project link', () => {
	it('lists the projects a person would pick from, and keeps the pick per project', async () => {
		const s = setup();
		await s.engine.setProject('p1');
		expect(await s.engine.listProjects()).toEqual([
			{ id: s.other, name: 'Other Show' },
			{ id: s.fptProject, name: 'Show' }
		]);
		await s.engine.link({ id: s.fptProject, name: 'Show' });
		expect(s.engine.state.link).toEqual({ site: s.fpt.site, projectId: s.fptProject, name: 'Show' });
		await s.engine.setProject('p2');
		expect(s.engine.state.link).toBeUndefined();
		await s.engine.setProject('p1');
		expect(s.engine.state.link?.projectId).toBe(s.fptProject);
		await s.engine.unlink();
		expect(s.engine.state.link).toBeUndefined();
		expect(s.engine.state.running).toBe(false);
	});

	it('refuses another FPT project once the project synced to one', async () => {
		const s = setup();
		await shoot(s);
		await linked(s);
		s.world.visible = true;
		await settle(s.engine, s.fpt);
		await s.engine.unlink();
		expect(await s.engine.link({ id: s.other, name: 'Other Show' })).toBe('otherProject');
		expect(await s.engine.link({ id: s.fptProject, name: 'Show' })).toBe('linked');
	});
});

describe('the setup check gates the runner', () => {
	it('only looks after linking, creates fields on Set Up Fields alone, then runs', async () => {
		const s = setup({ fields: 'bare' });
		await s.engine.setProject('p1');
		await s.engine.link({ id: s.fptProject, name: 'Show' });
		const creates = () => s.fpt.count((r) => r.method === 'POST' && /\/schema\/\w+\/fields$/.test(r.path));
		expect(s.engine.state.report?.ready).toBe(false);
		expect(s.engine.state.report?.fields.some((f) => f.status === 'missing')).toBe(true);
		expect(creates()).toBe(0);
		expect(s.engine.state.running).toBe(false);

		const report = await s.engine.check(true);
		expect(report?.ready).toBe(true);
		expect(creates()).toBeGreaterThan(0);
		expect(s.engine.state).toMatchObject({ ready: true, running: true });
	});

	// A write is anything but a read: GET, and the POST of a search.
	const writes = (s: S) => s.fpt.count((r) => r.method !== 'GET' && r.method !== 'HEAD' && !r.path.endsWith('/_search'));

	it('writes nothing on Flow PT when linking a project', async () => {
		const s = setup({ fields: 'bare' });
		await s.engine.setProject('p1');
		await s.engine.listProjects();
		await s.engine.link({ id: s.fptProject, name: 'Show' });
		expect(s.fpt.requests.length).toBeGreaterThan(0);
		expect(writes(s)).toBe(0);
	});

	it('creates nothing until the review is confirmed: Not Now leaves the site alone, Set Up Fields goes on', async () => {
		const s = setup({ fields: 'bare' });
		await s.engine.setProject('p1');
		await s.engine.link({ id: s.fptProject, name: 'Show' });
		const link = s.engine.state.link!;
		const review = setupReview(setupView(s.engine.state.report!), { site: link.site, project: link.name });
		expect(review.show).toBe(true);
		expect(review.groups.map((g) => g.entity)).toEqual(expect.arrayContaining(['Slate', 'Take']));

		// The sheet does what `nextStep` says, as SetupSections does.
		const tap = async (step: ReviewStep, action: ReviewAction): Promise<ReviewStep> => {
			const next = nextStep(step, action, review);
			if (next.run) await s.engine.check(true);
			return next.step;
		};
		let step = await tap('closed', 'request');
		expect(step).toBe('reviewing');
		step = await tap(step, 'notNow');
		expect(step).toBe('closed');
		expect(writes(s)).toBe(0);
		expect(s.engine.state.ready).toBe(false);

		step = await tap(await tap(step, 'request'), 'confirm');
		expect(step).toBe('closed');
		const created = s.fpt.count((r) => r.method === 'POST' && /\/schema\/\w+\/fields$/.test(r.path));
		expect(created).toBe(review.total);
		expect(s.engine.state.ready).toBe(true);
	});
});

describe('a drain through the app wiring', () => {
	it('sends project, shoot day, slate, take and photo, linked, into the linked FPT project', async () => {
		const s = setup();
		await shoot(s);
		await linked(s);
		s.world.visible = true;
		expect((await settle(s.engine, s.fpt)).stopped).toBe('idle');

		const day = s.fpt.byUuid('ShootDay', 'd1')!;
		const slate = s.fpt.byUuid('Slate', 's1')!;
		const take = s.fpt.byUuid(TAKE, 't1')!;
		expect(ref(day.values.project)).toEqual({ type: 'Project', id: s.fptProject });
		expect(ref(slate.values.sg_shoot_day)).toEqual({ type: 'ShootDay', id: day.id });
		expect(ref(take.values.sg_slate)).toEqual({ type: 'Slate', id: slate.id });
		expect(ref(take.values.project).id).toBe(s.fptProject);
		const photos = take.values.sg_photos as { type: string; id: number }[];
		expect(photos).toHaveLength(1);
		expect(s.fpt.live('Attachment').map((a) => a.id)).toEqual([photos[0].id]);

		expect(await s.store.outbox.entries()).toEqual([]);
		expect(s.engine.state.scoped?.entries).toBe(0);
		expect(s.engine.state.lastSyncAt).toBe(s.fpt.clock.t);
		expect(syncStatus({ auth: 'signed-in', linked: true, ready: true, online: true, unsynced: s.engine.state.scoped }).state).toBe('synced');
	});

	it('makes what is drawn at sync before each drain, and sends it in that drain: a slate’s setup diagram', async () => {
		let made = 0;
		const s = setup({
			beforeDrain: async (store) => {
				if (made++) return;
				await store.putBlob('slate', 's1', { blob: new Blob([new Uint8Array(12)], { type: 'image/png' }), variant: 'diagram', source: 'k1' });
			}
		});
		await shoot(s);
		await linked(s);
		s.world.visible = true;
		expect((await settle(s.engine, s.fpt)).stopped).toBe('idle');
		const slate = s.fpt.byUuid('Slate', 's1')!;
		const images = slate.values.sg_setup_diagram as { type: string; id: number }[];
		expect(images).toHaveLength(1);
		expect(s.fpt.rows.get(`Attachment:${images[0].id}`)!.values.filename).toMatch(/^onset_diagram_s1_/);
		expect(await s.store.outbox.entries()).toEqual([]);
	});

	it('still drains when what is drawn at sync fails', async () => {
		const s = setup({ beforeDrain: async () => Promise.reject(new Error('no canvas')) });
		await shoot(s);
		await linked(s);
		s.world.visible = true;
		expect((await settle(s.engine, s.fpt)).stopped).toBe('idle');
		expect(s.fpt.byUuid('Slate', 's1')).toBeDefined();
	});

	it('ticks a box stored unticked, and edits a time stamped with milliseconds, with no conflict', async () => {
		const s = setup();
		await shoot(s);
		await linked(s);
		s.world.visible = true;
		await settle(s.engine, s.fpt);
		const take = (await s.store.get('take', 't1'))!;
		await s.edit.set('take', take, 'circleTake', true);
		await s.edit.set('take', take, 'startedAt', '2026-11-11T09:00:05.000Z');
		await settle(s.engine, s.fpt);
		expect(await s.store.outbox.entries()).toEqual([]);
		const row = s.fpt.byUuid(TAKE, 't1')!;
		expect(row.values.sg_circled).toBe(true);
		expect(row.values.sg_start_time).toBe('2026-11-11T09:00:05Z');
	});

	it('leaves the entries of another project on the device alone', async () => {
		const s = setup();
		await shoot(s);
		await s.edit.create('project', { id: 'p2', name: 'Sample' });
		await s.edit.create('shootDay', { id: 'd2', projectId: 'p2', shootDate: '2026-11-10' });
		await linked(s);
		s.world.visible = true;
		await settle(s.engine, s.fpt);
		expect(s.fpt.byUuid('ShootDay', 'd2')).toBeUndefined();
		expect(s.fpt.byUuid('ShootDay', 'd1')).toBeDefined();
		expect((await s.store.outbox.entries()).map((e) => e.op.recordId).sort()).toEqual(['d2', 'p2']);
		expect(await s.store.remoteId('p2')).toBeUndefined();
		expect(s.engine.state.scoped?.entries).toBe(0);
	});

	it('marks the copy off the device when a drain leaves the whole queue empty', async () => {
		const s = setup();
		await shoot(s);
		await linked(s);
		s.world.visible = true;
		expect((await s.store.snapshots.status()).offDevice.sync).toBeUndefined();
		expect((await settle(s.engine, s.fpt)).stopped).toBe('idle');
		expect((await s.store.snapshots.status()).offDevice.sync).toBe(s.fpt.clock.t);
	});

	it('does not mark it while another project still waits on the device', async () => {
		const s = setup();
		await shoot(s);
		await s.edit.create('project', { id: 'p2', name: 'Sample' });
		await linked(s);
		s.world.visible = true;
		expect((await settle(s.engine, s.fpt)).stopped).toBe('idle');
		expect((await s.store.snapshots.status()).offDevice.sync).toBeUndefined();
	});

	it('goes offline mid-drain, keeps what landed, and resumes without a duplicate', async () => {
		const s = setup();
		await shoot(s);
		await linked(s);
		// The network goes after the first batch has been answered.
		const fetch = s.fpt.fetch;
		let batches = 0;
		s.fpt.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
			const answer = await fetch(input, init);
			if (String(input).endsWith('/entity/_batch') && ++batches === 1) {
				s.fpt.online = false;
				s.world.online = false;
				s.emit('offline');
			}
			return answer;
		}) as typeof fetch;
		s.world.visible = true;
		expect((await s.engine.syncNow())?.stopped).toBe('offline');
		expect(s.engine.state.online).toBe(false);
		expect(s.fpt.byUuid('ShootDay', 'd1')).toBeDefined();
		expect(s.fpt.byUuid('Slate', 's1')).toBeUndefined();
		expect(syncStatus({ auth: 'signed-in', linked: true, ready: true, online: s.engine.state.online, unsynced: s.engine.state.scoped }).state).toBe('offline');

		s.fpt.online = true;
		s.world.online = true;
		s.emit('online');
		expect((await settle(s.engine, s.fpt)).stopped).toBe('idle');
		expect(s.fpt.live('ShootDay')).toHaveLength(1);
		expect(s.fpt.byUuid(TAKE, 't1')).toBeDefined();
		expect(await s.store.outbox.entries()).toEqual([]);
	});

	it('pauses on an expired session, lets capture go on, and resumes after signing in again', async () => {
		const s = setup();
		await shoot(s);
		await linked(s);
		s.auth.refuse = true;
		s.world.visible = true;
		expect((await s.engine.syncNow())?.stopped).toBe('unauthorized');
		expect(s.auth.token).toBeNull();
		expect(s.fpt.byUuid('ShootDay', 'd1')).toBeUndefined();

		// The app reacts to the account changing.
		await s.engine.refresh();
		expect(s.engine.state.running).toBe(false);
		expect(syncStatus({ auth: 'expired', linked: !!s.engine.state.link, ready: s.engine.state.ready, online: true, unsynced: s.engine.state.scoped }).state).toBe('expired');

		// Capture needs no token.
		await s.edit.create('take', { id: 't2', slateId: 's1', take: '2' });
		expect(await s.store.get('take', 't2')).toBeDefined();
		expect(await s.engine.syncNow()).toBeUndefined();

		s.auth.refuse = false;
		s.auth.token = 'tok';
		await s.engine.refresh();
		expect(s.engine.state.running).toBe(true);
		expect((await settle(s.engine, s.fpt)).stopped).toBe('idle');
		expect(s.fpt.byUuid(TAKE, 't1')).toBeDefined();
		expect(s.fpt.byUuid(TAKE, 't2')).toBeDefined();
		expect(await s.store.outbox.entries()).toEqual([]);
	});
});

// The slate's Set Shots and Shots, worked out from its VFX shot codes at sync (lib/fpt/setShots.ts).
// Nothing about links is kept on the device: every sync brings every slate in line again (Kevin,
// #102). The codes whose Set Shot holds several Shots of that code are listed in the sync sheet.
describe('the Set Shots and Shots of a slate', () => {
	type Ref = { type: string; id: number };
	// A retired Shot leaves the field, as Flow PT reads it (field_types/multi_entity.md).
	const shotIds = (s: S, slate = 's1') =>
		((s.fpt.byUuid('Slate', slate)?.values.sg_shots as Ref[] | undefined) ?? [])
			.filter((r) => !s.fpt.rows.get(`Shot:${r.id}`)?.retired)
			.map((r) => r.id)
			.sort((a, b) => a - b);
	const seedShot = (s: S, code: string, project = s.fptProject) => s.fpt.seed('Shot', { code, project: { type: 'Project', id: project } });
	const setShotOf = (s: S, code: string) => s.fpt.live(SET_SHOT).find((r) => r.values.sg_onset_key === `${s.fptProject}:${code.toLowerCase()}`);
	const linkedIds = (value: unknown) => ((value as Ref[] | undefined) ?? []).map((r) => r.id).sort((a, b) => a - b);
	const later = async (s: S) => {
		s.fpt.clock.t += 61_000;
		await settle(s.engine, s.fpt);
	};

	async function slateWithShots(s: S) {
		await s.edit.create('project', { id: 'p1', name: 'Show' });
		await s.edit.create('shootDay', { id: 'd1', projectId: 'p1', shootDate: '2026-11-11' });
		await s.edit.create('slate', { id: 's1', shootDayId: 'd1', slateUID: '42A', vfxShots: ['SMP_042_0010', 'SMP_042_0020'] });
	}
	async function synced(s: S) {
		await slateWithShots(s);
		await linked(s);
		s.world.visible = true;
		expect((await settle(s.engine, s.fpt)).stopped).toBe('idle');
	}

	it('files a Set Shot per code at sync, matches it, and links a late Shot at a later sync', async () => {
		const s = setup();
		const a = seedShot(s, 'SMP_042_0010');
		await synced(s);
		const first = setShotOf(s, 'SMP_042_0010')!;
		const second = setShotOf(s, 'SMP_042_0020')!;
		expect(s.fpt.live(SET_SHOT)).toHaveLength(2);
		expect(linkedIds(s.fpt.byUuid('Slate', 's1')!.values.sg_set_shots)).toEqual([first.id, second.id]);
		expect(linkedIds(first.values.sg_shots)).toEqual([a]);
		expect(first.values.sg_onset_matched).toBe(true);
		expect(linkedIds(second.values.sg_shots)).toEqual([]);
		expect(shotIds(s)).toEqual([a]);
		expect(s.engine.state.several).toEqual({});

		// A coordinator makes the other Shot. The next sync links it, to the Set Shot, then the slate.
		const b = seedShot(s, 'SMP_042_0020');
		await later(s);
		expect(linkedIds(setShotOf(s, 'SMP_042_0020')!.values.sg_shots)).toEqual([b]);
		expect(shotIds(s)).toEqual([a, b]);
		expect(s.fpt.live('Shot')).toHaveLength(2);
		expect(s.fpt.live(SET_SHOT)).toHaveLength(2);
	});

	// Kevin, #102: anyone sets a Set Shot's Shots in Flow PT's grid. The next sync fills the slate.
	it('links the slate to the Shot someone set on its Set Shot in Flow PT', async () => {
		const s = setup();
		await synced(s);
		const editorial = seedShot(s, 'EDIT_0100');
		setShotOf(s, 'SMP_042_0010')!.values.sg_shots = [{ type: 'Shot', id: editorial }];
		await later(s);
		expect(shotIds(s)).toEqual([editorial]);
	});

	// Kevin, #102: the slate's Shots are derived from its Set Shots. A wrong link is fixed there.
	it('brings every slate in line at each sync: a Shot linked by hand on the slate goes, one taken off the Set Shot goes too', async () => {
		const s = setup();
		const a = seedShot(s, 'SMP_042_0010');
		const other = seedShot(s, 'EDIT_0100');
		await synced(s);
		const row = s.fpt.byUuid('Slate', 's1')!;
		row.values.sg_shots = [...(row.values.sg_shots as Ref[]), { type: 'Shot', id: other }];
		await later(s);
		expect(shotIds(s)).toEqual([a]);
		// The match was wrong: someone empties the Set Shot. It is not matched again, and the slate follows.
		setShotOf(s, 'SMP_042_0010')!.values.sg_shots = [];
		await s.edit.create('slate', { id: 's2', shootDayId: 'd1', slateUID: '43', vfxShots: ['SMP_042_0010'] });
		await later(s);
		expect(linkedIds(setShotOf(s, 'SMP_042_0010')!.values.sg_shots)).toEqual([]);
		expect(shotIds(s)).toEqual([]);
		expect(shotIds(s, 's2')).toEqual([]);
		expect(linkedIds(s.fpt.byUuid('Slate', 's2')!.values.sg_set_shots)).toEqual([setShotOf(s, 'SMP_042_0010')!.id]);
	});

	it('brings the links in line at most once a minute on its own, and at once on Sync Now', async () => {
		const s = setup();
		await synced(s);
		const reads = () => s.fpt.count((r) => r.path === '/api/v1/entity/custom_entity22s/_search');
		const after = reads();
		// A drain the app starts by itself, as the foreground does on every change.
		await s.edit.create('take', { id: 't1', slateId: 's1', take: '1' });
		await vi.waitFor(() => expect(s.fpt.byUuid(TAKE, 't1')).toBeDefined());
		await vi.waitFor(async () => expect(await s.store.outbox.entries()).toEqual([]));
		// Sync Now joins any drain still running, so both drains' ends are counted below.
		await s.engine.syncNow();
		expect(reads()).toBe(after + 1);
	});

	// Nothing is owed on the device: a link write that failed is worked out again at the next sync.
	it('unlinks a code taken off at a later sync when the write failed', async () => {
		const s = setup();
		const a = seedShot(s, 'SMP_042_0010');
		const b = seedShot(s, 'SMP_042_0020');
		await synced(s);
		expect(shotIds(s)).toEqual([a, b]);
		// Both writes of the push fail: the Set Shots and the Shots of the slate.
		s.fpt.failNext((r) => r.method === 'PUT' && r.path.startsWith('/api/v1/entity/slates/'), { status: 503 }, 2);
		const slate = (await s.store.get('slate', 's1'))!;
		await s.edit.set('slate', slate, 'vfxShots', ['SMP_042_0020']);
		await vi.waitFor(async () => expect(await s.store.outbox.entries()).toEqual([]));
		await vi.waitFor(() => expect(s.fpt.byUuid('Slate', 's1')!.values.sg_vfx_shots).toBe('SMP_042_0020'));
		expect(shotIds(s)).toEqual([a, b]);
		await later(s);
		expect(shotIds(s)).toEqual([b]);
		expect(linkedIds(s.fpt.byUuid('Slate', 's1')!.values.sg_set_shots)).toEqual([setShotOf(s, 'SMP_042_0020')!.id]);
	});

	// Kevin, #96: a code several Shots have links them all and is listed, so someone cleans up.
	it('lists a code whose Set Shot holds several Shots of that code, from what the sync read', async () => {
		const s = setup();
		const a = seedShot(s, 'SMP_042_0010');
		const twin = seedShot(s, 'smp_042_0010');
		await synced(s);
		expect(shotIds(s)).toEqual([a, twin]);
		expect(s.engine.state.several).toEqual({ s1: ['SMP_042_0010'] });
		// Someone retires the twin in Flow PT. The next sync reads one Shot and drops the line.
		s.fpt.rows.get(`Shot:${twin}`)!.retired = true;
		await later(s);
		expect(s.engine.state.several).toEqual({});
		expect(shotIds(s)).toEqual([a]);
	});

	it('keeps nothing about links on the device, and removes what an older version kept', async () => {
		const s = setup();
		await s.kv.set('shots:p1', JSON.stringify({ v: 1, slates: { s1: { waiting: ['SMP_042_0010'], several: [], unlink: [] } } }));
		await s.kv.set('setShots:p1', JSON.stringify({ v: 1, ids: [300] }));
		await synced(s);
		expect(await s.kv.get('shots:p1')).toBeUndefined();
		expect(await s.kv.get('setShots:p1')).toBeUndefined();
		expect(s.fpt.live(SET_SHOT)).toHaveLength(2);
	});

	// Kevin, #117: Set Shot is optional. Without it everything else syncs, the sheet says why, and
	// what waited goes up once an admin enables it and runs Set Up Fields.
	it('syncs the rest on a site without Set Shot, and links what waited once it is set up', async () => {
		const s = setup();
		const a = seedShot(s, 'SMP_042_0010');
		const slot = s.fpt.types.CustomEntity22;
		const own = s.fpt.fields.CustomEntity22;
		delete s.fpt.types.CustomEntity22;
		delete s.fpt.fields.Slate.sg_set_shots;
		await synced(s);
		expect(s.engine.state.ready).toBe(true);
		expect(s.engine.state.setShotsMissing).toBe(true);
		expect(s.fpt.byUuid('Slate', 's1')!.values.sg_vfx_shots).toBe('SMP_042_0010, SMP_042_0020');
		expect(shotIds(s)).toEqual([]);

		// An admin enables the slot; Set Up Fields makes its fields.
		s.fpt.types.CustomEntity22 = slot;
		s.fpt.fields.CustomEntity22 = { code: own.code, project: own.project };
		expect((await s.engine.check(true))?.ready).toBe(true);
		expect(s.engine.state.setShotsMissing).toBe(false);
		await settle(s.engine, s.fpt);
		expect(s.fpt.live(SET_SHOT)).toHaveLength(2);
		expect(shotIds(s)).toEqual([a]);
	});

	it('reads the linked project Shot codes for the field, and none without a link, a session or a network', async () => {
		const s = setup();
		seedShot(s, 'SMP_042_0020');
		seedShot(s, 'SMP_042_0010');
		seedShot(s, 'OTHER_0010', s.other);
		await s.engine.setProject('p1');
		expect(await s.engine.shotCodes()).toEqual([]);
		await s.engine.link({ id: s.fptProject, name: 'Show' });
		expect(await s.engine.shotCodes()).toEqual(['SMP_042_0010', 'SMP_042_0020']);
		s.world.online = false;
		expect(await s.engine.shotCodes()).toEqual([]);
		s.world.online = true;
		s.auth.token = null;
		expect(await s.engine.shotCodes()).toEqual([]);
	});
});

// Notes on Shots (#97): off by default, per project on the device. On, each drain's end writes the
// Note of every Shot the project's slates reach, from what Flow PT holds (lib/fpt/shotNotes.ts).
describe('Notes on Shots', () => {
	type Ref = { type: string; id: number };
	const later = async (s: S) => {
		s.fpt.clock.t += 61_000;
		await settle(s.engine, s.fpt);
	};
	const notes = (s: S) => s.fpt.live('Note');

	async function shotSlate(s: S) {
		const project = { type: 'Project', id: s.fptProject };
		const shot = s.fpt.seed('Shot', { code: 'SMP_042_0010', project });
		const person = s.fpt.seed('HumanUser', { name: 'Ana' });
		s.fpt.seed('Task', { content: 'Comp', project, entity: { type: 'Shot', id: shot }, task_assignees: [{ type: 'HumanUser', id: person }] });
		await s.edit.create('project', { id: 'p1', name: 'Show' });
		await s.edit.create('shootDay', { id: 'd1', projectId: 'p1', shootDate: '2026-11-11' });
		await s.edit.create('slate', { id: 's1', shootDayId: 'd1', slateUID: '42A', vfxShots: ['SMP_042_0010'] });
		await s.edit.create('take', { id: 't1', slateId: 's1', take: '1' });
		await linked(s);
		return { shot, person };
	}

	it('writes no Note while it is off, as it is at first', async () => {
		const s = setup();
		await shotSlate(s);
		expect(s.engine.state.notesOnShots).toBe(false);
		s.world.visible = true;
		await settle(s.engine, s.fpt);
		expect(notes(s)).toEqual([]);
	});

	it('on, writes the Note at the end of a drain, nothing at a sync with nothing new, a reply when more is shot', async () => {
		const s = setup();
		const { shot, person } = await shotSlate(s);
		await s.engine.setNotesOnShots(true);
		expect(s.engine.state.notesOnShots).toBe(true);
		s.world.visible = true;
		await settle(s.engine, s.fpt);
		expect(notes(s)).toHaveLength(1);
		const [note] = notes(s);
		expect(note.values).toMatchObject({ subject: 'Set data for SMP_042_0010', note_links: [{ type: 'Shot', id: shot }], addressings_to: [{ type: 'HumanUser', id: person }] });
		expect(note.values.content).toContain('Slate 42A: take 1');

		await later(s);
		expect(s.fpt.live('Reply')).toEqual([]);

		await s.edit.create('take', { id: 't2', slateId: 's1', take: '2', takeType: 'cleanPlate' });
		await later(s);
		expect(notes(s)).toHaveLength(1);
		expect(notes(s)[0].values.content).toContain('Slate 42A: takes 1, 2');
		expect(s.fpt.live('Reply').map((r) => [r.values.entity, r.values.content])).toEqual([[{ type: 'Note', id: note.id }, 'Added since the last update:\nClean plate: 42A take 2\nSlate 42A: take 2']]);
	});

	it('is kept per project on the device', async () => {
		const s = setup();
		await s.engine.setProject('p1');
		await s.engine.setNotesOnShots(true);
		await s.engine.setProject('p2');
		expect(s.engine.state.notesOnShots).toBe(false);
		await s.engine.setProject('p1');
		expect(s.engine.state.notesOnShots).toBe(true);
		await s.engine.setNotesOnShots(false);
		expect(await s.kv.get('notes:p1')).toBeUndefined();
	});

	// The Note fields are optional: the sheet says an admin runs Set Up Fields, and the Notes wait.
	it('says the Notes wait on a site without the Note fields, and writes them once it is set up', async () => {
		const s = setup();
		delete s.fpt.fields.Note.sg_onset_key;
		delete s.fpt.fields.Note.sg_onset_captured;
		await shotSlate(s);
		await s.engine.setNotesOnShots(true);
		expect(s.engine.state.ready).toBe(true);
		expect(s.engine.state.notesMissing).toBe(true);
		s.world.visible = true;
		await settle(s.engine, s.fpt);
		expect(notes(s)).toEqual([]);
		expect((await s.engine.check(true))?.ready).toBe(true);
		expect(s.engine.state.notesMissing).toBe(false);
		await later(s);
		expect(notes(s)).toHaveLength(1);
		expect((notes(s)[0].values.note_links as Ref[])[0].type).toBe('Shot');
	});
});

// Two devices on one show (#110): the lists a show shares are read back at each sync. Slates and
// takes stay with the device that made them.
describe('the shared lists', () => {
	type D = ReturnType<typeof device>;

	/** A second device, its own project linked to the same Flow PT project. */
	async function second(s: S): Promise<D> {
		const b = device(s.fpt);
		await b.edit.create('project', { id: 'pB', name: 'Show on B' });
		await b.engine.setProject('pB');
		expect(await b.engine.link({ id: s.fptProject, name: 'Show' })).toBe('linked');
		b.world.visible = true;
		return b;
	}

	/** The first device's lists, synced. */
	async function lists(s: S) {
		await s.edit.create('project', { id: 'p1', name: 'Show' });
		await s.edit.create('camera', { id: 'c1', projectId: 'p1', cameraModel: 'Alexa 35' });
		await s.edit.create('lens', { id: 'l1', projectId: 'p1', lensModel: 'S4/i 32mm', focalLength: 32 });
		await s.edit.create('lens', { id: 'l2', projectId: 'p1', lensModel: 'Supreme 50mm', focalLength: 50 });
		await s.edit.create('lightingSetup', { id: 'ls1', projectId: 'p1', label: 'Day ext' });
		await s.edit.create('template', { id: 'tp1', projectId: 'p1', name: 'Day ext', scope: 'take', values: { tStop: 2.8 } });
		await s.edit.create('referenceKind', { id: 'k1', projectId: 'p1', name: 'Drone scan' });
		await linked(s);
		s.world.visible = true;
		await settle(s.engine, s.fpt);
	}

	const ids = async (store: DexieStore, table: string) => ((await store.rows(table)) as { id: string }[]).map((r) => r.id).sort();

	it('starts a new device with every list of the show, under its own project, and sends nothing back', async () => {
		const s = setup();
		await lists(s);
		const b = await second(s);
		const writes = s.fpt.count((r) => r.method !== 'GET' && !r.path.endsWith('/_search'));
		await settle(b.engine, s.fpt);
		expect(await ids(b.store, 'camera')).toEqual(['c1']);
		expect(await ids(b.store, 'lens')).toEqual(['l1', 'l2']);
		expect(await ids(b.store, 'lightingSetup')).toEqual(['ls1']);
		expect(await b.store.get('template', 'tp1')).toEqual({ id: 'tp1', projectId: 'pB', name: 'Day ext', scope: 'take', values: { tStop: 2.8 } });
		expect(await b.store.get('referenceKind', 'k1')).toEqual({ id: 'k1', projectId: 'pB', name: 'Drone scan' });
		expect(await b.store.get('lens', 'l1')).toEqual({ id: 'l1', projectId: 'pB', lensModel: 'S4/i 32mm', focalLength: 32 });
		expect(await b.store.remoteId('l1')).toBe(s.fpt.byUuid('CustomEntity19', 'l1')!.id);
		expect((await b.store.outbox.entries()).length).toBe(0);
		// B's project create sends nothing (lib/fpt README, decision 1): nothing was written.
		expect(s.fpt.count((r) => r.method !== 'GET' && !r.path.endsWith('/_search'))).toBe(writes);
	});

	it('takes an edit made on another device, and never a slate or a take', async () => {
		const s = setup();
		await lists(s);
		await s.edit.create('shootDay', { id: 'd1', projectId: 'p1', shootDate: '2026-11-11' });
		await s.edit.create('slate', { id: 's1', shootDayId: 'd1', slateUID: '42A' });
		await settle(s.engine, s.fpt);
		const b = await second(s);
		await settle(b.engine, s.fpt);
		expect(await b.store.rows('slate')).toEqual([]);

		await b.edit.apply('lens', [{ id: 'l1', key: 'lensModel', from: 'S4/i 32mm', to: 'S4/i 32 mm T2' }]);
		await b.edit.apply('template', [{ id: 'tp1', key: 'values', from: { tStop: 2.8 }, to: { tStop: 4 } }]);
		await settle(b.engine, s.fpt);
		await settle(s.engine, s.fpt);
		expect((await s.store.get('lens', 'l1'))!.lensModel).toBe('S4/i 32 mm T2');
		expect((await s.store.get('template', 'tp1'))!.values).toEqual({ tStop: 4 });
		expect((await s.store.outbox.entries()).length).toBe(0);
	});

	it('never overwrites an edit made here and not yet synced: both edits of one field wait for a person', async () => {
		const s = setup();
		await lists(s);
		const b = await second(s);
		await settle(b.engine, s.fpt);
		await b.edit.apply('lens', [
			{ id: 'l1', key: 'lensModel', from: 'S4/i 32mm', to: 'Theirs' },
			{ id: 'l1', key: 'focalLength', from: 32, to: 35 }
		]);
		await settle(b.engine, s.fpt);
		// The model edited here too: it stays, and the focal length edited there only is taken.
		await s.edit.apply('lens', [{ id: 'l1', key: 'lensModel', from: 'S4/i 32mm', to: 'Mine' }]);
		await settle(s.engine, s.fpt);
		expect(await s.store.get('lens', 'l1')).toMatchObject({ lensModel: 'Mine', focalLength: 35 });
		const [waiting] = await s.store.outbox.entries();
		expect(waiting).toMatchObject({ state: 'needsAttention', attention: { reason: 'conflict' } });
	});

	it('removes here what another device removed, when nothing here uses it', async () => {
		const s = setup();
		await lists(s);
		const b = await second(s);
		await settle(b.engine, s.fpt);
		await b.edit.remove('lens', 'l2');
		await b.edit.remove('referenceKind', 'k1');
		await settle(b.engine, s.fpt);
		await settle(s.engine, s.fpt);
		expect(await ids(s.store, 'lens')).toEqual(['l1']);
		expect(await s.store.rows('referenceKind')).toEqual([]);
		expect(await s.store.remoteId('l2')).toBeUndefined();
		expect(s.engine.state.kept ?? []).toEqual([]);
	});

	it('keeps one used here, lists it, and sends it back so every device has it again', async () => {
		const s = setup();
		await lists(s);
		await s.edit.create('cameraSetup', { id: 'cs1', projectId: 'p1', cameraLabel: 'A', cameraId: 'c1', lensId: 'l1' });
		await settle(s.engine, s.fpt);
		const b = await second(s);
		await settle(b.engine, s.fpt);
		await b.edit.remove('lens', 'l1');
		await settle(b.engine, s.fpt);
		expect(s.fpt.byUuid('CustomEntity19', 'l1')).toBeUndefined();

		await settle(s.engine, s.fpt);
		expect(await s.store.get('lens', 'l1')).toBeDefined();
		expect(s.engine.state.kept).toEqual([{ table: 'lens', id: 'l1' }]);
		// Sent back as a new row under the same client UUID (findings/136), and the setup links it.
		await settle(s.engine, s.fpt);
		const row = s.fpt.byUuid('CustomEntity19', 'l1')!;
		expect(row.values.code).toBe('S4/i 32mm');
		expect(await s.store.remoteId('l1')).toBe(row.id);
		await settle(b.engine, s.fpt);
		expect(await b.store.get('lens', 'l1')).toBeDefined();
	});

	it('sends the templates and kinds a device kept before they were shared', async () => {
		const s = setup();
		await s.edit.create('project', { id: 'p1', name: 'Show' });
		await s.store.putRows('template', [{ id: 'tp0', projectId: 'p1', name: 'Older', scope: 'slate', values: {} }]);
		await linked(s);
		s.world.visible = true;
		await settle(s.engine, s.fpt);
		await settle(s.engine, s.fpt);
		const held = JSON.parse(String(s.fpt.rows.get(`Project:${s.fptProject}`)!.values.sg_onset_templates));
		expect(held.entries.map((e: { id: string }) => e.id)).toEqual(['tp0']);
	});

	// The Project fields are optional (#117's rule): without them templates and kinds wait, and the rest syncs.
	it('holds templates and kinds back on a site without the Project fields, and sends them once it is set up', async () => {
		const s = setup();
		delete s.fpt.fields.Project.sg_onset_templates;
		delete s.fpt.fields.Project.sg_onset_reference_kinds;
		await lists(s);
		expect(s.engine.state.listsMissing).toBe(true);
		const left = await s.store.outbox.entries();
		expect(left.map((e) => e.op.table).sort()).toEqual(['referenceKind', 'template']);
		expect(left.every((e) => e.state === 'pending' && e.attempts === 0)).toBe(true);
		expect(s.fpt.byUuid('CustomEntity19', 'l1')).toBeDefined();

		expect((await s.engine.check(true))?.ready).toBe(true);
		expect(s.engine.state.listsMissing).toBe(false);
		await settle(s.engine, s.fpt);
		expect(await s.store.outbox.entries()).toEqual([]);
		expect(s.fpt.rows.get(`Project:${s.fptProject}`)!.values.sg_onset_reference_kinds).toContain('Drone scan');
	});
});

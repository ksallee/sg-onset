// Sync through the app's wiring: the store and editor as the app opens them, the real runner, the
// real FPT transport, against the fake site of lib/fpt (corpus shapes). Nothing leaves the test.

import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import { setUpNames } from '$lib/fpt/setup';
import { memoryKeyValue } from '$lib/fpt/cache';
import { BEARER, fakeFpt, type FakeFpt } from '$lib/fpt/fakeFpt';
import { DEFAULT_NAMING, entityName, type Naming } from '$lib/fpt/naming';
import type { Page, PageEvent } from '$lib/outbox/foreground';
import type { DrainReport } from '$lib/outbox/runner';
import { leaveOff, setShooting, shootsWith, type Shooting } from '$lib/gear/shooting';
import { openStore, type DexieStore } from '$lib/store/dexieStore';
import { createEditor } from '../editor';
import { createSyncEngine, type SyncEngine } from './engine';
import { setupView } from './report';
import { nextStep, setupReview, type ReviewAction, type ReviewStep } from './review';
import { syncStatus } from './status';

const TAKE = 'CustomEntity09';
const SET_SHOT = 'CustomEntity22';
let n = 0;

function setup(options: { fields?: 'complete' | 'bare'; beforeDrain?: (store: DexieStore) => Promise<void>; origin?: string } = {}) {
	const fpt = fakeFpt(options);
	const fptProject = fpt.seed('Project', { name: 'Show', is_template: false, is_demo: false, archived: false });
	fpt.seed('Project', { name: 'Template', is_template: true, is_demo: false, archived: false });
	const other = fpt.seed('Project', { name: 'Other Show', is_template: false, is_demo: false, archived: false });
	return { fpt, fptProject, other, ...device(fpt, options) };
}

/** One device: its store, editor, page, session and sync engine, on the site given. */
function device(fpt: FakeFpt, options: { beforeDrain?: (store: DexieStore) => Promise<void>; origin?: string } = {}) {
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
	const schemaCache = memoryKeyValue();
	// The camera setups this device shoots with, as lib/gear/shooting.svelte keeps them (#110).
	const choice = { value: {} as Shooting };
	const shooting = { get: () => choice.value, leaveOff: (projectId: string, ids: readonly string[]) => (choice.value = leaveOff(choice.value, projectId, ids)) };
	const deps = {
		store,
		site: () => fpt.site,
		canSync: () => auth.token !== null,
		bearer,
		fetch: ((input, init) => fpt.fetch(input, init)) as typeof fetch,
		schemaCache,
		kv,
		page,
		shooting,
		...(options.beforeDrain ? { beforeDrain: () => options.beforeDrain!(store) } : {}),
		...(options.origin ? { origin: options.origin } : {})
	} satisfies Parameters<typeof createSyncEngine>[0];
	const engine = createSyncEngine(deps);
	/** The same device opened again: its store, its keys and its choice, a new engine. */
	const reopen = () => createSyncEngine(deps);
	return { store, edit, world, emit, auth, kv, schemaCache, engine, choice, reopen };
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

// #106: the Action Menu Item "Send set data to artists", for the linked Flow PT project, pointing at
// this deploy. Linking only looks; Set Up Fields adds it.
describe('the Action Menu Item', () => {
	const ORIGIN = 'https://onset.example';
	const items = (s: S) => s.fpt.live('ActionMenuItem');

	it('linking only looks for it; Set Up Fields adds it on Shot and Set Shot for the linked project', async () => {
		const s = setup({ origin: ORIGIN });
		await s.engine.setProject('p1');
		await s.engine.link({ id: s.fptProject, name: 'Show' });
		expect(s.engine.state.report?.action?.items.map((i) => [i.entityType, i.status])).toEqual([
			['Shot', 'missing'],
			[SET_SHOT, 'missing']
		]);
		expect(items(s)).toEqual([]);
		// Every field is there: Set Up Fields is offered for the item alone, and runs with no review.
		const view = setupView(s.engine.state.report!);
		expect(view.canSetUpFields).toBe(true);
		const review = setupReview(view, { site: s.fpt.site, project: 'Show' });
		expect(nextStep('closed', 'request', review)).toEqual({ step: 'closed', run: true });

		await s.engine.check(true);
		expect(s.engine.state.report?.action?.items.map((i) => i.status)).toEqual(['added', 'added']);
		expect(items(s).map((r) => [r.values.entity_type, r.values.url, r.values.projects])).toEqual([
			['Shot', `${ORIGIN}/action/send-set-data`, [{ type: 'Project', id: s.fptProject }]],
			[SET_SHOT, `${ORIGIN}/action/send-set-data`, [{ type: 'Project', id: s.fptProject }]]
		]);
	});

	it('nothing about it before a project is linked', async () => {
		const s = setup({ origin: ORIGIN });
		await s.engine.setProject('p1');
		await s.engine.check(false);
		expect(s.engine.state.report?.action).toBeUndefined();
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

describe('the Slates of a set reference (#107)', () => {
	const REFERENCE = 'CustomEntity21';
	const fptId = (s: S, type: string, uuid: string) => s.fpt.byUuid(type, uuid)!.id;
	const slatesOf = (s: S, uuid: string) => ((s.fpt.byUuid(REFERENCE, uuid)?.values.sg_slates as { id: number }[] | undefined) ?? []).map((r) => r.id).sort((a, b) => a - b);
	const ids = (s: S, ...uuids: string[]) => uuids.map((u) => fptId(s, 'Slate', u)).sort((a, b) => a - b);

	/** 12A and 12B on the stage's lighting, an HDRI and a lidar scan logged on 12A. */
	async function stage(s: S) {
		await s.edit.create('project', { id: 'p1', name: 'Show' });
		await s.edit.create('shootDay', { id: 'd1', projectId: 'p1', shootDate: '2026-11-11' });
		await s.edit.create('lightingSetup', { id: 'l1', projectId: 'p1', label: 'Stage' });
		await s.edit.create('lightingSetup', { id: 'l2', projectId: 'p1', label: 'Street' });
		await s.edit.create('slate', { id: 's1', shootDayId: 'd1', slateUID: '12A', lightingSetupId: 'l1' });
		await s.edit.create('slate', { id: 's2', shootDayId: 'd1', slateUID: '12B', lightingSetupId: 'l1' });
		await s.edit.create('reference', { id: 'r1', slateId: 's1', kind: 'hdri360', name: 'HDRI_0412', loggedAt: '2026-11-11T10:00:00.000Z' });
		await s.edit.create('reference', { id: 'r2', slateId: 's1', kind: 'lidarScan', name: 'Scan 01', loggedAt: '2026-11-11T10:01:00.000Z' });
	}

	it('links a lighting reference to every slate of its lighting setup, now or later; any other to its slate', async () => {
		const s = setup();
		await stage(s);
		await linked(s);
		s.world.visible = true;
		await settle(s.engine, s.fpt);
		expect(slatesOf(s, 'r1')).toEqual(ids(s, 's1', 's2'));
		expect(slatesOf(s, 'r2')).toEqual(ids(s, 's1'));
		// The slate it was logged on stays its Slate.
		expect(s.fpt.byUuid(REFERENCE, 'r1')!.values.sg_slate).toEqual({ type: 'Slate', id: fptId(s, 'Slate', 's1') });

		await s.edit.create('slate', { id: 's3', shootDayId: 'd1', slateUID: '12C', lightingSetupId: 'l1' });
		await settle(s.engine, s.fpt);
		expect(slatesOf(s, 'r1')).toEqual(ids(s, 's1', 's2', 's3'));

		// 12B moves to the street: taken off.
		await s.edit.set('slate', (await s.store.get('slate', 's2'))!, 'lightingSetupId', 'l2');
		await settle(s.engine, s.fpt);
		expect(slatesOf(s, 'r1')).toEqual(ids(s, 's1', 's3'));
	});

	// Kevin, #107: derived as a slate's Shots are (#102). Nothing is kept on the device.
	it('overwrites a slate linked by hand in Flow PT at the next sync, and keeps nothing on the device', async () => {
		const s = setup();
		await stage(s);
		await linked(s);
		s.world.visible = true;
		await settle(s.engine, s.fpt);
		const byHand = s.fpt.seed('Slate', { code: '99' });
		const row = s.fpt.byUuid(REFERENCE, 'r1')!;
		row.values.sg_slates = [...(row.values.sg_slates as object[]), { type: 'Slate', id: byHand }];
		await settle(s.engine, s.fpt);
		expect(slatesOf(s, 'r1')).toEqual(ids(s, 's1', 's2'));
		expect(await s.kv.get('referenceSlates:p1')).toBeUndefined();
	});

	it('removes the list an earlier build kept', async () => {
		const s = setup();
		await s.kv.set('referenceSlates:p1', '{"v":1,"refs":{}}');
		await s.engine.setProject('p1');
		expect(await s.kv.get('referenceSlates:p1')).toBeUndefined();
	});

	// Kevin, #117: Set Reference is optional. Without it the references and their slates wait on the
	// device, never dropped, and everything else syncs. Once an admin enables it and runs Set Up
	// Fields, they go up at the next sync, and the Note on the Shot adds them.
	it('keeps the references waiting on a site without Set Reference, syncs the rest, and sends them once it is set up', async () => {
		const s = setup();
		const slot = s.fpt.types.CustomEntity21;
		const own = s.fpt.fields.CustomEntity21;
		delete s.fpt.types.CustomEntity21;
		const project = { type: 'Project', id: s.fptProject };
		const shot = s.fpt.seed('Shot', { code: 'SMP_012_0010', project });
		const person = s.fpt.seed('HumanUser', { name: 'Ana' });
		s.fpt.seed('Task', { content: 'Comp', project, entity: { type: 'Shot', id: shot }, task_assignees: [{ type: 'HumanUser', id: person }] });
		await stage(s);
		await s.edit.set('slate', (await s.store.get('slate', 's1'))!, 'vfxShots', ['SMP_012_0010']);
		await s.edit.create('take', { id: 't1', slateId: 's1', take: '1' });
		await linked(s);
		await s.engine.setNotesOnShots(true);
		expect(s.engine.state.referencesMissing).toBe(true);
		expect(s.engine.state.setShotsMissing).toBe(false);
		s.world.visible = true;
		expect((await settle(s.engine, s.fpt)).stopped).toBe('idle');
		expect(s.fpt.byUuid('Slate', 's2')).toBeDefined();
		expect(s.fpt.byUuid(TAKE, 't1')).toBeDefined();
		// The references wait in the queue as they were: nothing sent, nothing for a person to fix.
		expect((await s.store.outbox.entries()).map((e) => [e.op.table, e.op.recordId, e.state])).toEqual([
			['reference', 'r1', 'pending'],
			['reference', 'r2', 'pending']
		]);
		expect(s.fpt.requests.some((r) => r.path.includes('custom_entity21'))).toBe(false);
		await vi.waitFor(() => expect(s.engine.state.waiting).toMatchObject({ entries: 2, records: 2 }));
		expect(s.engine.state.scoped?.entries).toBe(0);
		// Kevin, #117: the status names them, so nobody takes them for safe in Flow PT.
		const status = () => syncStatus({ auth: 'signed-in', linked: true, ready: true, online: true, unsynced: s.engine.state.scoped, waiting: s.engine.state.waiting?.entries });
		expect(status()).toMatchObject({ state: 'waiting', count: 2, key: 'sync.state.waiting' });
		// The Note on the Shot lists what Flow PT holds: no references yet.
		expect(s.fpt.live('Note')).toHaveLength(1);
		expect(s.fpt.live('Note')[0].values.content).not.toContain('References');

		// An admin enables the slot; Set Up Fields makes its fields.
		s.fpt.types.CustomEntity21 = slot;
		s.fpt.fields.CustomEntity21 = { code: own.code, project: own.project };
		expect((await s.engine.check(true))?.ready).toBe(true);
		expect(s.engine.state.referencesMissing).toBe(false);
		await settle(s.engine, s.fpt);
		expect(await s.store.outbox.entries()).toEqual([]);
		expect(s.fpt.byUuid(REFERENCE, 'r1')!.values.sg_slate).toEqual({ type: 'Slate', id: fptId(s, 'Slate', 's1') });
		expect(slatesOf(s, 'r1')).toEqual(ids(s, 's1', 's2'));
		expect(slatesOf(s, 'r2')).toEqual(ids(s, 's1'));
		await vi.waitFor(() => expect(s.engine.state.waiting?.entries ?? 0).toBe(0));
		expect(status().state).toBe('synced');
		expect(s.fpt.live('Note')).toHaveLength(1);
		expect(s.fpt.live('Note')[0].values.content).toContain('HDRI 360: HDRI_0412');
		expect(s.fpt.live('Reply').map((r) => r.values.content)).toEqual([['Added:', 'HDRI 360: HDRI_0412', 'Lidar scan: Scan 01'].join('\n')]);
	});

	it('writes again at a later sync what did not land', async () => {
		const s = setup();
		await stage(s);
		await linked(s);
		s.world.visible = true;
		// Every write of a reference's Slates fails during the first sync, from each drain's end that
		// runs then (a drain a store change started, too), and lands at a later one.
		const site = s.fpt.fetch;
		let failing = true;
		s.fpt.fetch = (async (input: RequestInfo | URL, init?: RequestInit) =>
			failing && init?.method === 'PUT' && String(input).includes('/api/v1/entity/custom_entity21s/') ? new Response('{}', { status: 503 }) : site(input, init)) as typeof fetch;
		await settle(s.engine, s.fpt);
		expect(slatesOf(s, 'r1')).toEqual([]);
		failing = false;
		await settle(s.engine, s.fpt);
		expect(slatesOf(s, 'r1')).toEqual(ids(s, 's1', 's2'));
		expect(slatesOf(s, 'r2')).toEqual(ids(s, 's1'));
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
		expect(note.values.content).toContain('42A: 1');

		await later(s);
		expect(s.fpt.live('Reply')).toEqual([]);

		await s.edit.create('take', { id: 't2', slateId: 's1', take: '2', takeType: 'cleanPlate' });
		await later(s);
		expect(notes(s)).toHaveLength(1);
		expect(notes(s)[0].values.content).toContain('42A: 1, 2');
		expect(s.fpt.live('Reply').map((r) => [r.values.entity, r.values.content])).toEqual([[{ type: 'Note', id: note.id }, 'Added:\nClean plate: 42A take 2']]);
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

// #111: the names an admin picked. The schema kept on the device holds them: the check keeps them,
// the transport writes under them, and the sheet names the entities to enable by them.
describe('the names an admin picked (#111)', () => {
	const naming: Naming = { entities: { take: 'Shot Take', reference: 'Set Ref', setShot: 'Shot Code' }, fields: { 'take.sg_t_stop': { display: 'Studio T-Stop' }, 'take.sg_photos': { display: 'Stills' } } };

	it('syncs under the names the project keeps, saved from another device, and names the entities to enable by them', async () => {
		const s = setup({ fields: 'bare' });
		s.fpt.types.CustomEntity09 = { name: { value: 'Shot Take' } };
		delete s.fpt.types.CustomEntity21;
		delete s.fpt.types.CustomEntity22;
		expect(s.engine.state.naming).toEqual(DEFAULT_NAMING);
		// An admin saves the names on another device: this one has nothing kept.
		const { names, report } = await setUpNames({ site: s.fpt.site, bearer: async () => BEARER, fetch: s.fpt.fetch, schemaCache: memoryKeyValue(), projectId: s.fptProject, naming, createFields: true });
		expect(names).toBe('saved');
		expect(report.ready).toBe(true);
		await shoot(s);
		await linked(s);
		expect(s.engine.state.naming).toEqual(naming);
		expect(s.engine.state.referencesMissing).toBe(true);
		expect(s.engine.state.setShotsMissing).toBe(true);
		expect(entityName(s.engine.state.naming, 'reference')).toBe('Set Ref');
		s.world.visible = true;
		expect((await settle(s.engine, s.fpt)).stopped).toBe('idle');
		const take = s.fpt.byUuid(TAKE, 't1')!;
		expect(take.values).toMatchObject({ code: '1', sg_studio_t_stop: 2.8 });
		expect((take.values.sg_stills as { id: number }[]).length).toBe(1);
		expect(take.values.sg_t_stop).toBeUndefined();
		expect(s.fpt.fields[TAKE].sg_photos).toBeUndefined();
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
		await s.edit.create('shootDay', { id: 'd1', projectId: 'p1', shootDate: '2026-11-11' });
		await s.edit.create('slate', { id: 's1', shootDayId: 'd1', slateUID: '42A' });
		await s.edit.create('take', { id: 't1', slateId: 's1', take: '1', lensId: 'l1' });
		await settle(s.engine, s.fpt);
		const b = await second(s);
		await settle(b.engine, s.fpt);
		await b.edit.remove('lens', 'l1');
		await settle(b.engine, s.fpt);
		expect(s.fpt.byUuid('CustomEntity19', 'l1')).toBeUndefined();

		await settle(s.engine, s.fpt);
		expect(await s.store.get('lens', 'l1')).toBeDefined();
		expect(s.engine.state.kept).toEqual([{ table: 'lens', id: 'l1' }]);
		// Sent back as a new row under the same client UUID (findings/136), and the take links it.
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

// Kevin, #110: camera setups are shared too, and each device chooses the ones it shoots with; a
// change read back of an entry this device uses is listed until seen.
describe('the shared camera setups', () => {
	type D = ReturnType<typeof device>;

	async function second(s: S): Promise<D> {
		const b = device(s.fpt);
		await b.edit.create('project', { id: 'pB', name: 'Show on B' });
		await b.engine.setProject('pB');
		expect(await b.engine.link({ id: s.fptProject, name: 'Show' })).toBe('linked');
		b.world.visible = true;
		return b;
	}

	async function gear(s: S) {
		await s.edit.create('project', { id: 'p1', name: 'Show' });
		await s.edit.create('camera', { id: 'c1', projectId: 'p1', cameraModel: 'Alexa 35' });
		await s.edit.create('lens', { id: 'l1', projectId: 'p1', lensModel: 'S4/i 32mm', focalLength: 32 });
		await s.edit.create('lens', { id: 'l2', projectId: 'p1', lensModel: 'Supreme 50mm', focalLength: 50 });
		await s.edit.create('cameraSetup', { id: 'csA', projectId: 'p1', cameraLabel: 'A', cameraId: 'c1', lensId: 'l1' });
		await linked(s);
		s.world.visible = true;
		await settle(s.engine, s.fpt);
	}

	it('gives every device every setup, and a setup made on another device starts unchosen', async () => {
		const s = setup();
		await gear(s);
		const b = await second(s);
		await settle(b.engine, s.fpt);
		expect(await b.store.get('cameraSetup', 'csA')).toEqual({ id: 'csA', projectId: 'pB', cameraLabel: 'A', cameraId: 'c1', lensId: 'l1' });
		expect(shootsWith(b.choice.value, 'pB', 'csA')).toBe(false);

		// B makes its own: B shoots with it, A sees it and does not.
		await b.edit.create('cameraSetup', { id: 'csB', projectId: 'pB', cameraLabel: 'B', cameraId: 'c1', lensId: 'l2' });
		await settle(b.engine, s.fpt);
		expect(shootsWith(b.choice.value, 'pB', 'csB')).toBe(true);
		await settle(s.engine, s.fpt);
		expect(await s.store.get('cameraSetup', 'csB')).toBeDefined();
		expect(shootsWith(s.choice.value, 'p1', 'csB')).toBe(false);
		expect(shootsWith(s.choice.value, 'p1', 'csA')).toBe(true);
	});

	it('keeps a setup this device shoots with when another device removes it, and sends it back', async () => {
		const s = setup();
		await gear(s);
		const b = await second(s);
		await settle(b.engine, s.fpt);
		await b.edit.remove('cameraSetup', 'csA');
		await settle(b.engine, s.fpt);
		await settle(s.engine, s.fpt);
		expect(await s.store.get('cameraSetup', 'csA')).toBeDefined();
		expect(s.engine.state.kept).toEqual([{ table: 'cameraSetup', id: 'csA' }]);

		// One B does not shoot with, and A does not either, goes.
		await s.edit.create('cameraSetup', { id: 'csC', projectId: 'p1', cameraLabel: 'C' });
		s.choice.value = setShooting(s.choice.value, 'p1', 'csC', false);
		await settle(s.engine, s.fpt);
		await settle(b.engine, s.fpt);
		await b.edit.remove('cameraSetup', 'csC');
		await settle(b.engine, s.fpt);
		await settle(s.engine, s.fpt);
		expect(await s.store.get('cameraSetup', 'csC')).toBeUndefined();
	});

	// findings/161: Flow PT reads a link to a deleted row as none, and refuses any write naming one.
	// The lens sent back is a new row under the same client UUID: the synced takes and the setup that
	// hold it are written again with its new id, never the old one.
	it('links the synced takes and setup again to the new row of a lens another device deleted', async () => {
		const s = setup();
		await gear(s);
		await s.edit.create('shootDay', { id: 'd1', projectId: 'p1', shootDate: '2026-11-11' });
		await s.edit.create('slate', { id: 's1', shootDayId: 'd1', slateUID: '42A' });
		await s.edit.create('take', { id: 't1', slateId: 's1', take: '1', cameraSetupId: 'csA', cameraId: 'c1', lensId: 'l1' });
		await s.edit.create('take', { id: 't2', slateId: 's1', take: '2', cameraSetupId: 'csA', cameraId: 'c1', lensId: 'l1' });
		await settle(s.engine, s.fpt);
		const old = s.fpt.byUuid('CustomEntity19', 'l1')!.id;
		expect(s.fpt.byUuid(TAKE, 't1')!.values.sg_lens).toEqual({ type: 'CustomEntity19', id: old });

		// B deletes the lens. Gear takes it off B's copy of the setup too, as one edit.
		const b = await second(s);
		await settle(b.engine, s.fpt);
		await b.edit.apply('cameraSetup', [{ id: 'csA', key: 'lensId', from: 'l1', to: undefined }]);
		await b.edit.remove('lens', 'l1');
		await settle(b.engine, s.fpt);
		expect(s.fpt.byUuid('CustomEntity19', 'l1')).toBeUndefined();

		// A: the lens is used by its takes, so it is kept and sent back, and every link to it written again.
		await settle(s.engine, s.fpt);
		await settle(s.engine, s.fpt);
		const fresh = s.fpt.byUuid('CustomEntity19', 'l1')!;
		expect(fresh.id).not.toBe(old);
		expect(s.fpt.byUuid(TAKE, 't1')!.values.sg_lens).toEqual({ type: 'CustomEntity19', id: fresh.id });
		expect(s.fpt.byUuid(TAKE, 't2')!.values.sg_lens).toEqual({ type: 'CustomEntity19', id: fresh.id });
		expect(await s.store.remoteId('l1')).toBe(fresh.id);
		expect(await s.store.outbox.entries()).toEqual([]);
		// The setup follows Flow PT (Kevin, #110): B took the lens off it, so it holds none here either,
		// and the change is listed. Only the takes, history, keep the lens.
		expect((await s.store.get('cameraSetup', 'csA'))!.lensId).toBeUndefined();
		expect(s.fpt.byUuid('CustomEntity10', 'csA')!.values.sg_lens).toBeNull();
		expect(s.engine.state.changed.map((c) => [c.table, c.id, c.keys])).toContainEqual(['cameraSetup', 'csA', ['lensId']]);
		await settle(b.engine, s.fpt);
		expect(await b.store.get('lens', 'l1')).toBeDefined();
		expect((await b.store.get('cameraSetup', 'csA'))!.lensId).toBeUndefined();
	});

	// Deleted by hand in Flow PT: the setup's link reads as none (findings/161), and the setup follows
	// what the person did (Kevin, #110). A lens nothing else uses here is gone too.
	it('takes the empty lens of a setup whose lens was deleted in Flow PT, lists it, and keeps no unused lens', async () => {
		const s = setup();
		await gear(s);
		s.fpt.rows.get(`CustomEntity19:${s.fpt.byUuid('CustomEntity19', 'l1')!.id}`)!.retired = true;
		await settle(s.engine, s.fpt);
		expect((await s.store.get('cameraSetup', 'csA'))!.lensId).toBeUndefined();
		expect(s.engine.state.changed.map((c) => [c.table, c.id, c.keys])).toEqual([['cameraSetup', 'csA', ['lensId']]]);
		expect(await s.store.get('lens', 'l1')).toBeUndefined();
		expect(await s.store.outbox.entries()).toEqual([]);
	});

	it('lists a change made on another device of an entry used here, until it is seen, across a reload', async () => {
		const s = setup();
		await gear(s);
		const b = await second(s);
		await settle(b.engine, s.fpt);
		// B swaps the lens on A's setup to the second lens, and changes both lenses.
		await b.edit.apply('cameraSetup', [{ id: 'csA', key: 'lensId', from: 'l1', to: 'l2' }]);
		await b.edit.apply('lens', [
			{ id: 'l1', key: 'focalLength', from: 32, to: 35 },
			{ id: 'l2', key: 'lensModel', from: 'Supreme 50mm', to: 'Supreme 50' }
		]);
		await settle(b.engine, s.fpt);
		expect(b.engine.state.changed).toEqual([]);

		await settle(s.engine, s.fpt);
		expect((await s.store.get('cameraSetup', 'csA'))!.lensId).toBe('l2');
		// The setups merge first, so the second lens is the one A's setup uses when the lenses merge: its
		// change is listed, the first lens's is not. Newest first.
		expect(s.engine.state.changed.map((c) => [c.table, c.id, c.keys])).toEqual([
			['lens', 'l2', ['lensModel']],
			['cameraSetup', 'csA', ['lensId']]
		]);

		const again = s.reopen();
		await again.setProject('p1');
		expect(again.state.changed).toHaveLength(2);
		await again.seenChanged('cameraSetup', 'csA');
		expect(again.state.changed.map((c) => c.id)).toEqual(['l2']);
		const third = s.reopen();
		await third.setProject('p1');
		expect(third.state.changed.map((c) => c.id)).toEqual(['l2']);
		again.dispose();
		third.dispose();
	});
});

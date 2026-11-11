// Sync through the app's wiring: the store and editor as the app opens them, the real runner, the
// real FPT transport, against the fake site of lib/fpt (corpus shapes). Nothing leaves the test.

import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { memoryKeyValue } from '$lib/fpt/cache';
import { BEARER, fakeFpt, type FakeFpt } from '$lib/fpt/fakeFpt';
import type { Page, PageEvent } from '$lib/outbox/foreground';
import type { DrainReport } from '$lib/outbox/runner';
import { openStore } from '$lib/store/dexieStore';
import { createEditor } from '../editor';
import { createSyncEngine, type SyncEngine } from './engine';
import { setupView } from './report';
import { nextStep, setupReview, type ReviewAction, type ReviewStep } from './review';
import { syncStatus } from './status';

const TAKE = 'CustomEntity09';
let n = 0;

function setup(options: { fields?: 'complete' | 'bare' } = {}) {
	const fpt = fakeFpt(options);
	const fptProject = fpt.seed('Project', { name: 'Show', is_template: false, is_demo: false, archived: false });
	fpt.seed('Project', { name: 'Template', is_template: true, is_demo: false, archived: false });
	const other = fpt.seed('Project', { name: 'Other Show', is_template: false, is_demo: false, archived: false });

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

	const engine = createSyncEngine({
		store,
		site: () => fpt.site,
		canSync: () => auth.token !== null,
		bearer,
		fetch: ((input, init) => fpt.fetch(input, init)) as typeof fetch,
		schemaCache: memoryKeyValue(),
		kv: memoryKeyValue(),
		page
	});
	return { fpt, fptProject, other, store, edit, world, emit, auth, engine };
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

// Sync, wired: the project link, the setup check and the runner, for the current project. The
// edge: it calls FPT, the store and the key-value port. No runes here, so the integration test
// drives it as the app does; `controller.svelte.ts` wraps it for the UI.
//
// The runner runs only when all hold: a project is current, the person is signed in, the project
// is linked to an FPT project on that site, and the site passed the setup check. It stops when
// any stops holding, and when the page is hidden (`runInForeground`). Capture never waits on it:
// the store and the editor never call here.
//
// The Shots of a slate are linked by the transport as the slate's codes sync. What is owed on the
// field (codes no Shot has yet, codes several Shots share, unlinks not made) is kept on the device
// per project (shots.ts), and made when a drain ends: at most once a minute, at once on Sync Now.
//
// The Slates field of each set reference (#107) is brought in line with the slates it shows on
// when a drain ends: what the device last wrote there is kept per project (referenceSlates.ts). A
// write that failed is tried again a minute later, at once on Sync Now.

import { checkSetup, createFptTransport, readShotCodes, type FptTransport, type KeyValue, type SetupReport, type ShotResult } from '$lib/fpt';
import { createApi, type FptOptions } from '$lib/fpt/api';
import { resolutionKey } from '$lib/fpt/cache';
import { parseResolution } from '$lib/fpt/schema';
import { browserEnv, runInForeground, type Foreground, type Page } from '$lib/outbox/foreground';
import { createRunner, type DrainReport, type Progress, type Runner, type StopReason } from '$lib/outbox/runner';
import { unsynced, type Unsynced } from '$lib/outbox/select';
import type { DexieStore } from '$lib/store/dexieStore';
import { syncError, type SyncError } from './errors';
import { linkOn, linkProblem, type ProjectLink } from './link';
import { linkStore, type LinkStore } from './links';
import { PROJECT_FILTER, projectChoices, type ProjectChoice } from './projects';
import { afterWrites, parseLinked, planReferenceSlates, referenceSlatesKey, serializeLinked } from './referenceSlates';
import { projectScope, type ProjectScope } from './scope';
import { CODES_MS, mergeOwed, parseOwed, pruneOwed, retryDue, retryItems, serializeOwed, shotsKey, type Owed } from './shots';

export interface SyncDeps {
	store: Pick<DexieStore, 'get' | 'list' | 'rows' | 'outbox' | 'remoteId' | 'subscribe'> & { snapshots: Pick<DexieStore['snapshots'], 'markOffDevice'> };
	/** The signed-in site, or null. */
	site(): string | null;
	/** A live session (`auth.canSync`). */
	canSync(): boolean;
	/** `{ renew: true }`: a new bearer, not the one held (lib/fpt/api.ts, corpus findings/133). */
	bearer(request?: { renew?: boolean }): Promise<string>;
	fetch?: typeof fetch;
	/** The site's resolved schema (lib/fpt/cache.ts). */
	schemaCache: KeyValue;
	/** Project links and last sync times. */
	kv: KeyValue;
	page: Page;
}

export interface SyncState {
	projectId?: string;
	/** The link of the current project, on the signed-in site. */
	link?: ProjectLink;
	/** The site passed the setup check: its resolution is kept on the device. */
	ready: boolean;
	/** The last setup report, this session. */
	report?: SetupReport;
	checking: boolean;
	creatingFields: boolean;
	running: boolean;
	phase?: Progress['phase'];
	/** Why the last drain ended. */
	stopped?: StopReason;
	upload?: Progress['upload'];
	lastSyncAt?: number;
	online: boolean;
	/** The current project's share of the queue. */
	scoped?: Unsynced;
	/** What is owed on the Shots field of the current project's slates, by slate id. */
	shots?: Owed;
	error?: SyncError;
}

export interface SyncEngine {
	readonly state: SyncState;
	/** `fn` on every change of the state. Returns the unsubscribe. */
	subscribe(fn: (state: SyncState) => void): () => void;
	/** The current project changed. */
	setProject(projectId: string | undefined): Promise<void>;
	/** The account changed: reads the link and the setup again, starts or stops the runner. */
	refresh(): Promise<void>;
	listProjects(): Promise<ProjectChoice[]>;
	link(choice: ProjectChoice): Promise<'linked' | 'otherProject'>;
	unlink(): Promise<void>;
	/** `checkSetup`. Fields are created only with `createFields`. */
	check(createFields?: boolean): Promise<SetupReport | undefined>;
	/** Drains now. Undefined when the runner may not run. */
	syncNow(): Promise<DrainReport | undefined>;
	/**
	 * The Shot codes of the linked FPT project, for the slate's VFX shots field. None without a
	 * link, a session or a network: the field is free text then. Kept a few minutes.
	 */
	shotCodes(): Promise<string[]>;
	dispose(): void;
}

const lastKey = (projectId: string) => `last:${projectId}`;

export function createSyncEngine(deps: SyncDeps): SyncEngine {
	const links: LinkStore = linkStore(deps.kv);
	const listeners = new Set<(state: SyncState) => void>();
	let state: SyncState = { ready: false, checking: false, creatingFields: false, running: false, online: deps.page.online() };
	let disposed = false;

	type Live = { key: string; runner: Runner; foreground: Foreground; drain(asked: boolean): Promise<DrainReport> };
	let live: Live | undefined;
	let scope: { projectId: string; scope: ProjectScope } | undefined;

	function set(patch: Partial<SyncState>): void {
		state = { ...state, ...patch };
		for (const fn of [...listeners]) fn(state);
	}

	const fptOptions = (site: string): FptOptions => ({
		site,
		bearer: deps.bearer,
		schemaCache: deps.schemaCache,
		online: deps.page.online,
		...(deps.fetch ? { fetch: deps.fetch } : {})
	});

	function scopeOf(projectId: string): ProjectScope {
		if (scope?.projectId !== projectId) scope = { projectId, scope: projectScope(deps.store, projectId) };
		return scope.scope;
	}

	// The current project's share of the queue, again after every change of the queue.
	let counting: Promise<void> = Promise.resolve();
	function recount(): void {
		const projectId = state.projectId;
		counting = counting.then(async () => {
			if (!projectId || disposed) return;
			const entries = await scopeOf(projectId).port.entries();
			if (state.projectId === projectId) set({ scoped: unsynced(entries) });
		});
	}

	const offStore = deps.store.subscribe((event) => {
		if (!event.tables.includes('outbox')) return;
		recount();
		live?.foreground.kick();
	});
	const offPage = [
		deps.page.listen('online', () => set({ online: true })),
		deps.page.listen('offline', () => set({ online: false }))
	];

	async function readReady(site: string | null): Promise<boolean> {
		if (!site) return false;
		return parseResolution(await deps.schemaCache.get(resolutionKey(site)), site) !== undefined;
	}

	function stopRunner(): void {
		if (!live) return;
		live.foreground();
		live.runner.stop();
		live = undefined;
		set({ running: false, phase: undefined, upload: undefined });
	}

	// ------------------------------------------------------------------ the Shots of slates

	/** One write of the list at a time: each reads what the last one wrote. */
	let shotWrites: Promise<void> = Promise.resolve();
	function recordShots(projectId: string, results: readonly ShotResult[]): Promise<void> {
		shotWrites = shotWrites
			.then(async () => {
				const next = mergeOwed(parseOwed(await deps.kv.get(shotsKey(projectId))), results);
				if (Object.keys(next).length) await deps.kv.set(shotsKey(projectId), serializeOwed(next));
				else await deps.kv.delete(shotsKey(projectId));
				if (state.projectId === projectId) set({ shots: next });
			})
			.catch(() => undefined);
		return shotWrites;
	}

	/** When each project last made what it owed. */
	const askedAt = new Map<string, number>();
	let retrying: Promise<void> = Promise.resolve();

	/** Makes what is owed, for the slates Flow PT holds. Never throws. */
	function retryShots(projectId: string, transport: FptTransport, asked: boolean): Promise<void> {
		retrying = retrying.then(async () => {
			try {
				const owed = parseOwed(await deps.kv.get(shotsKey(projectId)));
				const ids = Object.keys(owed);
				if (!ids.length || !retryDue(askedAt.get(projectId), deps.page.now(), asked)) return;
				askedAt.set(projectId, deps.page.now());
				const slates = (await Promise.all(ids.map((id) => deps.store.get('slate', id)))).filter((s) => s !== undefined) as { id: string; vfxShots?: string[] }[];
				const remoteIds = Object.fromEntries(await Promise.all(slates.map(async (s) => [s.id, await deps.store.remoteId(s.id)] as const)));
				const pruned = pruneOwed(owed, slates);
				const items = retryItems(pruned, slates, remoteIds);
				const made = items.length ? await transport.linkShots(items) : [];
				// A slate gone, or a code changed since, leaves the list; the transport has the last word on the rest.
				const nothing = { waiting: [], several: [], unlink: [] };
				await recordShots(projectId, [...ids.map((slate) => ({ slate, ...(pruned[slate] ?? nothing) })), ...made]);
			} catch {
				// The next drain asks again.
			}
		});
		return retrying;
	}

	// ------------------------------------------------------------------ the Slates of set references

	/** When a reference's write last failed: tried again after a minute, at once on Sync Now. */
	const slatesFailedAt = new Map<string, number>();
	let linkingSlates: Promise<void> = Promise.resolve();

	/** Brings each set reference's Slates field in line with the slates it shows on. Never throws. */
	function linkReferenceSlates(projectId: string, transport: FptTransport, asked: boolean): Promise<void> {
		linkingSlates = linkingSlates.then(async () => {
			try {
				const key = referenceSlatesKey(projectId);
				const kept = await deps.kv.get(key);
				const before = parseLinked(kept);
				const dayIds = new Set((await deps.store.list('shootDay', projectId)).map((d) => d.id));
				const slates = (await deps.store.list('slate')).filter((s) => dayIds.has(s.shootDayId));
				const slateIds = new Set(slates.map((s) => s.id));
				const refs = (await deps.store.list('reference')).filter((r) => slateIds.has(r.slateId));
				if (!refs.length && !Object.keys(before).length) return;
				const remoteIds = await deps.store.outbox.remoteIds([...slates, ...refs].map((r) => r.id));
				const plan = planReferenceSlates(refs, slates, remoteIds, before);
				const now = deps.page.now();
				const due = plan.work.filter((w) => retryDue(slatesFailedAt.get(w.reference), now, asked));
				const failed = new Set(await transport.linkReferenceSlates(due));
				for (const w of due) {
					if (failed.has(w.reference)) slatesFailedAt.set(w.reference, now);
					else slatesFailedAt.delete(w.reference);
				}
				const waiting = plan.work.filter((w) => !due.includes(w)).map((w) => w.reference);
				const next = afterWrites(plan, before, [...failed, ...waiting]);
				if (!Object.keys(next).length) await deps.kv.delete(key);
				else if (serializeLinked(next) !== kept) await deps.kv.set(key, serializeLinked(next));
			} catch {
				// The next drain works it out again.
			}
		});
		return linkingSlates;
	}

	let codes: { key: string; at: number; codes: string[] } | undefined;

	async function onReport(projectId: string, report: DrainReport): Promise<void> {
		const patch: Partial<SyncState> = { stopped: report.stopped, phase: 'stopped', upload: undefined };
		// The drain reached FPT and nothing was left it could move: that is a sync.
		if (report.stopped === 'idle' || report.stopped === 'waiting') {
			const at = deps.page.now();
			patch.lastSyncAt = at;
			await deps.kv.set(lastKey(projectId), String(at));
		}
		// Nothing left at all: everything is on Flow PT, a copy off the device. The store checks the
		// whole queue, other projects too, and marks nothing while any entry waits. A mark that fails
		// is no sync error: the next drain marks it.
		if (report.stopped === 'idle' && report.unsynced.entries === 0) await deps.store.snapshots.markOffDevice('sync', deps.page.now()).catch(() => false);
		if (state.projectId === projectId) set(patch);
	}

	/** Starts, keeps or stops the runner, as the state now says. */
	function align(): void {
		const site = deps.site();
		const { projectId, link, ready } = state;
		const allowed = !disposed && !!projectId && !!site && !!link && ready && deps.canSync();
		const key = allowed ? `${site}|${projectId}|${link!.projectId}` : '';
		if (live && live.key === key) return;
		stopRunner();
		if (!allowed) return;
		const runScope = scopeOf(projectId!);
		const transport = createFptTransport({
			...fptOptions(site!),
			projectId: link!.projectId,
			now: deps.page.now,
			onShots: (results) => recordShots(projectId!, results)
		});
		const runner = createRunner({
			port: runScope.port,
			transport,
			env: browserEnv(deps.page),
			onProgress: (p) => {
				if (state.projectId !== projectId) return;
				if (p.phase === 'stopped') return;
				set({ phase: p.phase, upload: p.upload, scoped: p.unsynced, error: undefined });
			}
		});
		// Each drain's end: wrap `drain` so every caller, the foreground included, reports. `asked`:
		// a person tapped Sync Now, so the waiting Shot codes are asked about at once.
		const drain = runner.drain.bind(runner);
		const reported = (asked: boolean) =>
			drain().then(
				async (report) => {
					await onReport(projectId!, report);
					if (report.stopped === 'idle' || report.stopped === 'waiting') {
						await retryShots(projectId!, transport, asked);
						await linkReferenceSlates(projectId!, transport, asked);
					}
					return report;
				},
				(error) => {
					set({ error: syncError(error), phase: 'stopped' });
					throw error;
				}
			);
		const reporting: Runner = {
			drain: () => reported(false),
			stop: () => runner.stop(),
			get running() {
				return runner.running;
			}
		};
		const foreground = runInForeground(reporting, deps.page);
		live = { key, runner: reporting, foreground, drain: reported };
		set({ running: true, error: undefined });
	}

	async function load(): Promise<void> {
		const site = deps.site();
		const projectId = state.projectId;
		const stored = projectId ? await links.get(projectId) : undefined;
		const ready = await readReady(site);
		const last = projectId ? Number(await deps.kv.get(lastKey(projectId))) : NaN;
		const shots = projectId ? parseOwed(await deps.kv.get(shotsKey(projectId))) : undefined;
		if (state.projectId !== projectId) return;
		set({
			link: linkOn(stored, site),
			ready,
			shots,
			lastSyncAt: Number.isFinite(last) && last > 0 ? last : undefined,
			...(state.report && state.report.site !== site ? { report: undefined } : {})
		});
		align();
	}

	const engine: SyncEngine = {
		get state() {
			return state;
		},
		subscribe(fn) {
			listeners.add(fn);
			return () => listeners.delete(fn);
		},
		async setProject(projectId) {
			if (state.projectId === projectId) return load();
			stopRunner();
			set({ projectId, link: undefined, scoped: undefined, shots: undefined, stopped: undefined, lastSyncAt: undefined, error: undefined });
			recount();
			await load();
		},
		refresh: load,
		async listProjects() {
			const site = deps.site();
			if (!site) return [];
			const rows = await createApi(fptOptions(site)).search('Project', PROJECT_FILTER, ['name'], 500);
			return projectChoices(rows);
		},
		async link(choice) {
			const site = deps.site();
			const projectId = state.projectId;
			if (!site || !projectId) return 'otherProject';
			if (linkProblem(await deps.store.remoteId(projectId), choice.id)) return 'otherProject';
			const link: ProjectLink = { site, projectId: choice.id, name: choice.name };
			await links.set(projectId, link);
			await load();
			// Linking runs the check, which only reads: fields are made on Set Up Fields alone.
			await engine.check(false);
			return 'linked';
		},
		async unlink() {
			const projectId = state.projectId;
			if (!projectId) return;
			await links.remove(projectId);
			stopRunner();
			await load();
		},
		async check(createFields = false) {
			const site = deps.site();
			if (!site || state.checking) return undefined;
			set({ checking: true, creatingFields: createFields, error: undefined });
			try {
				const report = await checkSetup({ ...fptOptions(site), createFields });
				set({ report, ready: report.ready });
				align();
				return report;
			} catch (error) {
				set({ error: syncError(error) });
				return undefined;
			} finally {
				set({ checking: false, creatingFields: false });
			}
		},
		async syncNow() {
			if (!live) return undefined;
			return live.drain(true);
		},
		async shotCodes() {
			const site = deps.site();
			const link = state.link;
			if (!site || !link || !deps.canSync() || !deps.page.online()) return [];
			const key = `${site}|${link.projectId}`;
			const now = deps.page.now();
			if (codes?.key === key && now - codes.at < CODES_MS) return codes.codes;
			try {
				codes = { key, at: now, codes: await readShotCodes(fptOptions(site), link.projectId) };
				return codes.codes;
			} catch {
				return codes?.key === key ? codes.codes : [];
			}
		},
		dispose() {
			disposed = true;
			stopRunner();
			offStore();
			for (const off of offPage) off();
			listeners.clear();
		}
	};
	return engine;
}

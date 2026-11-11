// Sync, wired: the project link, the setup check and the runner, for the current project. The
// edge: it calls FPT, the store and the key-value port. No runes here, so the integration test
// drives it as the app does; `controller.svelte.ts` wraps it for the UI.
//
// The runner runs only when all hold: a project is current, the person is signed in, the project
// is linked to an FPT project on that site, and the site passed the setup check. It stops when
// any stops holding, and when the page is hidden (`runInForeground`). Capture never waits on it:
// the store and the editor never call here.

import { checkSetup, createFptTransport, type KeyValue, type SetupReport } from '$lib/fpt';
import { createApi, type FptOptions } from '$lib/fpt/api';
import { resolutionKey } from '$lib/fpt/cache';
import { parseResolution } from '$lib/fpt/schema';
import { browserEnv, runInForeground, type Foreground, type Page } from '$lib/outbox/foreground';
import { createRunner, type DrainReport, type Progress, type Runner, type StopReason } from '$lib/outbox/runner';
import { unsynced, type Unsynced } from '$lib/outbox/select';
import { TransportError, type TransportErrorKind } from '$lib/outbox/transport';
import type { DexieStore } from '$lib/store/dexieStore';
import { linkOn, linkProblem, type ProjectLink } from './link';
import { linkStore, type LinkStore } from './links';
import { PROJECT_FILTER, projectChoices, type ProjectChoice } from './projects';
import { projectScope, type ProjectScope } from './scope';

export interface SyncDeps {
	store: Pick<DexieStore, 'get' | 'rows' | 'outbox' | 'remoteId' | 'subscribe'>;
	/** The signed-in site, or null. */
	site(): string | null;
	/** A live session (`auth.canSync`). */
	canSync(): boolean;
	bearer(): Promise<string>;
	fetch?: typeof fetch;
	/** The site's resolved schema (lib/fpt/cache.ts). */
	schemaCache: KeyValue;
	/** Project links and last sync times. */
	kv: KeyValue;
	page: Page;
}

/** Why a call to FPT did not answer, or what it refused. */
export type SyncError = { kind: TransportErrorKind | 'refused'; message?: string };

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
	dispose(): void;
}

const lastKey = (projectId: string) => `last:${projectId}`;

function errorOf(error: unknown): SyncError {
	if (error instanceof TransportError) return { kind: error.kind, message: error.message };
	return { kind: 'refused', message: error instanceof Error ? error.message : String(error) };
}

export function createSyncEngine(deps: SyncDeps): SyncEngine {
	const links: LinkStore = linkStore(deps.kv);
	const listeners = new Set<(state: SyncState) => void>();
	let state: SyncState = { ready: false, checking: false, creatingFields: false, running: false, online: deps.page.online() };
	let disposed = false;

	type Live = { key: string; runner: Runner; foreground: Foreground };
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

	async function onReport(projectId: string, report: DrainReport): Promise<void> {
		const patch: Partial<SyncState> = { stopped: report.stopped, phase: 'stopped', upload: undefined };
		// The drain reached FPT and nothing was left it could move: that is a sync.
		if (report.stopped === 'idle' || report.stopped === 'waiting') {
			const at = deps.page.now();
			patch.lastSyncAt = at;
			await deps.kv.set(lastKey(projectId), String(at));
		}
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
		const transport = createFptTransport({ ...fptOptions(site!), projectId: link!.projectId, now: deps.page.now });
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
		// Each drain's end: wrap `drain` so every caller, the foreground included, reports.
		const drain = runner.drain.bind(runner);
		const reporting: Runner = {
			drain: () =>
				drain().then(
					async (report) => {
						await onReport(projectId!, report);
						return report;
					},
					(error) => {
						set({ error: errorOf(error), phase: 'stopped' });
						throw error;
					}
				),
			stop: () => runner.stop(),
			get running() {
				return runner.running;
			}
		};
		const foreground = runInForeground(reporting, deps.page);
		live = { key, runner: reporting, foreground };
		set({ running: true, error: undefined });
	}

	async function load(): Promise<void> {
		const site = deps.site();
		const projectId = state.projectId;
		const stored = projectId ? await links.get(projectId) : undefined;
		const ready = await readReady(site);
		const last = projectId ? Number(await deps.kv.get(lastKey(projectId))) : NaN;
		if (state.projectId !== projectId) return;
		set({
			link: linkOn(stored, site),
			ready,
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
			set({ projectId, link: undefined, scoped: undefined, stopped: undefined, lastSyncAt: undefined, error: undefined });
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
				set({ error: errorOf(error) });
				return undefined;
			} finally {
				set({ checking: false, creatingFields: false });
			}
		},
		async syncNow() {
			if (!live) return undefined;
			return live.runner.drain();
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

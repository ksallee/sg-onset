// Sync, wired: the project link, the setup check and the runner, for the current project. The
// edge: it calls FPT, the store and the key-value port. No runes here, so the integration test
// drives it as the app does; `controller.svelte.ts` wraps it for the UI.
//
// The runner runs only when all hold: a project is current, the person is signed in, the project
// is linked to an FPT project on that site, and the site passed the setup check. It stops when
// any stops holding, and when the page is hidden (`runInForeground`). Capture never waits on it:
// the store and the editor never call here.
//
// The Set Shots and Shots of a slate are linked by the transport as the slate's codes sync, and
// every slate of the project Flow PT holds is brought in line again when a drain ends: at most once
// a minute, at once on Sync Now. Nothing about links is kept on the device (Kevin, #102): only what
// the last sync read of codes several Shots share, in memory, for the sync sheet.
//
// With Notes on Shots on for the project (#97, notes.ts), the same step then writes the Note of
// every Shot those slates reach, from what Flow PT holds. Nothing about the Notes is kept here.
//
// The Slates field of each set reference (#107) is set the same way when a drain ends, to the
// slates it shows on (referenceSlates.ts): at most once a minute, at once on Sync Now, and at once
// when what the device holds asks for other slates than the last time. Nothing is kept on the device.
//
// On a site without Set Reference (Kevin, #117) the runner drains a port that leaves out the set
// references' entries (waiting.ts): they wait in the queue, out of the status, counted for the sync
// sheet. A setup check makes a new runner, so they go at the drain after Set Up Fields.

import { checkSetup, createFptTransport, readShotCodes, type FptTransport, type KeyValue, type SetupReport, type ShotResult } from '$lib/fpt';
import { createApi, type FptOptions } from '$lib/fpt/api';
import { resolutionKey } from '$lib/fpt/cache';
import { hasNotes, hasScope, parseResolution } from '$lib/fpt/schema';
import { browserEnv, runInForeground, type Foreground, type Page } from '$lib/outbox/foreground';
import { createRunner, type DrainReport, type Progress, type Runner, type StopReason } from '$lib/outbox/runner';
import { unsynced, type Unsynced } from '$lib/outbox/select';
import type { DexieStore } from '$lib/store/dexieStore';
import { syncError, type SyncError } from './errors';
import { linkOn, linkProblem, type ProjectLink } from './link';
import { linkStore, type LinkStore } from './links';
import { notesKey, readNotesOn, shotsToNote, writeNotesOn } from './notes';
import { PROJECT_FILTER, projectChoices, type ProjectChoice } from './projects';
import { legacyReferenceSlatesKey, referenceSlateItems } from './referenceSlates';
import { projectScope, withoutWaiting, type ProjectScope } from './scope';
import { CODES_MS, legacyKeys, linkDue, linkItems, mergeSeveral, projectSlates, type Several } from './shots';
import { splitWaiting, waitingTables } from './waiting';

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
	/**
	 * Run before each drain: what is drawn at sync, a setup diagram's image (#87), is made then and
	 * queued, so this drain sends it. It never stops the drain: a failure is its own to tell.
	 */
	beforeDrain?: () => Promise<void>;
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
	/** The current project's share of the queue, less what waits for an entity the site lacks. */
	scoped?: Unsynced;
	/** The current project's entries that wait for an entity the site lacks: its set references, without Set Reference (Kevin, #117). */
	waiting?: Unsynced;
	/** The codes of the current project's slates whose Set Shot holds several Shots of that code, by slate id: what sync read. */
	several?: Several;
	/** The site is ready, without Set Shot: the Set Shots and Shot links wait (Kevin, #117). */
	setShotsMissing?: boolean;
	/** The site is ready, without Set Reference: the set references and their slates wait on the device (Kevin, #117). */
	referencesMissing?: boolean;
	/** Notes on Shots is on for the current project, on this device (#97). Off by default. */
	notesOnShots: boolean;
	/** The site is ready, without the Note fields: the Notes on Shots wait for Set Up Fields (#97). */
	notesMissing?: boolean;
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
	 * Notes on Shots, for the current project on this device (#97). Turned on while the site's
	 * resolution lacks the Note fields, the setup is checked again: it only reads.
	 */
	setNotesOnShots(on: boolean): Promise<void>;
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
	let state: SyncState = { ready: false, checking: false, creatingFields: false, running: false, online: deps.page.online(), notesOnShots: false };
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

	// The current project's share of the queue, again after every change of the queue and of the
	// setup: what the runner may send, and what waits for an entity the site lacks.
	let counting: Promise<void> = Promise.resolve();
	function recount(): void {
		const projectId = state.projectId;
		counting = counting.then(async () => {
			if (!projectId || disposed) return;
			const entries = await scopeOf(projectId).port.entries();
			const { open, waiting } = splitWaiting(entries, waitingTables(state));
			if (state.projectId === projectId) set({ scoped: unsynced(open), waiting: unsynced(waiting) });
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

	/** The site passed the check, and whether it has Set Shot, Set Reference and the Note fields: from the resolution kept on the device. */
	async function readSetup(site: string | null): Promise<{ ready: boolean; setShotsMissing: boolean; referencesMissing: boolean; notesMissing: boolean }> {
		const res = site ? parseResolution(await deps.schemaCache.get(resolutionKey(site)), site) : undefined;
		return {
			ready: res !== undefined,
			setShotsMissing: res !== undefined && !hasScope(res, 'setShot'),
			referencesMissing: res !== undefined && !hasScope(res, 'reference'),
			notesMissing: res !== undefined && !hasNotes(res)
		};
	}

	function stopRunner(): void {
		if (!live) return;
		live.foreground();
		live.runner.stop();
		live = undefined;
		set({ running: false, phase: undefined, upload: undefined });
	}

	// ------------------------------------------------------------------ the Shots of slates

	/** What a sync read of codes several Shots share: the whole list from a sync of every slate, else slate by slate. */
	function recordShots(projectId: string, results: readonly ShotResult[], whole = false): void {
		if (state.projectId !== projectId) return;
		set({ several: mergeSeveral(state.several ?? {}, results, whole) });
	}

	/** When each project last brought its links in line. */
	const linkedAt = new Map<string, number>();
	let linking: Promise<void> = Promise.resolve();

	/**
	 * Brings the Set Shots and Shots of every slate of the project Flow PT holds in line with its
	 * codes. Then, with Notes on Shots on, writes the Note of every Shot they reach (#97). Never throws.
	 */
	function linkSlates(projectId: string, transport: FptTransport, asked: boolean): Promise<void> {
		linking = linking.then(async () => {
			try {
				if (!linkDue(linkedAt.get(projectId), deps.page.now(), asked)) return;
				linkedAt.set(projectId, deps.page.now());
				const days = (await deps.store.rows('shootDay')) as { id: string; projectId?: string }[];
				const slates = projectSlates(days, (await deps.store.rows('slate')) as { id: string; shootDayId?: string; vfxShots?: string[] }[], projectId);
				const items = linkItems(slates, await deps.store.outbox.remoteIds(slates.map((sl) => sl.id)));
				const results = items.length ? await transport.linkShots(items) : [];
				if (results) recordShots(projectId, results, true);
				const shots = results ? shotsToNote(results) : [];
				if (shots.length && state.projectId === projectId && state.notesOnShots) await transport.writeNotes(shots);
			} catch {
				// The next drain brings them in line.
			}
		});
		return linking;
	}

	// ------------------------------------------------------------------ the Slates of set references

	/** When each project last set its references' Slates, and what it asked for then. In memory only. */
	const referencesLinked = new Map<string, { at: number; asked: string }>();
	let linkingReferences: Promise<void> = Promise.resolve();

	/** Sets each set reference's Slates field to the slates it shows on, where it differs. Never throws. */
	function linkReferences(projectId: string, transport: FptTransport, asked: boolean): Promise<void> {
		linkingReferences = linkingReferences.then(async () => {
			try {
				const days = await deps.store.list('shootDay', projectId);
				const slates = projectSlates(days, await deps.store.list('slate'), projectId);
				const slateIds = new Set(slates.map((s) => s.id));
				const refs = (await deps.store.list('reference')).filter((r) => slateIds.has(r.slateId));
				const items = referenceSlateItems(refs, slates, await deps.store.outbox.remoteIds([...slates, ...refs].map((r) => r.id)));
				const wanted = JSON.stringify(items);
				const last = referencesLinked.get(projectId);
				// A new reference, a slate made or moved: at once. Else once a minute, for an edit made in Flow PT.
				if (last?.asked === wanted && !linkDue(last.at, deps.page.now(), asked)) return;
				const failed = items.length ? await transport.linkReferenceSlates(items) : [];
				if (failed && !failed.length) referencesLinked.set(projectId, { at: deps.page.now(), asked: wanted });
				else referencesLinked.delete(projectId);
			} catch {
				// The next drain sets them.
			}
		});
		return linkingReferences;
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
		// What waits for an entity the site lacks is kept from the runner: a new runner when that changes.
		const waits = waitingTables(state);
		const key = allowed ? `${site}|${projectId}|${link!.projectId}|${waits.join(',')}` : '';
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
			port: withoutWaiting(runScope.port, waits),
			transport,
			env: browserEnv(deps.page),
			onProgress: (p) => {
				if (state.projectId !== projectId) return;
				if (p.phase === 'stopped') return;
				set({ phase: p.phase, upload: p.upload, scoped: p.unsynced, error: undefined });
			}
		});
		// Each drain's end: wrap `drain` so every caller, the foreground included, reports. `asked`:
		// a person tapped Sync Now, so the slates' links are brought in line at once.
		const drain = runner.drain.bind(runner);
		const before = () => (deps.beforeDrain ? deps.beforeDrain().catch(() => undefined) : Promise.resolve());
		const reported = (asked: boolean) =>
			before()
				.then(() => drain())
				.then(
					async (report) => {
						await onReport(projectId!, report);
						if (report.stopped === 'idle' || report.stopped === 'waiting') {
							// The references first: the Notes written with the slates read their Slates.
							await linkReferences(projectId!, transport, asked);
							await linkSlates(projectId!, transport, asked);
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
		const setup = await readSetup(site);
		const last = projectId ? Number(await deps.kv.get(lastKey(projectId))) : NaN;
		const notesOnShots = projectId ? readNotesOn(await deps.kv.get(notesKey(projectId))) : false;
		// Nothing about links is kept any more: what an older version kept is removed (Kevin, #102).
		if (projectId) await Promise.all([...legacyKeys(projectId), legacyReferenceSlatesKey(projectId)].map((key) => deps.kv.delete(key))).catch(() => undefined);
		if (state.projectId !== projectId) return;
		set({
			link: linkOn(stored, site),
			...setup,
			notesOnShots,
			lastSyncAt: Number.isFinite(last) && last > 0 ? last : undefined,
			...(state.report && state.report.site !== site ? { report: undefined } : {})
		});
		recount();
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
			set({ projectId, link: undefined, scoped: undefined, waiting: undefined, several: undefined, stopped: undefined, lastSyncAt: undefined, error: undefined });
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
				set({ report, ...(await readSetup(site)) });
				recount();
				// A new transport reads the resolution the check kept, and a new runner sees what waited
				// for an entity enabled since: they are synced at once (Kevin, #117).
				stopRunner();
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
		async setNotesOnShots(on) {
			const projectId = state.projectId;
			if (!projectId) return;
			if (on) await deps.kv.set(notesKey(projectId), writeNotesOn());
			else await deps.kv.delete(notesKey(projectId));
			if (state.projectId !== projectId) return;
			set({ notesOnShots: on });
			// An admin may have run Set Up Fields on another device since this one kept the schema.
			if (on && state.notesMissing && state.link) await engine.check(false);
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

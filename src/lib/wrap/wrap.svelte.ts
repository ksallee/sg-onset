// Wrap in the browser: the project's records read live from the store, what was picked, the
// files made from them, the day summary, the plan and size of the zip, and the build and the
// hand-over. The rules are the pure modules in this folder; this runs them on the store. Make it
// while the page initialises.

import { untrack } from 'svelte';
import type { App } from '$lib/app/app.svelte';
import type { Current } from '$lib/app/current.svelte';
import { live } from '$lib/app/live.svelte';
import { settings } from '$lib/app/settings.svelte';
import { dayReport, type DayReport } from '$lib/export/dayReport';
import type { ExportInput } from '$lib/export/selection';
import type { PhotoBlob } from '$lib/export/wrapPackage';
import { fieldLabel, optionLabel, unitLabel } from '$lib/i18n/modelText';
import { t, tk } from '$lib/i18n/messages';
import type { PlainLabels } from '$lib/export/plainCsv';
import { download } from '$lib/pwa/files';
import { memorySink, opfsSink, removeExport } from '$lib/store/backup';
import { packagePlan, type PackageEntry } from './assembly';
import { defaultChoice, pickedDays, readiness, setSpan, toggleDay, toggleFile, type FileKind, type Span, type TextKind, type WrapChoice } from './choice';
import { sizeVerdict } from './estimate';
import { projectInput } from './input';
import { exportedLine, lastExport, LOG_KEY, noteExport, parseLog, type ExportLog } from './lastExport';
import { makeTexts } from './make';
import { defaultPaper, reportBody, reportDocument } from './report';
import { handOverMode, shareOutcome } from './share';
import { daySummary } from './summary';
import { writePackage } from './zip';

/** The one file on the private file system the package is written to. */
const OPFS_NAME = 'sg-onset-wrap.zip';

export const plainLabels: PlainLabels = {
	field: (def, end) => fieldLabel(def, end),
	scope: (scope) => tk(`scope.${scope}`),
	option: (def, option) => optionLabel(def, option),
	unit: (unit) => (unit === 'ft' ? t('wrap.unit.ft') : unitLabel(unit)),
	yes: t('wrap.yes'),
	no: t('wrap.no')
};

const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

/** The browser writes files to its private file system: the zip then sits on disk. */
function canWriteToDisk(): boolean {
	return typeof navigator !== 'undefined' && typeof navigator.storage?.getDirectory === 'function' && typeof FileSystemFileHandle !== 'undefined' && 'createWritable' in FileSystemFileHandle.prototype;
}

function readLog(): ExportLog {
	try {
		return parseLog(localStorage.getItem(LOG_KEY));
	} catch {
		return {};
	}
}

export type Phase = 'idle' | 'building' | 'ready' | 'failed' | 'cancelled' | 'handed';

type Loaded = { input: ExportInput; blobs: PhotoBlob[] } | undefined;

export class Wrap {
	readonly #app: App;
	readonly #current: Current;
	readonly data;
	readonly storage;

	choice = $state<WrapChoice>(defaultChoice());
	phase = $state<Phase>('idle');
	/** Bytes written of the zip, and the whole. */
	progress = $state({ done: 0, total: 0 });
	/** A message about the last hand-over. */
	message = $state<string | null>(null);
	log = $state<ExportLog>(readLog());
	/** The clock, for "Exported today": moved by the page now and then. */
	now = $state(Date.now());
	readonly onDisk = canWriteToDisk();
	readonly paper = defaultPaper(typeof navigator === 'undefined' ? '' : navigator.language);
	#file: File | null = null;
	#controller: AbortController | null = null;
	#dayIds: string[] = [];

	readonly input = $derived.by(() => this.data.value?.input);
	readonly ready = $derived.by(() => this.data.ready);
	readonly shootDays = $derived(this.input?.shootDays ?? []);
	readonly days = $derived.by(() => pickedDays(this.choice, this.#current.shootDay?.id, this.shootDays));
	readonly readiness = $derived(readiness(this.choice, this.days.length));
	/** The summary of the current day: every take, no filters. */
	readonly report = $derived.by<DayReport | undefined>(() => (this.input && this.#current.shootDay ? dayReport(this.input, this.#current.shootDay.id) : undefined));
	readonly summary = $derived.by(() => (this.report ? daySummary(this.report) : undefined));
	readonly made = $derived.by(() => (this.input ? makeTexts(this.input, this.choice, this.days.map((d) => d.id), { now: new Date().toISOString(), timeZone: timeZone(), labels: plainLabels }) : undefined));
	readonly reports = $derived.by(() => {
		const input = this.input;
		if (!input) return [];
		const filters = { circledOnly: this.choice.circledOnly, excludeNoGood: this.choice.excludeNoGood };
		return this.days.map((d) => dayReport(input, d.id, filters)).filter((r): r is DayReport => !!r);
	});
	/** The day report of the days picked, to put inside an element of class `wrap-report`. */
	readonly reportBodyHtml = $derived.by(() => (this.reports.length ? reportBody(this.reports, { units: settings.value.units, printedAt: new Date() }) : ''));
	readonly reportHtml = $derived.by(() =>
		this.reportBodyHtml ? reportDocument(this.reportBodyHtml, { title: `${t('wrap.report.title')} · ${this.input?.project.name ?? ''}`, paper: this.paper }) : undefined
	);
	readonly plan = $derived.by(() => {
		const input = this.input;
		const made = this.made;
		if (!input || !made) return undefined;
		return packagePlan(made.rows, this.choice, { project: input.project, shootDays: this.days, blobs: this.data.value?.blobs ?? [], texts: made.texts, reportHtml: this.reportHtml });
	});
	/** What the package holds, as one string: it changes when a file or its size does. */
	readonly planKey = $derived(this.plan ? `${this.plan.bytes}:${this.plan.entries.map((e) => e.path).join('|')}` : '');
	readonly verdict = $derived.by(() => sizeVerdict(this.plan?.bytes ?? 0, { onDisk: this.onDisk, free: this.storage.value?.free }));
	/** When the current day was last handed over. */
	readonly exported = $derived.by(() => {
		const id = this.#current.shootDay?.id;
		const at = id ? lastExport(this.log, id) : undefined;
		return at === undefined ? undefined : exportedLine(at, new Date(this.now));
	});

	constructor(app: App, current: Current) {
		this.#app = app;
		this.#current = current;
		this.data = live<Loaded>(
			['project', 'shootDay', 'lightingSetup', 'cameraSetup', 'camera', 'lens', 'slate', 'take', 'still', 'blobs'],
			async (store) => {
				const projectId = current.project?.id;
				if (!projectId) return undefined;
				const [projects, shootDays, lightingSetups, cameraSetups, cameras, lenses, slates, takes, stills] = await Promise.all([
					store.list('project'),
					store.list('shootDay', projectId),
					store.list('lightingSetup', projectId),
					store.list('cameraSetup', projectId),
					store.list('camera', projectId),
					store.list('lens', projectId),
					store.list('slate'),
					store.list('take'),
					store.list('still')
				]);
				const input = projectInput(projectId, { projects, shootDays, lightingSetups, cameraSetups, cameras, lenses, slates, takes, stills });
				if (!input) return undefined;
				const blobs = (await Promise.all(input.stills.map((s) => store.blobsOf(s.id)))).flat();
				return { input, blobs };
			},
			undefined
		);
		this.storage = live(['blobs'], (store) => store.storage(), undefined);
		// A change of what the package holds makes the one built before stale.
		$effect(() => {
			void this.planKey;
			untrack(() => {
				if (this.phase !== 'idle' && this.phase !== 'building') this.#reset();
			});
		});
	}

	#reset() {
		this.#file = null;
		this.phase = 'idle';
		this.message = null;
	}

	setSpan(span: Span) {
		this.choice = setSpan(this.choice, span, this.#current.shootDay?.id);
	}
	toggleFile(kind: FileKind) {
		this.choice = toggleFile(this.choice, kind);
	}
	toggleDay(id: string) {
		this.choice = toggleDay(this.choice, id);
	}
	set(patch: Partial<WrapChoice>) {
		this.choice = { ...this.choice, ...patch };
	}

	/** Makes the zip. Then `share()` hands it over, from a tap. */
	async build(): Promise<void> {
		const plan = this.plan;
		const made = this.made;
		if (!plan || !made || this.phase === 'building') return;
		const texts = made.texts;
		const reportHtml = this.reportHtml;
		const store = this.#app.store;
		this.#dayIds = this.days.map((d) => d.id);
		this.#controller = new AbortController();
		this.phase = 'building';
		this.message = null;
		this.progress = { done: 0, total: plan.bytes };
		const read = async (entry: PackageEntry) => {
			if (entry.kind === 'photo') return store.blob(entry.blobId);
			if (entry.kind === 'report') return reportHtml;
			return texts[entry.kind];
		};
		try {
			const sink = (this.onDisk ? await opfsSink(OPFS_NAME) : undefined) ?? memorySink();
			let last = 0;
			const blob = await writePackage(plan, read, sink, {
				now: new Date(),
				signal: this.#controller.signal,
				onProgress: (done, total) => {
					// A rune write per chunk is too many: every half percent is enough.
					if (done === total || done - last > total / 200) {
						last = done;
						this.progress = { done, total };
					}
				}
			});
			this.#file = new File([blob], plan.fileName, { type: 'application/zip' });
			this.phase = 'ready';
		} catch (error) {
			this.#file = null;
			this.phase = error instanceof DOMException && error.name === 'AbortError' ? 'cancelled' : 'failed';
		} finally {
			this.#controller = null;
		}
	}

	cancel() {
		this.#controller?.abort();
	}

	/** What the hand-over button does here: the share sheet, or a download. */
	get mode() {
		if (typeof navigator === 'undefined') return 'download';
		return handOverMode(navigator, this.#file ?? new File([''], 'probe.zip', { type: 'application/zip' }));
	}

	/** The share sheet, or a download. Call from a tap. */
	async share(): Promise<void> {
		const file = this.#file;
		if (!file) return;
		if (this.mode === 'share') {
			try {
				await navigator.share({ files: [file], title: file.name });
				return this.#handed();
			} catch (error) {
				const outcome = shareOutcome(error);
				if (outcome === 'cancelled') return;
				if (outcome === 'needsTap') {
					this.message = t('wrap.package.tapAgain');
					return;
				}
			}
		}
		download(file, file.name);
		this.#handed();
	}

	/** Always a download, even where the share sheet works. */
	downloadPackage() {
		if (!this.#file) return;
		download(this.#file, this.#file.name);
		this.#handed();
	}

	#handed() {
		const at = Date.now();
		this.log = noteExport(this.log, this.#dayIds, at);
		try {
			localStorage.setItem(LOG_KEY, JSON.stringify(this.log));
		} catch {
			// Private mode: the line just does not stay.
		}
		// A package that holds every day's data, nothing lost, is an off-device copy of the records.
		const input = this.input;
		if (input && this.choice.files.includes('json') && !this.choice.circledOnly && !this.choice.excludeNoGood && this.#dayIds.length === input.shootDays.length) {
			void this.#app.store.snapshots.markOffDevice('export', at);
		}
		this.now = at;
		this.phase = 'handed';
		this.message = t('wrap.package.handed');
		// The copy on disk has done its work; a download may still read it, so it goes later.
		setTimeout(() => void removeExport(OPFS_NAME), 60_000);
	}

	/** One file of the package on its own, shared or downloaded. */
	async shareFile(kind: TextKind | 'report', how: 'share' | 'download'): Promise<void> {
		const plan = this.plan;
		const entry = plan?.entries.find((e) => e.kind === kind);
		const text = kind === 'report' ? this.reportHtml : this.made?.texts[kind];
		if (!entry || text === undefined) return;
		const name = entry.path.slice(entry.path.lastIndexOf('/') + 1);
		const file = new File([text], name, { type: entry.mime });
		if (how === 'share' && handOverMode(navigator, file) === 'share') {
			try {
				await navigator.share({ files: [file], title: name });
				return;
			} catch (error) {
				if (shareOutcome(error) !== 'download') return;
			}
		}
		download(file, name);
	}
}

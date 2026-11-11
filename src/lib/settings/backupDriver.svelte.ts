// The Backup section's work, driven by backupFlow.ts: make the zip and hand it over, check a
// picked file, ask, and replace. The store does the reading and writing ($lib/store/backup).
// A handed-over zip is marked as an off-device copy. Before a restore replaces what the device
// holds, a snapshot of it is taken (`zipRestore`): restoring that snapshot undoes the replace.
// When none can be taken the person is asked once more.
import { shareOrDownload } from '$lib/pwa/files';
import { BackupError, backupToFile, importBackup, removeExport } from '$lib/store/backup';
import type { DexieStore } from '$lib/store/dexieStore';
import type { RiskyReason, SnapshotInfo } from '$lib/store/snapshots';
import { isTable } from '$lib/store/tables';
import { backupName } from '$lib/app/format';
import { backupFlow, IDLE, type BackupEvent, type BackupState, type Refusal } from './backupFlow';

/** What a restore brought back, said once after the reload that follows it. */
const RESTORED_KEY = 'sg-onset.restored';

export interface BackupIo {
	store: DexieStore;
	now: () => number;
	/** Takes a snapshot before something risky. Undefined when it failed. */
	snapshotBefore: (reason: RiskyReason) => Promise<SnapshotInfo | undefined>;
	/** A backup left the device at `at`. */
	onHanded: (at: number) => void;
	/** The device's data was replaced: everything read before is stale. */
	onReplaced: () => void;
}

export class BackupDriver {
	state = $state.raw<BackupState>(IDLE);
	#file: Blob | null = null;
	#name = '';
	#picked: File | null = null;

	constructor(private io: BackupIo) {
		try {
			const note = sessionStorage.getItem(RESTORED_KEY);
			if (note) {
				sessionStorage.removeItem(RESTORED_KEY);
				const { records, files } = JSON.parse(note) as { records: number; files: number };
				this.state = { ...IDLE, restore: { step: 'done', records: Number(records) || 0, files: Number(files) || 0 } };
			}
		} catch {
			// No note.
		}
	}

	/** True when the event changed the state: a second tap does not. */
	#send(event: BackupEvent): boolean {
		const next = backupFlow(this.state, event);
		if (next === this.state) return false;
		this.state = next;
		return true;
	}

	/** Makes the zip. It can take a while with many photos; `share()` then hands it over. */
	async export(): Promise<void> {
		if (!this.#send({ type: 'export' })) return;
		try {
			const now = this.io.now();
			this.#file = await backupToFile(this.io.store, { now });
			this.#name = backupName(new Date(now));
			this.#send({ type: 'exported' });
		} catch {
			this.#file = null;
			this.#send({ type: 'exportFailed' });
		}
	}

	/** The share sheet, or a download. Call from a tap: the share sheet needs a recent one. */
	async share(): Promise<void> {
		if (!this.#file || this.state.export !== 'ready') return;
		const file = this.#file;
		// Taken at once, so a second tap opens no second share sheet.
		this.#file = null;
		const handed = await shareOrDownload(file, this.#name);
		if (handed === 'cancelled') {
			this.#file = file;
			this.#send({ type: 'handCancelled' });
			return;
		}
		this.#send({ type: 'handed' });
		const at = this.io.now();
		this.io.onHanded(at);
		// The copy now exists off this device: the safety signal counts from here.
		await this.io.store.snapshots.markOffDevice('export', at).catch(() => false);
		// A download may be reading the copy on disk: it goes a little later.
		setTimeout(() => void removeExport(), 60_000);
	}

	/** Checks a picked file. An empty device is restored at once; a device with data is asked. */
	async pick(file: File): Promise<void> {
		if (!this.#send({ type: 'picked', file: { name: file.name, size: file.size } })) return;
		this.#picked = file;
		if (await this.#restore(file, false)) this.io.onReplaced();
	}

	/**
	 * The person said yes: a snapshot of what is here, then the replace. When no snapshot can be
	 * taken the person is asked again; their second yes replaces without one.
	 */
	async confirm(): Promise<void> {
		const file = this.#picked;
		if (!file) return;
		const unprotected = this.state.restore.step === 'unprotected';
		if (!this.#send({ type: 'confirm' })) return;
		if (!unprotected) {
			let before: SnapshotInfo | undefined;
			try {
				before = await this.io.snapshotBefore('zipRestore');
			} catch {
				before = undefined;
			}
			if (!before) return void this.#send({ type: 'noSnapshot' });
		}
		if (await this.#restore(file, true)) this.io.onReplaced();
	}

	cancel(): void {
		if (this.#send({ type: 'cancel' })) this.#picked = null;
	}

	async #restore(file: Blob, replace: boolean): Promise<boolean> {
		try {
			const report = await importBackup(this.io.store, file, { replace });
			const records = Object.entries(report.tables).reduce((sum, [name, n]) => sum + (isTable(name) ? n : 0), 0);
			this.#send({ type: 'restored', records, files: report.blobs });
			try {
				sessionStorage.setItem(RESTORED_KEY, JSON.stringify({ records, files: report.blobs }));
			} catch {
				// Said on this page only.
			}
			this.#picked = null;
			return true;
		} catch (error) {
			const reason: Refusal | 'notEmpty' = error instanceof BackupError ? error.reason : 'other';
			this.#send({ type: 'refused', reason });
			if (reason !== 'notEmpty') this.#picked = null;
			return false;
		}
	}
}

// The backup as the UI drives it: export to a file, hand the file over on a tap, restore from a
// file. One instance per screen that shows it. The work is the store's (`$lib/store/backup`).
import { shareOrDownload } from '$lib/pwa/files';
import { BackupError, backupToFile, importBackup, removeExport, type BackupRefusal } from '$lib/store/backup';
import type { DexieStore } from '$lib/store/dexieStore';
import { isTable } from '$lib/store/tables';
import { backupName } from './format';

export type RefusalKey = `backup.refused.${BackupRefusal | 'other'}`;

export class Backup {
	phase = $state<'idle' | 'exporting' | 'ready' | 'failed' | 'restoring'>('idle');
	/** Why the last restore was refused, as a message key. */
	refusal = $state<RefusalKey | null>(null);
	/** What the last restore brought back. */
	restored = $state<{ records: number; files: number } | null>(null);
	#file: Blob | null = null;
	#name = '';
	#at = 0;

	constructor(
		private store: DexieStore,
		private now: () => number = () => Date.now()
	) {}

	/** Makes the zip. It can take a while with many photos; `share()` then hands it over. */
	async export(): Promise<void> {
		this.phase = 'exporting';
		try {
			const now = this.now();
			this.#file = await backupToFile(this.store, { now });
			this.#at = now;
			this.#name = backupName(new Date(now));
			this.phase = 'ready';
		} catch {
			this.#file = null;
			this.phase = 'failed';
		}
	}

	/** The share sheet, or a download. Call from a tap: the share sheet needs a recent one. */
	async share(): Promise<void> {
		if (!this.#file) return;
		const handed = await shareOrDownload(this.#file, this.#name);
		if (handed === 'cancelled') return;
		// Handed over: a copy off the device, as of when it was made (store/snapshots, signals).
		void this.store.snapshots.markOffDevice('export', this.#at).catch(() => false);
		this.#file = null;
		this.phase = 'idle';
		// The copy on disk has done its work once the file is handed over. A download may still be
		// reading it, so it goes a little later.
		setTimeout(() => void removeExport(), 60_000);
	}

	/**
	 * Restores from `file`. A device that holds data is refused (`backup.refused.notEmpty`) unless
	 * `replace`. True when it was restored: the caller then reloads the app.
	 */
	async restore(file: Blob, replace = false): Promise<boolean> {
		this.phase = 'restoring';
		this.refusal = null;
		try {
			const report = await importBackup(this.store, file, { replace });
			const records = Object.entries(report.tables).reduce((sum, [name, n]) => sum + (isTable(name) ? n : 0), 0);
			this.restored = { records, files: report.blobs };
			return true;
		} catch (error) {
			this.refusal = error instanceof BackupError ? `backup.refused.${error.reason}` : 'backup.refused.other';
			return false;
		} finally {
			this.phase = 'idle';
		}
	}
}

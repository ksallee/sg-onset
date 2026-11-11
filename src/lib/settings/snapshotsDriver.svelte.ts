// Snapshots and the safety signal as Settings drives them: the list, the signal kept fresh, a
// snapshot taken by hand, the preview of a restore, and the restore. The store does the work
// ($lib/store/snapshots); what is shown is decided in snapshotView.ts.
import type { DexieStore } from '$lib/store/dexieStore';
import { backupSignals, SnapshotError, type BackupSignals, type RestorePreview, type SnapshotInfo, type SnapshotRefusal } from '$lib/store/snapshots';

/** A restore reloads the page: this says so once on the other side. */
const RESTORED_KEY = 'sg-onset.snapshotRestored';
/** The tables whose change moves the signal: the queue, the snapshots, the off-device marks. */
const WATCHED = ['outbox', 'snapshots', 'meta'];
const TICK_MS = 60_000;

export interface Opened {
	info: SnapshotInfo;
	/** What restoring would change; undefined while it is read. */
	preview?: RestorePreview;
	/** Why it cannot be previewed or restored. `other`: not a refusal of the store's. */
	refused?: SnapshotRefusal | 'other';
	restoring: boolean;
}

export class SnapshotsDriver {
	/** Newest first; undefined until read. */
	list = $state.raw<SnapshotInfo[] | undefined>(undefined);
	signals = $state.raw<BackupSignals | undefined>(undefined);
	/** The time the signal was worked out at: what "2 h ago" counts from. */
	at = $state(0);
	taking = $state(false);
	takeFailed = $state(false);
	opened = $state.raw<Opened | null>(null);
	/** A snapshot was restored just before this page loaded. */
	restored = $state(false);
	#listing = false;
	#again = false;

	constructor(
		private store: DexieStore,
		private now: () => number,
		/** The device's data was replaced: everything read before is stale. */
		private onRestored: () => void
	) {
		this.at = now();
		try {
			this.restored = sessionStorage.getItem(RESTORED_KEY) === '1';
			sessionStorage.removeItem(RESTORED_KEY);
		} catch {
			this.restored = false;
		}
	}

	/** Reads everything, then follows the store and the clock. Returns the stop. */
	start(): () => void {
		void this.#readList(true);
		void this.#readSignals();
		const off = this.store.subscribe((event) => {
			if (!event.tables.some((table) => WATCHED.includes(table))) return;
			void this.#readSignals();
			if (event.tables.includes('snapshots')) void this.#readList(false);
		});
		const timer = setInterval(() => void this.#readSignals(), TICK_MS);
		return () => {
			off();
			clearInterval(timer);
		};
	}

	async #readSignals(): Promise<void> {
		try {
			const now = this.now();
			this.signals = backupSignals(await this.store.snapshots.status(), now);
			this.at = now;
		} catch {
			// Kept as it was: the next change or minute reads again.
		}
	}

	/** One read at a time; a change during a read is read once more after it. */
	async #readList(verify: boolean): Promise<void> {
		if (this.#listing) {
			this.#again = true;
			return;
		}
		this.#listing = true;
		try {
			this.list = await this.store.snapshots.list({ verify });
		} catch {
			this.list ??= [];
		} finally {
			this.#listing = false;
			if (this.#again) {
				this.#again = false;
				void this.#readList(false);
			}
		}
	}

	/** A snapshot by hand. One at a time. */
	async take(): Promise<void> {
		if (this.taking) return;
		this.taking = true;
		this.takeFailed = false;
		try {
			this.takeFailed = !(await this.store.snapshots.take('manual'));
		} catch {
			this.takeFailed = true;
		} finally {
			this.taking = false;
			void this.#readList(false);
			void this.#readSignals();
		}
	}

	/** Opens a snapshot: what restoring it would change. */
	async open(info: SnapshotInfo): Promise<void> {
		if (this.opened?.restoring) return;
		this.opened = { info, restoring: false };
		try {
			const preview = await this.store.snapshots.preview(info.id);
			if (this.opened?.info.id === info.id) this.opened = { info, preview, restoring: false };
		} catch (error) {
			if (this.opened?.info.id === info.id) this.opened = { info, refused: error instanceof SnapshotError ? error.reason : 'other', restoring: false };
			// A snapshot that failed its check is now marked: show it.
			void this.#readList(false);
		}
	}

	close(): void {
		if (!this.opened?.restoring) this.opened = null;
	}

	/** Restores the opened snapshot. The store takes a snapshot of what is here first. */
	async restore(): Promise<void> {
		const opened = this.opened;
		if (!opened?.preview || opened.restoring) return;
		this.opened = { ...opened, restoring: true };
		try {
			await this.store.snapshots.restore(opened.info.id);
			try {
				sessionStorage.setItem(RESTORED_KEY, '1');
			} catch {
				// Not said after the reload.
			}
			this.onRestored();
		} catch (error) {
			this.opened = { info: opened.info, refused: error instanceof SnapshotError ? error.reason : 'other', restoring: false };
			void this.#readList(false);
		}
	}
}

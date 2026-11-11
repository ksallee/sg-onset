// What Settings says about snapshots and the safety of the data: when a snapshot was taken,
// whether it can be restored, what restoring it would change, why one was refused, and the
// safety signal as message keys. Pure. The facts come from $lib/store/snapshots.

import { formatDate, formatTime, today } from '$lib/app/format';
import { SCOPES } from '$lib/model/catalogue';
import type { BackupSignals, RestorePreview, Severity, SignalReason, SnapshotInfo, SnapshotRefusal } from '$lib/store/snapshots';

/** When a snapshot was taken: today, yesterday or a date, and the time of day. */
export function snapshotWhen(at: number, now: number): { day: 'today' | 'yesterday' | 'date'; date: string; time: string } {
	const then = today(new Date(at));
	const yesterday = new Date(now);
	yesterday.setDate(yesterday.getDate() - 1);
	const day = then === today(new Date(now)) ? 'today' : then === today(yesterday) ? 'yesterday' : 'date';
	return { day, date: formatDate(then), time: formatTime(new Date(at).toISOString()) };
}

/** A snapshot that failed its check is listed and never restored. */
export function restorable(info: Pick<SnapshotInfo, 'verified'>): boolean {
	return info.verified !== false;
}

export interface PreviewLine {
	table: string;
	added: number;
	removed: number;
	changed: number;
}

export interface PreviewView {
	/** One line per kind of entry that would change, in the order of the app's scopes. */
	lines: PreviewLine[];
	/** Differences in tables the app has no name for, as one count. */
	other: number;
	/** Changes the restore will queue for Flow PT. */
	queued: number;
	/** The snapshot holds what the device holds: nothing to restore. */
	same: boolean;
}

const ORDER: readonly string[] = [...SCOPES, 'still'];

/** `named`: whether the app has a word for a table (`scope.<table>`). */
export function previewLines(preview: RestorePreview, named: (table: string) => boolean): PreviewView {
	const lines: PreviewLine[] = [];
	let other = 0;
	for (const [table, diff] of Object.entries(preview.tables)) {
		const n = diff.added + diff.removed + diff.changed;
		if (n === 0) continue;
		if (named(table)) lines.push({ table, ...diff });
		else other += n;
	}
	const rank = (table: string) => (ORDER.includes(table) ? ORDER.indexOf(table) : ORDER.length);
	lines.sort((a, b) => rank(a.table) - rank(b.table) || a.table.localeCompare(b.table));
	return { lines, other, queued: preview.queued, same: lines.length === 0 && other === 0 };
}

/** Why a snapshot was not previewed or restored, as a message key. */
export function refusalKey(reason: SnapshotRefusal | undefined): `settings.snapshot.refused.${SnapshotRefusal | 'other'}` {
	return `settings.snapshot.refused.${reason ?? 'other'}`;
}

export interface SafetyView {
	severity: Severity;
	headline: `settings.safety.${Severity}`;
	/** Why, most severe first. */
	reasons: `settings.safety.reason.${SignalReason}`[];
	/** When the newest good snapshot was taken, ms. */
	snapshotAt: number | undefined;
	/** The last copy off this device: a sync or an exported backup. */
	offDevice: { kind: `settings.safety.offDevice.${'sync' | 'export'}`; at: number } | undefined;
	/** Entries that exist only on this device. */
	localOnly: number;
}

export function safetyView(signals: BackupSignals, now: number): SafetyView {
	return {
		severity: signals.severity,
		headline: `settings.safety.${signals.severity}`,
		reasons: signals.reasons.map((r) => `settings.safety.reason.${r}` as const),
		snapshotAt: signals.sinceSnapshotMs === undefined ? undefined : now - signals.sinceSnapshotMs,
		offDevice: signals.lastOffDevice ? { kind: `settings.safety.offDevice.${signals.lastOffDevice.kind}`, at: signals.lastOffDevice.at } : undefined,
		localOnly: signals.localOnly.records
	};
}

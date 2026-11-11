import { describe, expect, it } from 'vitest';
import { backupSignals, DEFAULT_THRESHOLDS as T, type SignalInput } from './signals';

const H = 3600_000;
const NOW = 1000 * H;

function input(rest: Partial<SignalInput> = {}): SignalInput {
	return {
		seq: 10,
		lastSnapshot: { at: NOW - 60_000, seq: 10 },
		offDevice: {},
		queue: { entries: 0, records: 0 },
		persisted: true,
		...rest
	};
}

describe('backupSignals', () => {
	it('has the stated thresholds', () => {
		expect(T.remindAfterMs).toBe(4 * H);
		expect(T.warnAfterMs).toBe(24 * H);
		expect(T.snapshotStaleMs).toBe(H);
	});

	it('is ok with everything on Flow PT and a fresh snapshot', () => {
		const s = backupSignals(input({ offDevice: { sync: NOW - 2 * H } }), NOW);
		expect(s).toEqual({
			severity: 'ok',
			reasons: [],
			sinceSnapshotMs: 60_000,
			lastOffDevice: { kind: 'sync', at: NOW - 2 * H },
			sinceOffDeviceMs: 2 * H,
			localOnly: { records: 0, entries: 0 },
			pendingChanges: 0
		});
	});

	it('picks the later of a sync and an export as the last off-device copy', () => {
		const s = backupSignals(input({ offDevice: { sync: NOW - 5 * H, export: NOW - 3 * H, exportSeq: 10 } }), NOW);
		expect(s.lastOffDevice).toEqual({ kind: 'export', at: NOW - 3 * H });
		expect(s.sinceOffDeviceMs).toBe(3 * H);
	});

	it('counts what exists only on this device, and since when', () => {
		const s = backupSignals(input({ queue: { entries: 12, records: 5, oldest: NOW - H } }), NOW);
		expect(s.localOnly).toEqual({ records: 5, entries: 12, sinceMs: H });
		expect(s.severity).toBe('ok');
	});

	it('reminds after four hours of entries only on this device', () => {
		const s = backupSignals(input({ queue: { entries: 3, records: 2, oldest: NOW - 4 * H } }), NOW);
		expect(s.severity).toBe('remind');
		expect(s.reasons).toEqual(['localOnly']);
	});

	it('warns after a day of entries only on this device', () => {
		const s = backupSignals(input({ queue: { entries: 3, records: 2, oldest: NOW - 25 * H } }), NOW);
		expect(s.severity).toBe('warn');
		expect(s.reasons).toEqual(['localOnlyDay']);
	});

	it('counts an export made after the oldest change as an off-device copy of it', () => {
		const s = backupSignals(input({ queue: { entries: 3, records: 2, oldest: NOW - 30 * H }, offDevice: { export: NOW - 2 * H, exportSeq: 8 } }), NOW);
		expect(s.localOnly.sinceMs).toBe(2 * H);
		expect(s.severity).toBe('ok');
	});

	it('sees nothing only on this device when no change came after the export', () => {
		const s = backupSignals(input({ queue: { entries: 3, records: 2, oldest: NOW - 30 * H }, offDevice: { export: NOW - 2 * H, exportSeq: 10 } }), NOW);
		expect(s.localOnly).toEqual({ records: 0, entries: 0 });
		expect(s.severity).toBe('ok');
	});

	it('reminds when changes have waited over an hour for a snapshot', () => {
		const s = backupSignals(input({ seq: 15, lastSnapshot: { at: NOW - 2 * H, seq: 10 } }), NOW);
		expect(s.pendingChanges).toBe(5);
		expect(s.reasons).toEqual(['snapshotStale']);
		expect(s.severity).toBe('remind');
	});

	it('does not remind about an old snapshot when nothing changed since', () => {
		expect(backupSignals(input({ lastSnapshot: { at: NOW - 50 * H, seq: 10 } }), NOW).severity).toBe('ok');
	});

	it('reminds when there is no snapshot and changes are over an hour old', () => {
		const fresh = backupSignals(input({ lastSnapshot: undefined, queue: { entries: 1, records: 1, oldest: NOW - 60_000 } }), NOW);
		expect(fresh.severity).toBe('ok');
		const s = backupSignals(input({ lastSnapshot: undefined, queue: { entries: 1, records: 1, oldest: NOW - 2 * H } }), NOW);
		expect(s.reasons).toEqual(['snapshotStale']);
		expect(s.sinceSnapshotMs).toBeUndefined();
	});

	it('reminds when the newest snapshot failed its check', () => {
		const s = backupSignals(input({ newestBad: true }), NOW);
		expect(s.reasons).toEqual(['snapshotBad']);
		expect(s.severity).toBe('remind');
	});

	it('reminds when the snapshots do not fit their budget', () => {
		expect(backupSignals(input({ overBudget: true }), NOW).reasons).toEqual(['overBudget']);
	});

	it('reminds when the browser may evict and something is only here', () => {
		expect(backupSignals(input({ persisted: false }), NOW).severity).toBe('ok');
		const s = backupSignals(input({ persisted: false, queue: { entries: 1, records: 1, oldest: NOW - 60_000 } }), NOW);
		expect(s.reasons).toEqual(['notPersisted']);
	});

	it('lists every reason, the most severe first', () => {
		const s = backupSignals(input({ seq: 15, lastSnapshot: { at: NOW - 2 * H, seq: 10 }, persisted: false, queue: { entries: 1, records: 1, oldest: NOW - 30 * H } }), NOW);
		expect(s.severity).toBe('warn');
		expect(s.reasons).toEqual(['localOnlyDay', 'snapshotStale', 'notPersisted']);
	});

	it('takes its thresholds as given', () => {
		const s = backupSignals(input({ queue: { entries: 1, records: 1, oldest: NOW - 2 * H } }), NOW, { ...T, warnAfterMs: H });
		expect(s.severity).toBe('warn');
	});
});

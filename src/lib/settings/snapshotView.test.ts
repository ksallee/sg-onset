import { describe, expect, it } from 'vitest';
import type { RestorePreview, SnapshotInfo } from '$lib/store/snapshots';
import { previewLines, refusalKey, restorable, safetyView, snapshotWhen } from './snapshotView';

const info = (over: Partial<SnapshotInfo> = {}): SnapshotInfo => ({ id: 's1', at: 0, reason: 'changes', kind: 'auto', schemaVersion: 2, counts: {}, records: 25, size: 4096, verified: true, ...over });

describe('snapshotWhen', () => {
	const now = new Date(2026, 10, 11, 15, 30).getTime();
	it('says today and yesterday in words, and the date before that', () => {
		expect(snapshotWhen(new Date(2026, 10, 11, 9, 5).getTime(), now)).toEqual({ day: 'today', date: 'Wed 11 Nov 2026', time: '09:05' });
		expect(snapshotWhen(new Date(2026, 10, 10, 23, 59).getTime(), now)).toEqual({ day: 'yesterday', date: 'Tue 10 Nov 2026', time: '23:59' });
		expect(snapshotWhen(new Date(2026, 10, 2, 8, 0).getTime(), now)).toEqual({ day: 'date', date: 'Mon 2 Nov 2026', time: '08:00' });
	});
});

describe('restorable', () => {
	it('is every snapshot but a damaged one', () => {
		expect(restorable(info())).toBe(true);
		expect(restorable(info({ verified: undefined }))).toBe(true);
		expect(restorable(info({ verified: false }))).toBe(false);
	});
});

describe('previewLines', () => {
	const preview = (tables: RestorePreview['tables'], queued = 0): RestorePreview => {
		const sum = (k: 'added' | 'removed' | 'changed') => Object.values(tables).reduce((n, t) => n + t[k], 0);
		return { snapshot: info(), tables, added: sum('added'), removed: sum('removed'), changed: sum('changed'), queued };
	};
	const known = (table: string) => table !== 'outbox' && table !== 'blobs';

	it('lists each kind of entry with a difference, in the order of the app', () => {
		const view = previewLines(preview({ take: { added: 3, removed: 0, changed: 2 }, project: { added: 0, removed: 0, changed: 1 }, slate: { added: 1, removed: 1, changed: 0 } }, 7), known);
		expect(view.lines).toEqual([
			{ table: 'project', added: 0, removed: 0, changed: 1 },
			{ table: 'slate', added: 1, removed: 1, changed: 0 },
			{ table: 'take', added: 3, removed: 0, changed: 2 }
		]);
		expect(view).toMatchObject({ same: false, queued: 7, other: 0 });
	});
	it('folds what has no name into one count', () => {
		const view = previewLines(preview({ outbox: { added: 2, removed: 1, changed: 0 }, blobs: { added: 0, removed: 0, changed: 4 }, take: { added: 1, removed: 0, changed: 0 } }), known);
		expect(view.lines).toEqual([{ table: 'take', added: 1, removed: 0, changed: 0 }]);
		expect(view.other).toBe(7);
	});
	it('says when the snapshot holds what the device holds', () => {
		expect(previewLines(preview({}), known)).toEqual({ lines: [], other: 0, queued: 0, same: true });
	});
});

describe('refusalKey', () => {
	it('has words for every reason a snapshot is refused, and for anything else', () => {
		for (const reason of ['bad', 'newerSchema', 'olderSchema', 'busy', 'notFound'] as const) expect(refusalKey(reason)).toBe(`settings.snapshot.refused.${reason}`);
		expect(refusalKey(undefined)).toBe('settings.snapshot.refused.other');
	});
});

describe('safetyView', () => {
	const now = 10_000_000;
	it('reads ok with nothing only here', () => {
		const view = safetyView({ severity: 'ok', reasons: [], sinceSnapshotMs: 60_000, lastOffDevice: { kind: 'sync', at: now - 120_000 }, sinceOffDeviceMs: 120_000, localOnly: { records: 0, entries: 0 }, pendingChanges: 0 }, now);
		expect(view).toEqual({
			severity: 'ok',
			headline: 'settings.safety.ok',
			reasons: [],
			snapshotAt: now - 60_000,
			offDevice: { kind: 'settings.safety.offDevice.sync', at: now - 120_000 },
			localOnly: 0
		});
	});
	it('carries the reasons as message keys, most severe first, and what is only here', () => {
		const view = safetyView({ severity: 'warn', reasons: ['localOnlyDay', 'notPersisted'], localOnly: { records: 12, entries: 40, sinceMs: 90_000_000 }, pendingChanges: 3 }, now);
		expect(view).toEqual({
			severity: 'warn',
			headline: 'settings.safety.warn',
			reasons: ['settings.safety.reason.localOnlyDay', 'settings.safety.reason.notPersisted'],
			snapshotAt: undefined,
			offDevice: undefined,
			localOnly: 12
		});
	});
	it('names an exported backup as the last copy', () => {
		const view = safetyView({ severity: 'remind', reasons: ['localOnly'], lastOffDevice: { kind: 'export', at: 5 }, sinceOffDeviceMs: now - 5, localOnly: { records: 1, entries: 1 }, pendingChanges: 0 }, now);
		expect(view.offDevice).toEqual({ kind: 'settings.safety.offDevice.export', at: 5 });
		expect(view.headline).toBe('settings.safety.remind');
	});
});

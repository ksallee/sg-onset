import { describe, expect, it } from 'vitest';
import type { Entry } from '$lib/outbox/types';
import { attentionRows, syncSummary } from './sync';

describe('syncSummary', () => {
	it('says nothing waits', () => {
		expect(syncSummary({ entries: 0, attention: 0 }, 'signed-in')).toEqual({ state: 'synced', count: 0, key: 'sync.synced', shortKey: 'sync.short.synced' });
		expect(syncSummary({ entries: 0, attention: 0 }, 'signed-out').state).toBe('empty');
		expect(syncSummary(undefined, 'signed-out').state).toBe('empty');
	});
	it('counts what waits to be sent when signed in', () => {
		expect(syncSummary({ entries: 12, attention: 0 }, 'signed-in')).toMatchObject({ state: 'pending', count: 12 });
	});
	it('says the changes are on this device only when nobody is signed in, or the session expired', () => {
		expect(syncSummary({ entries: 12, attention: 0 }, 'signed-out')).toMatchObject({ state: 'local', count: 12 });
		expect(syncSummary({ entries: 3, attention: 0 }, 'expired')).toMatchObject({ state: 'local', count: 3 });
	});
	it('puts what needs a look first, and counts that', () => {
		expect(syncSummary({ entries: 12, attention: 2 }, 'signed-in')).toMatchObject({ state: 'attention', count: 2, key: 'sync.attention' });
		expect(syncSummary({ entries: 12, attention: 2 }, 'signed-out').state).toBe('attention');
	});
});

describe('attentionRows', () => {
	const entry = (id: string, seq: number, extra: Partial<Entry>): Entry => ({
		id,
		seq,
		op: { kind: 'update', table: 'take', recordId: `t${seq}`, changes: {} },
		dependsOn: [],
		state: 'needsAttention',
		attempts: 1,
		createdAt: seq,
		...extra
	});
	it('lists only what waits for a person, oldest first', () => {
		const queue = [
			entry('e3', 3, { attention: { reason: 'attempts' } }),
			entry('e1', 1, { state: 'pending' }),
			entry('e2', 2, { attention: { reason: 'gone' } })
		];
		expect(attentionRows(queue).map((r) => r.entryId)).toEqual(['e2', 'e3']);
	});
	it('offers a choice on a conflict, with its fields', () => {
		const conflicts = [{ key: 'tStop', base: 2.8, local: 4, server: 5.6 }];
		expect(attentionRows([entry('e1', 1, { attention: { reason: 'conflict', conflicts } })])).toEqual([
			{ entryId: 'e1', table: 'take', recordId: 't1', kind: 'update', reason: 'conflict', conflicts, actions: ['mine', 'theirs'] }
		]);
	});
	it('offers another try on the rest, with the server words of a refusal', () => {
		const rows = attentionRows([entry('e1', 1, { attention: { reason: 'refused', message: 'No permission' } }), entry('e2', 2, { attention: { reason: 'blobMissing' } })]);
		expect(rows.map((r) => r.actions)).toEqual([['retry'], ['retry']]);
		expect(rows[0].message).toBe('No permission');
		expect(rows[1].message).toBeUndefined();
	});
});

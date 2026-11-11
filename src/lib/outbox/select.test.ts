import { describe, expect, it } from 'vitest';
import { unsynced } from './select';
import { blob, create, entry, update } from './testkit';

describe('unsynced', () => {
	it('is all zero on an empty queue', () => {
		expect(unsynced([])).toEqual({ entries: 0, records: 0, blobs: 0, attention: 0 });
	});

	it('counts everything the server has not confirmed, in every state but confirmed', () => {
		const q = [
			entry(create('take', 't1'), { createdAt: 300 }),
			entry(update('take', 't1', { a: [1, 2] }), { state: 'inFlight', createdAt: 200 }),
			entry(update('take', 't2', { a: [1, 2] }), { state: 'sentUnconfirmed', createdAt: 400 }),
			entry(create('still', 'p1'), { state: 'failedRetryable', createdAt: 500 }),
			entry(blob('p1'), { createdAt: 600 }),
			entry(update('slate', 's1', { a: [1, 2] }), { state: 'needsAttention', createdAt: 700 }),
			entry(create('take', 't9'), { state: 'confirmed', createdAt: 100 })
		];
		expect(unsynced(q)).toEqual({ entries: 6, records: 4, blobs: 1, attention: 1, oldest: 200 });
	});
});

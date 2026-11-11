import { describe, expect, it } from 'vitest';
import {
	canMove,
	deferCheck,
	markApplied,
	markAttention,
	markFailed,
	markInFlight,
	markSent,
	markUnknown,
	markUnsent,
	prune,
	recover,
	retry,
	settleCheck
} from './machine';
import { create, entry, states, update } from './testkit';
import type { EntryState } from './types';

const policy = { baseMs: 1000, factor: 2, maxMs: 60_000, maxAttempts: 3 };
const ALL: EntryState[] = ['pending', 'inFlight', 'sentUnconfirmed', 'confirmed', 'failedRetryable', 'needsAttention'];
const one = (state: EntryState, rest = {}) => entry(create('take', 't1'), { state, ...rest });

describe('canMove', () => {
	const allowed: Record<EntryState, EntryState[]> = {
		pending: ['inFlight', 'confirmed', 'needsAttention'],
		failedRetryable: ['inFlight', 'confirmed', 'needsAttention'],
		inFlight: ['pending', 'sentUnconfirmed', 'confirmed', 'failedRetryable', 'needsAttention'],
		sentUnconfirmed: ['confirmed', 'failedRetryable', 'needsAttention'],
		needsAttention: ['pending'],
		confirmed: []
	};
	it.each(ALL)('from %s allows exactly the listed moves', (from) => {
		expect(ALL.filter((to) => canMove(from, to))).toEqual(ALL.filter((to) => allowed[from].includes(to)));
	});
});

describe('markInFlight', () => {
	it('starts an attempt on pending and failed entries and counts it', () => {
		const q = [one('pending'), one('failedRetryable', { attempts: 2, nextAttemptAt: 5 }), one('pending')];
		const next = markInFlight(q, [q[0].id, q[1].id]);
		expect(states(next)).toEqual(['inFlight', 'inFlight', 'pending']);
		expect(next.map((e) => e.attempts)).toEqual([1, 3, 0]);
		expect(next[1].nextAttemptAt).toBeUndefined();
		expect(next[2]).toBe(q[2]);
	});

	it.each(['inFlight', 'sentUnconfirmed', 'confirmed', 'needsAttention'] as const)('leaves a %s entry alone', (state) => {
		const q = [one(state)];
		expect(markInFlight(q, [q[0].id])[0]).toBe(q[0]);
	});
});

describe('markApplied', () => {
	it('confirms entries in flight and keeps the server id', () => {
		const q = [one('inFlight', { attempts: 1 }), one('inFlight')];
		const next = markApplied(q, [{ id: q[0].id, remoteId: 77 }]);
		expect(next[0]).toMatchObject({ state: 'confirmed', remoteId: 77 });
		expect(next[1]).toBe(q[1]);
	});

	it('does not confirm what was not in flight', () => {
		const q = [one('pending'), one('needsAttention')];
		expect(states(markApplied(q, [{ id: q[0].id }, { id: q[1].id }]))).toEqual(['pending', 'needsAttention']);
	});
});

describe('markUnknown', () => {
	it('parks an attempt that may have landed, to be checked after a delay', () => {
		const q = [one('inFlight', { attempts: 2 })];
		const next = markUnknown(q, [q[0].id], 10_000, policy, 1);
		expect(next[0]).toMatchObject({ state: 'sentUnconfirmed', attempts: 2, nextAttemptAt: 12_000 });
	});

	it('never gives up on its own, whatever the attempt count: it must be checked first', () => {
		const q = [one('inFlight', { attempts: 9 })];
		expect(markUnknown(q, [q[0].id], 0, policy, 1)[0].state).toBe('sentUnconfirmed');
	});
});

describe('markSent', () => {
	it('parks an upload for verification now, with the id the server gave', () => {
		const q = [one('inFlight', { attempts: 1 })];
		expect(markSent(q, q[0].id, 500, 'att-9')[0]).toMatchObject({
			state: 'sentUnconfirmed',
			nextAttemptAt: 500,
			remoteId: 'att-9'
		});
	});
});

describe('markFailed', () => {
	it('schedules a retry with backoff', () => {
		const q = [one('inFlight', { attempts: 1 }), one('inFlight', { attempts: 2 })];
		const next = markFailed(q, [q[0].id, q[1].id], 1000, policy, 1);
		expect(states(next)).toEqual(['failedRetryable', 'failedRetryable']);
		expect(next.map((e) => e.nextAttemptAt)).toEqual([2000, 3000]);
	});

	it('asks for attention once the attempts are used up', () => {
		const q = [one('inFlight', { attempts: 3 })];
		const next = markFailed(q, [q[0].id], 0, policy, 1);
		expect(next[0]).toMatchObject({ state: 'needsAttention', attention: { reason: 'attempts' } });
		expect(next[0].nextAttemptAt).toBeUndefined();
	});

	it('leaves entries not in flight alone', () => {
		const q = [one('pending')];
		expect(markFailed(q, [q[0].id], 0, policy, 1)[0]).toBe(q[0]);
	});
});

describe('markUnsent', () => {
	it('puts back an attempt that never left and does not count it', () => {
		const q = [one('inFlight', { attempts: 3 })];
		expect(markUnsent(q, [q[0].id])[0]).toMatchObject({ state: 'pending', attempts: 2 });
	});
});

describe('markAttention', () => {
	it('parks an entry for a person, with the reason', () => {
		const q = [one('inFlight', { attempts: 1, nextAttemptAt: 4 })];
		const next = markAttention(q, q[0].id, { reason: 'refused', message: 'no' });
		expect(next[0]).toMatchObject({ state: 'needsAttention', attention: { reason: 'refused', message: 'no' } });
		expect(next[0].nextAttemptAt).toBeUndefined();
	});

	it('does not touch a confirmed entry', () => {
		const q = [one('confirmed')];
		expect(markAttention(q, q[0].id, { reason: 'gone' })[0]).toBe(q[0]);
	});
});

describe('recover', () => {
	it('after a crash, treats what was in flight as maybe sent, to be checked now', () => {
		const q = [one('inFlight', { attempts: 1 }), one('pending'), one('sentUnconfirmed', { nextAttemptAt: 9000 })];
		const next = recover(q, 100);
		expect(states(next)).toEqual(['sentUnconfirmed', 'pending', 'sentUnconfirmed']);
		expect(next[0].nextAttemptAt).toBe(100);
		expect(next[1]).toBe(q[1]);
		expect(next[2]).toBe(q[2]);
	});
});

describe('settleCheck', () => {
	it('confirms what the server has', () => {
		const q = [one('sentUnconfirmed', { attempts: 1, nextAttemptAt: 5 })];
		const next = settleCheck(q, q[0].id, { applied: true, remoteId: 12 }, 0, policy, 1);
		expect(next[0]).toMatchObject({ state: 'confirmed', remoteId: 12 });
	});

	it('keeps the id it already had when the check brings none', () => {
		const q = [one('sentUnconfirmed', { remoteId: 'att-1' })];
		expect(settleCheck(q, q[0].id, { applied: true }, 0, policy, 1)[0].remoteId).toBe('att-1');
	});

	it('schedules a resend of what the server does not have, and forgets a stale server id', () => {
		const q = [one('sentUnconfirmed', { attempts: 1, remoteId: 'att-1' })];
		const next = settleCheck(q, q[0].id, { applied: false }, 1000, policy, 1);
		expect(next[0]).toMatchObject({ state: 'failedRetryable', nextAttemptAt: 2000 });
		expect(next[0].remoteId).toBeUndefined();
	});

	it('asks for attention when it did not land and the attempts are used up', () => {
		const q = [one('sentUnconfirmed', { attempts: 3 })];
		expect(settleCheck(q, q[0].id, { applied: false }, 0, policy, 1)[0]).toMatchObject({
			state: 'needsAttention',
			attention: { reason: 'attempts' }
		});
	});

	it('only settles unconfirmed entries', () => {
		const q = [one('pending')];
		expect(settleCheck(q, q[0].id, { applied: true }, 0, policy, 1)[0]).toBe(q[0]);
	});
});

describe('deferCheck', () => {
	it('puts off a check that could not be made, without counting an attempt', () => {
		const q = [one('sentUnconfirmed', { attempts: 2, nextAttemptAt: 0 })];
		expect(deferCheck(q, [q[0].id], 1000, policy, 1)[0]).toMatchObject({
			state: 'sentUnconfirmed',
			attempts: 2,
			nextAttemptAt: 3000
		});
	});
});

describe('retry', () => {
	it('sends an entry that needed attention again, from a clean count', () => {
		const q = [one('needsAttention', { attempts: 8, attention: { reason: 'attempts' } })];
		const next = retry(q, q[0].id);
		expect(next[0]).toMatchObject({ state: 'pending', attempts: 0 });
		expect(next[0].attention).toBeUndefined();
	});

	it('does not release a conflict: that needs a choice', () => {
		const q = [
			entry(update('take', 't1', { a: [1, 2] }), {
				state: 'needsAttention',
				attention: { reason: 'conflict', conflicts: [{ key: 'a', base: 1, local: 2, server: 3 }] }
			})
		];
		expect(retry(q, q[0].id)[0]).toBe(q[0]);
	});
});

describe('prune', () => {
	it('drops confirmed entries', () => {
		const q = [one('confirmed'), one('pending')];
		expect(prune(q)).toEqual([q[1]]);
	});
});

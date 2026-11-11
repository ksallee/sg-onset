import { describe, expect, it } from 'vitest';
import { DEFAULT_SNAPSHOT_POLICY as P, isRiskyEdit, nextCheckAt, snapshotDue, type DueInput } from './policy';

const MIN = 60_000;

function due(input: Partial<DueInput>) {
	return snapshotDue({ now: 100 * MIN, seq: 0, last: undefined, writing: false, ...input });
}

describe('snapshotDue', () => {
	it('has the stated defaults', () => {
		expect(P.intervalMs).toBe(10 * MIN);
		expect(P.maxChanges).toBe(200);
		expect(P.riskyEditRecords).toBe(20);
	});

	it('is not due on a store that never changed', () => {
		expect(due({ seq: 0 })).toEqual({ due: false });
	});

	it('is due after the first change when there is no snapshot yet', () => {
		expect(due({ seq: 1 })).toEqual({ due: true, reason: 'changes' });
	});

	it('is not due without changes since the last snapshot, however long ago', () => {
		expect(due({ seq: 5, last: { at: 0, seq: 5 } })).toEqual({ due: false });
	});

	it('is not due with a few changes before the interval passes', () => {
		expect(due({ seq: 6, last: { at: 100 * MIN - 9 * MIN, seq: 5 } })).toEqual({ due: false });
	});

	it('is due once the interval has passed with a change since', () => {
		expect(due({ seq: 6, last: { at: 90 * MIN, seq: 5 } })).toEqual({ due: true, reason: 'changes' });
	});

	it('is due once enough changes piled up, before the interval', () => {
		expect(due({ seq: 205, last: { at: 99 * MIN, seq: 5 } })).toEqual({ due: true, reason: 'changes' });
		expect(due({ seq: 204, last: { at: 99 * MIN, seq: 5 } })).toEqual({ due: false });
	});

	it('is due when the page hides with changes, whatever the time', () => {
		expect(due({ seq: 6, last: { at: 99 * MIN, seq: 5 }, hidden: true })).toEqual({ due: true, reason: 'hidden' });
		expect(due({ seq: 5, last: { at: 99 * MIN, seq: 5 }, hidden: true })).toEqual({ due: false });
	});

	it('is never due while one is being written', () => {
		expect(due({ seq: 500, last: { at: 0, seq: 5 }, writing: true })).toEqual({ due: false });
		expect(due({ seq: 500, hidden: true, writing: true })).toEqual({ due: false });
	});

	it('takes its numbers from the policy', () => {
		const policy = { ...P, intervalMs: MIN, maxChanges: 2 };
		expect(snapshotDue({ now: 10 * MIN, seq: 7, last: { at: 9.5 * MIN, seq: 5 }, writing: false }, policy)).toEqual({ due: true, reason: 'changes' });
		expect(snapshotDue({ now: 10 * MIN, seq: 6, last: { at: 9.5 * MIN, seq: 5 }, writing: false }, policy)).toEqual({ due: false });
	});

	it('treats a counter that went back (a zip restore) as a change', () => {
		expect(due({ seq: 3, last: { at: 99 * MIN, seq: 50 } })).toEqual({ due: true, reason: 'changes' });
	});
});

describe('nextCheckAt', () => {
	it('is when the interval runs out, with changes waiting', () => {
		expect(nextCheckAt({ seq: 6, last: { at: 95 * MIN, seq: 5 } })).toBe(105 * MIN);
	});

	it('is nothing without changes waiting', () => {
		expect(nextCheckAt({ seq: 5, last: { at: 95 * MIN, seq: 5 } })).toBeUndefined();
		expect(nextCheckAt({ seq: 0, last: undefined })).toBeUndefined();
	});

	it('is now when there is no snapshot yet', () => {
		expect(nextCheckAt({ seq: 1, last: undefined })).toBe(0);
	});
});

describe('isRiskyEdit', () => {
	it('is risky from the threshold up', () => {
		expect(isRiskyEdit(19)).toBe(false);
		expect(isRiskyEdit(20)).toBe(true);
		expect(isRiskyEdit(3, { ...P, riskyEditRecords: 3 })).toBe(true);
	});
});

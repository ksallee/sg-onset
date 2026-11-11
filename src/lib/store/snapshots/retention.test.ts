import { describe, expect, it } from 'vitest';
import { DEFAULT_RETENTION as R, budgetBytes, retain, type Kept } from './retention';

const H = 3600_000;
const D = 24 * H;
const NOW = 100 * D + 12 * H; // noon, UTC

let n = 0;
function snap(at: number, rest: Partial<Kept> = {}): Kept {
	return { id: `s${++n}`, at, kind: 'auto', size: 10, ...rest };
}
const ids = (list: Kept[]) => list.map((s) => s.id).sort();

describe('retain', () => {
	it('has the stated defaults', () => {
		expect(R.autoCount).toBe(3);
		expect(R.dailyDays).toBe(7);
		expect(R.riskyMs).toBe(48 * H);
	});

	it('keeps nothing when there is nothing', () => {
		expect(retain([], { now: NOW })).toEqual({ keep: [], drop: [], bytes: 0, overBudget: false });
	});

	it('keeps the last three automatic snapshots of the day and drops the rest but the daily', () => {
		const today = [1, 2, 3, 4, 5].map((h) => snap(NOW - h * 10 * 60_000));
		const r = retain(today, { now: NOW });
		// The newest three; the oldest of today is not the daily (the newest of the day is).
		expect(r.keep.sort()).toEqual(ids(today.slice(0, 3)));
		expect(r.drop.sort()).toEqual(ids(today.slice(3)));
	});

	it('keeps one per day for the last seven days: the newest of each day', () => {
		const days = [1, 2, 3, 4, 5, 6].flatMap((d) => [snap(NOW - d * D), snap(NOW - d * D - H)]);
		const recent = [snap(NOW - 1000), snap(NOW - 2000), snap(NOW - 3000)];
		const r = retain([...recent, ...days], { now: NOW });
		const newestOfEach = [1, 2, 3, 4, 5, 6].map((d) => days[(d - 1) * 2]);
		expect(r.keep.sort()).toEqual(ids([...recent, ...newestOfEach]));
		expect(r.drop).toHaveLength(6);
	});

	it('drops dailies older than seven days', () => {
		const old = snap(NOW - 7 * D);
		const older = snap(NOW - 9 * D);
		const recent = [snap(NOW - 1000), snap(NOW - 2000), snap(NOW - 3000)];
		const r = retain([...recent, old, older], { now: NOW });
		expect(r.drop.sort()).toEqual(ids([old, older]));
	});

	it('counts days in the device’s time zone', () => {
		// 23:30 local at UTC+2 is the same local day as 00:30 local, which is still the previous UTC day.
		const tz = 2 * H;
		const lateLocal = snap(NOW - 12 * H - 2 * H + 23.5 * H - D, { id: 'late' });
		const earlyLocal = snap(NOW - 12 * H - 2 * H + 0.5 * H - D, { id: 'early' });
		const recent = [snap(NOW - 1000), snap(NOW - 2000), snap(NOW - 3000)];
		const r = retain([...recent, lateLocal, earlyLocal], { now: NOW, tzOffsetMs: tz });
		expect(r.keep).toContain('late');
		expect(r.drop).toContain('early');
	});

	it('keeps every risky snapshot for 48 hours, then only as a daily', () => {
		const risky = [1, 2, 3, 4].map((h) => snap(NOW - h * H, { kind: 'risky' }));
		const oldRisky = snap(NOW - 49 * H, { kind: 'risky' });
		const oldRiskyLater = snap(NOW - 50 * H, { kind: 'risky' });
		const autos = [snap(NOW - 1000), snap(NOW - 2000), snap(NOW - 3000), snap(NOW - 4000)];
		const r = retain([...risky, oldRisky, oldRiskyLater, ...autos], { now: NOW });
		for (const s of risky) expect(r.keep).toContain(s.id);
		expect(r.keep).toContain(oldRisky.id); // the newest of its day
		expect(r.drop).toContain(oldRiskyLater.id);
		expect(r.drop).toContain(autos[3].id);
	});

	it('does not count risky snapshots among the last three automatic ones', () => {
		const autos = [snap(NOW - 5 * H), snap(NOW - 6 * H), snap(NOW - 7 * H)];
		const risky = [snap(NOW - 1000, { kind: 'risky' }), snap(NOW - 2000, { kind: 'risky' })];
		const r = retain([...risky, ...autos], { now: NOW });
		expect(r.drop).toEqual([]);
	});

	it('drops bad snapshots', () => {
		const bad = snap(NOW - 1000, { bad: true });
		const good = snap(NOW - 2000);
		const r = retain([bad, good], { now: NOW });
		expect(r.keep).toEqual([good.id]);
		expect(r.drop).toEqual([bad.id]);
	});

	it('never drops the newest good snapshot, even when it is old', () => {
		const ancient = snap(NOW - 400 * D);
		const r = retain([ancient], { now: NOW });
		expect(r.keep).toEqual([ancient.id]);
	});

	it('never drops the newest good snapshot when newer ones are bad', () => {
		const good = snap(NOW - 30 * D);
		const bads = [snap(NOW - 1000, { bad: true }), snap(NOW - 2000, { bad: true })];
		const r = retain([...bads, good], { now: NOW });
		expect(r.keep).toEqual([good.id]);
	});

	it('ignores snapshots dated in the future when choosing days, but keeps them as the newest', () => {
		const future = snap(NOW + D);
		const r = retain([future, snap(NOW - 1000)], { now: NOW });
		expect(r.keep).toContain(future.id);
	});

	describe('the size budget', () => {
		it('drops the oldest dailies first', () => {
			const recent = [snap(NOW - 1000), snap(NOW - 2000), snap(NOW - 3000)];
			const dailies = [1, 2, 3, 4].map((d) => snap(NOW - d * D));
			const r = retain([...recent, ...dailies], { now: NOW, budgetBytes: 55 });
			expect(r.drop.sort()).toEqual(ids([dailies[3], dailies[2]]));
			expect(r.bytes).toBe(50);
			expect(r.overBudget).toBe(false);
		});

		it('then the oldest risky snapshots, then the oldest automatic ones', () => {
			const autos = [snap(NOW - 1000), snap(NOW - 2000), snap(NOW - 3000)];
			const risky = [snap(NOW - H, { kind: 'risky' }), snap(NOW - 2 * H, { kind: 'risky' })];
			const r = retain([...autos, ...risky], { now: NOW, budgetBytes: 30 });
			expect(r.drop.sort()).toEqual(ids([risky[1], risky[0]]));
			const r2 = retain([...autos, ...risky], { now: NOW, budgetBytes: 15 });
			expect(r2.keep).toEqual([autos[0].id]);
		});

		it('reports when the budget cannot be met: the newest stays', () => {
			const big = snap(NOW - 1000, { size: 500 });
			const r = retain([big, snap(NOW - 2000)], { now: NOW, budgetBytes: 100 });
			expect(r.keep).toEqual([big.id]);
			expect(r.overBudget).toBe(true);
			expect(r.bytes).toBe(500);
		});
	});
});

describe('budgetBytes', () => {
	it('is a share of the quota, at most a share of what is free', () => {
		expect(budgetBytes({ quota: 1000, free: 1000 })).toBe(50);
		expect(budgetBytes({ quota: 1000, free: 100 })).toBe(25);
	});

	it('falls back to a fixed size when the browser does not say', () => {
		expect(budgetBytes({})).toBe(R.fallbackBudgetBytes);
		expect(budgetBytes({ quota: 1000 })).toBe(50);
	});
});

import { describe, expect, it } from 'vitest';
import type { StoreEvent } from '../types';
import { createSnapshotter, type SnapshotterEnv } from './scheduler';
import type { SnapshotInfo, SnapshotReason } from './types';

const MIN = 60_000;

/** A store with a change counter, and a clock, idle queue, timers and page you drive by hand. */
function rig() {
	const state = { seq: 0, last: undefined as { at: number; seq: number } | undefined, t: 0 };
	const taken: { reason: SnapshotReason; seq: number; signal?: AbortSignal }[] = [];
	let hold: Promise<void> | undefined;
	let fail = false;
	let failReads = false;
	const listeners = new Set<(e: StoreEvent) => void>();
	const idle: (() => void)[] = [];
	const timers = new Map<number, { at: number; fn: () => void }>();
	const hidden = new Set<() => void>();
	let timerId = 0;

	const env: SnapshotterEnv = {
		now: () => state.t,
		requestIdle(fn) {
			idle.push(fn);
			return () => idle.splice(idle.indexOf(fn), 1);
		},
		setTimeout(fn, ms) {
			timers.set(++timerId, { at: state.t + ms, fn });
			return timerId;
		},
		clearTimeout: (id) => void timers.delete(id),
		onHidden(fn) {
			hidden.add(fn);
			return () => hidden.delete(fn);
		}
	};

	const snapshots = {
		seq: async () => {
			if (failReads) throw new Error('the page is going');
			return state.seq;
		},
		last: async () => state.last,
		async take(reason: SnapshotReason, options: { signal?: AbortSignal } = {}) {
			const seq = state.seq;
			taken.push({ reason, seq, signal: options.signal });
			if (hold) await hold;
			if (fail) throw new Error('quota');
			if (options.signal?.aborted) return undefined;
			state.last = { at: state.t, seq };
			return { id: `s${taken.length}`, at: state.t, reason } as SnapshotInfo;
		}
	};

	const snapshotter = createSnapshotter({ snapshots, subscribe: (fn) => (listeners.add(fn), () => listeners.delete(fn)), env });

	const flush = async () => {
		for (let i = 0; i < 10; i++) await Promise.resolve();
		await new Promise((r) => setTimeout(r, 0));
	};
	return {
		state,
		taken,
		snapshotter,
		/** A committed edit: the counter moves and the store says so. */
		async edit(n = 1, tables = ['take', 'outbox']) {
			state.seq += n;
			for (const l of listeners) l({ tables });
			await flush();
		},
		async runIdle() {
			while (idle.length) idle.shift()!();
			await flush();
		},
		async advance(ms: number) {
			state.t += ms;
			for (const [id, timer] of [...timers]) {
				if (timer.at <= state.t) {
					timers.delete(id);
					timer.fn();
				}
			}
			await flush();
		},
		async hide() {
			for (const fn of hidden) fn();
			await flush();
		},
		idle,
		timers,
		listeners,
		holdTakes() {
			let release!: () => void;
			hold = new Promise((r) => (release = r));
			return async () => {
				hold = undefined;
				release();
				await flush();
			};
		},
		failTakes: (on: boolean) => (fail = on),
		failReads: (on: boolean) => (failReads = on),
		flush
	};
}

describe('createSnapshotter', () => {
	it('takes a snapshot after the first change, when idle, never during the edit', async () => {
		const r = rig();
		await r.edit();
		expect(r.taken).toEqual([]);
		await r.runIdle();
		expect(r.taken.map((t) => t.reason)).toEqual(['changes']);
	});

	it('waits for the interval after that, then takes one with the changes since', async () => {
		const r = rig();
		await r.edit();
		await r.runIdle();
		await r.edit();
		await r.runIdle();
		expect(r.taken).toHaveLength(1);
		await r.advance(10 * MIN);
		await r.runIdle();
		expect(r.taken).toHaveLength(2);
		expect(r.taken[1].seq).toBe(2);
	});

	it('takes one at once when 200 changes pile up', async () => {
		const r = rig();
		await r.edit();
		await r.runIdle();
		await r.edit(200);
		await r.runIdle();
		expect(r.taken).toHaveLength(2);
	});

	it('does nothing on a timer alone: no change, no snapshot', async () => {
		const r = rig();
		await r.edit();
		await r.runIdle();
		await r.advance(60 * MIN);
		await r.runIdle();
		expect(r.taken).toHaveLength(1);
		expect(r.timers.size).toBe(0);
	});

	it('ignores its own writes and off-device marks', async () => {
		const r = rig();
		await r.edit();
		await r.runIdle();
		r.state.t += 20 * MIN;
		for (const l of r.listeners) l({ tables: ['snapshots'] });
		for (const l of r.listeners) l({ tables: ['meta'] });
		await r.runIdle();
		expect(r.taken).toHaveLength(1);
	});

	it('skips while one is still writing, and checks again once it is done', async () => {
		const r = rig();
		const release = r.holdTakes();
		await r.edit();
		await r.runIdle();
		expect(r.snapshotter.writing).toBe(true);
		await r.edit(300);
		await r.runIdle();
		expect(r.taken).toHaveLength(1);
		await release();
		await r.runIdle();
		expect(r.taken).toHaveLength(2);
		expect(r.taken[1].seq).toBe(301);
	});

	it('takes one at once when the page hides with changes, without waiting for idle', async () => {
		const r = rig();
		await r.edit();
		await r.runIdle();
		await r.edit();
		await r.hide();
		expect(r.taken.map((t) => t.reason)).toEqual(['changes', 'hidden']);
		await r.hide();
		expect(r.taken).toHaveLength(2);
	});

	it('snapshotBefore takes one now, after the one being written, whatever the policy says', async () => {
		const r = rig();
		await r.edit();
		await r.runIdle();
		const info = await r.snapshotter.snapshotBefore('deleteProject');
		expect(info!.reason).toBe('deleteProject');
		expect(r.taken.map((t) => t.reason)).toEqual(['changes', 'deleteProject']);

		const release = r.holdTakes();
		await r.edit();
		await r.advance(10 * MIN);
		await r.runIdle();
		const before = r.snapshotter.snapshotBefore('bulkEdit');
		await r.flush();
		expect(r.taken.map((t) => t.reason)).toEqual(['changes', 'deleteProject', 'changes']);
		await release();
		expect((await before)!.reason).toBe('bulkEdit');
	});

	it('snapshotBefore answers undefined when the snapshot fails: the caller decides', async () => {
		const r = rig();
		r.failTakes(true);
		expect(await r.snapshotter.snapshotBefore('zipRestore')).toBeUndefined();
		expect(r.snapshotter.lastError).toBeInstanceOf(Error);
	});

	it('abort() stops the snapshot being written', async () => {
		const r = rig();
		const release = r.holdTakes();
		await r.edit();
		await r.runIdle();
		r.snapshotter.abort();
		expect(r.taken[0].signal!.aborted).toBe(true);
		await release();
		expect(r.state.last).toBeUndefined();
	});

	it('a failed automatic snapshot is kept as the last error and tried again on the next change', async () => {
		const r = rig();
		r.failTakes(true);
		await r.edit();
		await r.runIdle();
		expect(r.snapshotter.lastError).toBeInstanceOf(Error);
		r.failTakes(false);
		await r.edit();
		await r.runIdle();
		expect(r.taken).toHaveLength(2);
		expect(r.snapshotter.lastError).toBeUndefined();
	});

	it('stop() lets go of the store, the page and the timers', async () => {
		const r = rig();
		await r.edit();
		await r.runIdle();
		await r.edit();
		expect(r.timers.size + r.idle.length).toBeGreaterThan(0);
		r.snapshotter.stop();
		expect(r.listeners.size).toBe(0);
		expect(r.timers.size).toBe(0);
		expect(r.idle).toHaveLength(0);
	});

	it('keeps a failed look quiet, as lastError, and looks again on the next change', async () => {
		const r = rig();
		r.failReads(true);
		await r.edit();
		await r.runIdle();
		await r.hide();
		expect(r.taken).toEqual([]);
		expect(String(r.snapshotter.lastError)).toContain('the page is going');
		r.failReads(false);
		await r.edit();
		await r.runIdle();
		expect(r.taken.map((t) => t.reason)).toEqual(['changes']);
		expect(r.snapshotter.lastError).toBeUndefined();
	});
});

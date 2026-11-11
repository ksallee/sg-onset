// When snapshots run: after changes, when the page is idle, never on the capture path. The edge:
// it listens to the store and the page and owns the timers. The rule is `policy.ts`.
//
// - A committed change asks for an idle callback. There the policy decides; if a snapshot is not
//   due yet, a timer looks again when the interval runs out. No change, no timer.
// - One snapshot at a time. A change while one is written is looked at once it is done.
// - The page hiding with changes takes one at once: best effort, the page may be frozen first.
// - `snapshotBefore(reason)` takes one now, after the one being written, whatever the policy.
// - A failed snapshot is kept in `lastError` and tried again on the next change, not in a loop.

import { DEFAULT_SNAPSHOT_POLICY, nextCheckAt, snapshotDue, type SnapshotPolicy } from './policy';
import type { Snapshots } from './snapshots';
import type { RiskyReason, SnapshotInfo, SnapshotReason } from './types';
import type { StoreEvent } from '../types';

export type SnapshotterEnv = {
	now(): number;
	/** Runs `fn` when the page is idle, at the latest after `timeoutMs`. Returns the cancel. */
	requestIdle(fn: () => void, timeoutMs: number): () => void;
	setTimeout(fn: () => void, ms: number): number;
	clearTimeout(id: number): void;
	/** Calls `fn` when the page is being hidden. Returns the unsubscribe. */
	onHidden(fn: () => void): () => void;
};

export interface Snapshotter {
	/**
	 * Takes a snapshot before a risky operation. Await it, then do the operation. Undefined when
	 * the snapshot failed (see `lastError`): the caller decides whether to go on.
	 */
	snapshotBefore(reason: RiskyReason): Promise<SnapshotInfo | undefined>;
	/** Stops the snapshot being written. Nothing of it is kept. */
	abort(): void;
	/** Lets go of the store, the page and the timers. */
	stop(): void;
	/** A snapshot is being written. */
	readonly writing: boolean;
	/** Why the last snapshot failed. Cleared by the next that succeeds. */
	readonly lastError: unknown;
}

/** Tables whose changes are not the user's data: the snapshots' own, and the off-device marks. */
const OWN = new Set(['snapshots', 'meta']);

export function browserSnapshotEnv(): SnapshotterEnv {
	return {
		now: () => Date.now(),
		requestIdle(fn, timeoutMs) {
			if (typeof requestIdleCallback === 'function') {
				const id = requestIdleCallback(() => fn(), { timeout: timeoutMs });
				return () => cancelIdleCallback(id);
			}
			const id = setTimeout(fn, 200);
			return () => clearTimeout(id);
		},
		setTimeout: (fn, ms) => setTimeout(fn, ms) as unknown as number,
		clearTimeout: (id) => clearTimeout(id),
		onHidden(fn) {
			if (typeof document === 'undefined') return () => {};
			const visibility = () => {
				if (document.visibilityState === 'hidden') fn();
			};
			document.addEventListener('visibilitychange', visibility);
			window.addEventListener('pagehide', fn);
			return () => {
				document.removeEventListener('visibilitychange', visibility);
				window.removeEventListener('pagehide', fn);
			};
		}
	};
}

export function createSnapshotter(options: {
	snapshots: Pick<Snapshots, 'take' | 'seq' | 'last'>;
	subscribe(listener: (event: StoreEvent) => void): () => void;
	env?: SnapshotterEnv;
	policy?: SnapshotPolicy;
}): Snapshotter {
	const { snapshots, env = browserSnapshotEnv(), policy = DEFAULT_SNAPSHOT_POLICY } = options;
	let writing: Promise<SnapshotInfo | undefined> | undefined;
	let controller: AbortController | undefined;
	let cancelIdle: (() => void) | undefined;
	let timer: number | undefined;
	let stopped = false;
	let lastError: unknown;

	function clearTimer(): void {
		if (timer !== undefined) env.clearTimeout(timer);
		timer = undefined;
	}

	/** Asks for a look when the page is idle. */
	function request(): void {
		if (stopped || writing || cancelIdle) return;
		clearTimer();
		cancelIdle = env.requestIdle(() => {
			cancelIdle = undefined;
			void check(false);
		}, policy.idleTimeoutMs);
	}

	async function check(hidden: boolean): Promise<void> {
		if (stopped || writing) return;
		const [seq, last] = await Promise.all([snapshots.seq(), snapshots.last()]);
		if (stopped || writing) return;
		const due = snapshotDue({ now: env.now(), seq, last, writing: false, hidden }, policy);
		if (due.due) {
			const info = await run(due.reason);
			// Changes made while it was written get their look. Not after a failure or an abort.
			if (info) request();
			return;
		}
		const at = nextCheckAt({ seq, last }, policy);
		if (at === undefined) return;
		clearTimer();
		timer = env.setTimeout(
			() => {
				timer = undefined;
				request();
			},
			Math.max(0, at - env.now())
		);
	}

	function run(reason: SnapshotReason): Promise<SnapshotInfo | undefined> {
		const ctrl = new AbortController();
		controller = ctrl;
		const done = snapshots.take(reason, { signal: ctrl.signal }).then(
			(info) => {
				lastError = undefined;
				return info;
			},
			(error: unknown) => {
				lastError = error;
				return undefined;
			}
		);
		writing = done;
		return done.finally(() => {
			if (writing === done) writing = undefined;
			if (controller === ctrl) controller = undefined;
		});
	}

	const unsubscribe = options.subscribe((event) => {
		if (event.tables.some((t) => !OWN.has(t))) request();
	});
	const unhide = env.onHidden(() => {
		if (!writing) void check(true);
	});

	return {
		async snapshotBefore(reason) {
			while (writing) await writing;
			return run(reason);
		},
		abort() {
			controller?.abort();
		},
		stop() {
			stopped = true;
			unsubscribe();
			unhide();
			clearTimer();
			cancelIdle?.();
			cancelIdle = undefined;
			controller?.abort();
		},
		get writing() {
			return writing !== undefined;
		},
		get lastError() {
			return lastError;
		}
	};
}

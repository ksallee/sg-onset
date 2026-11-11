// The retry schedule. Pure: the attempt count and the jitter are passed in.

import type { Policy } from './types';

/**
 * How long to wait after attempt number `attempts` (1 is the first). Doubles from `baseMs` up to
 * `maxMs`. `jitter` is a number from 0 to 1 (pass `Math.random()`): the wait is between half the
 * delay and the whole of it, so a set of iPads does not retry in step.
 */
export function backoffMs(attempts: number, policy: Pick<Policy, 'baseMs' | 'factor' | 'maxMs'>, jitter: number): number {
	const exponent = Math.max(0, attempts - 1);
	const delay = Math.min(policy.maxMs, policy.baseMs * policy.factor ** exponent);
	return Math.round(delay * (0.5 + 0.5 * Math.min(1, Math.max(0, jitter))));
}

/** No attempts left. */
export function exhausted(attempts: number, policy: Pick<Policy, 'maxAttempts'>): boolean {
	return attempts >= policy.maxAttempts;
}

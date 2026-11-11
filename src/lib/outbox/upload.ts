// The upload policy the runner needs: how a file is cut into parts, and when an upload URL is too
// old to start a part on. Pure.

export type Part = { index: number; start: number; end: number };

/** The byte ranges to send. No part size, or a file smaller than one, is a single part. */
export function planParts(size: number, partSize?: number): Part[] {
	if (!partSize || partSize <= 0 || size <= partSize) return [{ index: 0, start: 0, end: size }];
	const parts: Part[] = [];
	for (let start = 0; start < size; start += partSize) {
		parts.push({ index: parts.length, start, end: Math.min(size, start + partSize) });
	}
	return parts;
}

/**
 * The time a URL must have left for the next part to start on it: the policy's margin, or one
 * and a half times what the last part took, whichever is longer. A slow network widens it.
 */
export function partMargin(marginMs: number, lastPartMs: number): number {
	return Math.max(marginMs, Math.round(lastPartMs * 1.5));
}

/** True when the URL has less than `marginMs` left. Upload URLs die after about 14 minutes. */
export function expiring(expiresAt: number | undefined, now: number, marginMs: number): boolean {
	return expiresAt !== undefined && expiresAt - now < marginMs;
}

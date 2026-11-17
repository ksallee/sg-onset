// How many photos, videos and audio notes, each counted and named as itself (Kevin, 2026-11-17,
// #89): "2 photos, 1 video, 1 audio note". An annotated copy goes with its photo and a setup
// diagram is the slate's own: neither is counted. Pure.

import type { Media } from '$lib/export/wrapPackage';
import { tk } from '$lib/i18n/messages';
import { plural } from './make';

export type CountedMedia = 'photo' | 'video' | 'audio';
export type MediaCounts = Partial<Record<CountedMedia, number>>;

/** The kinds counted, in the order they are named. */
export const COUNTED: readonly CountedMedia[] = ['photo', 'video', 'audio'];

/** What a file counts as; undefined: not counted. */
export function countedAs(media: Media): CountedMedia | undefined {
	return media === 'photo' || media === 'video' || media === 'audio' ? media : undefined;
}

/** `counts` with one more file of `media`. */
export function addCount(counts: MediaCounts, media: Media): MediaCounts {
	const kind = countedAs(media);
	return kind ? { ...counts, [kind]: (counts[kind] ?? 0) + 1 } : counts;
}

export function totalOf(counts: MediaCounts): number {
	return COUNTED.reduce((n, k) => n + (counts[k] ?? 0), 0);
}

/**
 * "2 photos, 1 video, 1 audio note": each kind of `kinds` there is, in that order. None of them:
 * the first with 0, "0 photos".
 */
export function countLine(counts: MediaCounts, kinds: readonly CountedMedia[] = COUNTED): string {
	const said = kinds.filter((k) => (counts[k] ?? 0) > 0).map((k) => tk(plural(`wrap.count.${k}`, counts[k]!), { n: counts[k]! }));
	return said.length ? said.join(', ') : tk(plural(`wrap.count.${kinds[0]}`, 0), { n: 0 });
}

// The size notice for videos added to a take (Kevin, 2026-11-17, #94): a video over 100 MB takes
// room on the device and a long time to sync, so the notice says its size. It blocks nothing, and
// videos are always taken. An audio note (#89) gets none: at 128 kbps, high for speech, an hour is
// about 58 MB, and a file over 32 MiB goes up in parts. Pure.

import { formatBytes } from '$lib/app/format';
import { mediaKind, type KindLabel } from './library';

/** Over this a video gets the notice. Decimal, as iOS shows storage. */
export const LARGE_VIDEO = 100_000_000;

export function isLargeVideo(type: string, size: number): boolean {
	return mediaKind(type) === 'video' && size > LARGE_VIDEO;
}

/** The notice for the large videos among files added at once: one video's size, or several with their total. None: no notice. */
export function sizeNotice(files: readonly { type: string; size: number }[]): KindLabel | undefined {
	const large = files.filter((f) => isLargeVideo(f.type, f.size));
	if (!large.length) return undefined;
	const size = formatBytes(large.reduce((n, f) => n + f.size, 0));
	return large.length === 1 ? { key: 'take.video.large', params: { size } } : { key: 'take.videos.large', params: { n: large.length, size } };
}

// Hand a made file (the exported WAV, the session JSON, credits) to the person: the share sheet
// where it takes files (iOS: Save to Files, AirDrop…), else a download link. Downloads from an
// iOS home-screen app are unreliable, so the share sheet comes first.

import { shareMode } from './share';

export type Handed = 'shared' | 'downloaded' | 'cancelled';

/**
 * Shares or downloads `blob` as `name`. The share sheet needs a recent tap: after a long export
 * the browser may refuse it (NotAllowedError), and the file is downloaded instead.
 */
export async function shareOrDownload(blob: Blob, name: string): Promise<Handed> {
	const file = new File([blob], name, { type: blob.type || 'application/octet-stream' });
	const mode = shareMode({
		share: typeof navigator.share === 'function',
		canShareFiles: typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })
	});
	if (mode === 'share') {
		try {
			await navigator.share({ files: [file], title: name });
			return 'shared';
		} catch (e) {
			if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
		}
	}
	download(blob, name);
	return 'downloaded';
}

/** The `<a download>` way. */
export function download(blob: Blob, name: string): void {
	const url = URL.createObjectURL(blob);
	const a = Object.assign(document.createElement('a'), { href: url, download: name });
	document.body.append(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

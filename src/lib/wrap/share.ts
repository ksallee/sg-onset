// How a made file reaches the person: the share sheet where the browser takes files (iPadOS:
// AirDrop, Files, Mail), else a download. And what a failed share means. Pure: the browser's
// `navigator` comes in as an argument.

export type ShareNavigator = {
	share?: (data: ShareData) => Promise<void>;
	canShare?: (data: ShareData) => boolean;
};

export type HandOverMode = 'share' | 'download';

export function handOverMode(nav: ShareNavigator, file: File): HandOverMode {
	if (typeof nav.share !== 'function' || typeof nav.canShare !== 'function') return 'download';
	try {
		return nav.canShare({ files: [file] }) ? 'share' : 'download';
	} catch {
		return 'download';
	}
}

/**
 * What a share that threw means:
 * - `cancelled`: the person closed the sheet. Keep the file, do nothing.
 * - `needsTap`: the browser wants a fresh tap (the build took too long). Ask for one.
 * - `download`: the share failed. Download instead.
 */
export function shareOutcome(error: unknown): 'cancelled' | 'needsTap' | 'download' {
	const name = error instanceof DOMException || error instanceof Error ? error.name : '';
	if (name === 'AbortError') return 'cancelled';
	if (name === 'NotAllowedError') return 'needsTap';
	return 'download';
}

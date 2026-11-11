// How to hand a file to the person: the share sheet (iOS: Save to Files, AirDrop, Messages…)
// when it takes files, else a download. Pure; `pwa/files.ts` does it.

export type ShareCaps = {
	/** `navigator.share` exists. */
	share: boolean;
	/** `navigator.canShare({ files: [file] })` said yes for this file. */
	canShareFiles: boolean;
};

export type ShareMode = 'share' | 'download';

export function shareMode(caps: ShareCaps): ShareMode {
	return caps.share && caps.canShareFiles ? 'share' : 'download';
}

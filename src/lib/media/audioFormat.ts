// The sound of an audio note (#89): the type the browser is asked to write, the type its file is
// stored and sent under, and its extension. Kept as the browser writes it, never converted (Kevin,
// 2026-11-17): AAC in MP4 from Safari, Opus in WebM from Chrome. Flow PT takes either on a
// Version and makes an AAC mp4 of it (findings/152). The microphone itself is `microphone.ts`.
// Pure.

/**
 * The types asked for, in order. AAC in MP4 first: Safari writes it, and QuickTime and every
 * browser play it. Then Opus in WebM, Chrome's and Firefox's. A bare `audio/mp4` comes after WebM:
 * in Chrome it may hold Opus, which QuickTime does not play.
 */
export const AUDIO_TYPES = ['audio/mp4;codecs=mp4a.40.2', 'audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'] as const;

/** The type to ask the browser for, by `MediaRecorder.isTypeSupported`. None: the browser picks. */
export function pickAudioType(supported: (type: string) => boolean): string | undefined {
	return AUDIO_TYPES.find((type) => supported(type));
}

/** A type without its parameters, in lower case: `audio/webm;codecs=opus` is `audio/webm`. */
const bare = (type: string | undefined) => (type ?? '').split(';')[0].trim().toLowerCase();

export function isAudio(type: string): boolean {
	return bare(type).startsWith('audio/');
}

/**
 * The type a note's file is stored and sent under: the one the browser reports, without its
 * codecs. A WebM or MP4 reported as video holds sound only here, so it is stored as audio: the app
 * and the Version then name it an audio note. Flow PT's own `content_type` cannot tell them apart
 * (findings/152). Nothing usable reported: the type asked for, else AAC in MP4.
 */
export function audioType(reported: string | undefined, asked?: string): string {
	for (const type of [bare(reported), bare(asked)]) {
		if (type.startsWith('audio/')) return type;
		const container = /^video\/(webm|mp4|ogg)$/.exec(type)?.[1];
		if (container) return `audio/${container}`;
	}
	return 'audio/mp4';
}

/** The extension of each audio type a browser or a phone writes. */
export const AUDIO_EXTENSIONS: Readonly<Record<string, string>> = {
	'audio/mp4': 'm4a',
	'audio/x-m4a': 'm4a',
	'audio/aac': 'aac',
	'audio/webm': 'webm',
	'audio/ogg': 'ogg',
	'audio/mpeg': 'mp3',
	'audio/wav': 'wav'
};

/** The extension of an audio type. Undefined: not one we know. */
export function audioExtension(type: string): string | undefined {
	return AUDIO_EXTENSIONS[bare(type)];
}

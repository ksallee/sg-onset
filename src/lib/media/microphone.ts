// The microphone, behind a thin port: open it with the person's permission, hear it with
// MediaRecorder, hand back the whole file, let it go. Which type to ask for and what the file is
// stored under are `audioFormat.ts`, pure. The browser is passed in, so a test runs it on a fake.
//
// Bytes are asked for each second (`start(1000)`): a recorder that errors keeps what it had. When
// the system takes the microphone back (a call, the screen locked), the track ends, the recorder
// stops with what it heard, and `onEnd` says so: the caller keeps the file.

import { audioType, pickAudioType } from './audioFormat';

/** What the port needs of the browser. */
export type MicEnv = {
	getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
	Recorder?: {
		new (stream: MediaStream, options?: MediaRecorderOptions): MediaRecorder;
		isTypeSupported?: (type: string) => boolean;
	};
};

/** One audio note being heard. */
export interface AudioCapture {
	/** Ends it and gives the whole file, typed as stored. Called again: the same file. */
	stop(): Promise<Blob>;
	/** Ends it and keeps nothing. */
	cancel(): void;
}

/** This browser's microphone and recorder, where it has them. */
export function browserMic(): MicEnv {
	const devices = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices;
	return {
		getUserMedia: devices?.getUserMedia ? (c) => devices.getUserMedia(c) : undefined,
		Recorder: typeof MediaRecorder === 'undefined' ? undefined : MediaRecorder
	};
}

/**
 * Opens the microphone and starts hearing it. Throws what `getUserMedia` throws (`NotAllowedError`
 * when the person said no), or `NotSupportedError` where the browser cannot.
 */
export async function openMicrophone(onEnd: () => void, env: MicEnv = browserMic()): Promise<AudioCapture> {
	const { getUserMedia, Recorder } = env;
	if (!getUserMedia || !Recorder) throw new DOMException('This browser cannot use the microphone', 'NotSupportedError');
	const stream = await getUserMedia({ audio: true });
	const release = () => stream.getTracks().forEach((track) => track.stop());
	const asked = pickAudioType((type) => Recorder.isTypeSupported?.(type) ?? false);
	let recorder: MediaRecorder;
	try {
		recorder = asked ? new Recorder(stream, { mimeType: asked }) : new Recorder(stream);
	} catch (error) {
		release();
		throw error;
	}

	const chunks: Blob[] = [];
	let dropped = false;
	let ended = false;
	const done = new Promise<Blob>((resolve) => {
		const finish = () => {
			release();
			resolve(new Blob(dropped ? [] : chunks, { type: audioType(recorder.mimeType || chunks[0]?.type, asked) }));
		};
		recorder.onstop = finish;
		// An error stops the recorder too; what was heard is kept.
		recorder.onerror = () => {
			if (recorder.state === 'inactive') finish();
		};
	});
	recorder.ondataavailable = (e) => {
		if (e.data.size > 0) chunks.push(e.data);
	};
	for (const track of stream.getTracks()) {
		track.addEventListener('ended', () => {
			if (ended) return;
			ended = true;
			onEnd();
		});
	}
	recorder.start(1000);

	const end = () => {
		ended = true;
		if (recorder.state !== 'inactive') recorder.stop();
	};
	return {
		stop() {
			end();
			return done;
		},
		cancel() {
			dropped = true;
			end();
			release();
		}
	};
}

// The microphone port on a fake browser: what it asks for, what file it gives, that it lets the
// microphone go. The real MediaRecorder runs in the e2e (Chromium's fake device).
import { describe, expect, it, vi } from 'vitest';
import { openMicrophone, type MicEnv } from './microphone';

class FakeTrack {
	stopped = false;
	#ended: (() => void)[] = [];
	addEventListener(_: 'ended', fn: () => void) {
		this.#ended.push(fn);
	}
	stop() {
		this.stopped = true;
	}
	/** The system took the microphone back. */
	end() {
		this.#ended.forEach((fn) => fn());
	}
}

function fakeBrowser(browser: { writes?: string[]; reports?: string; deny?: string } = {}) {
	const track = new FakeTrack();
	const stream = { getTracks: () => [track] } as unknown as MediaStream;
	const made: FakeRecorder[] = [];
	class FakeRecorder {
		static isTypeSupported = (type: string) => (browser.writes ?? []).includes(type);
		state: 'inactive' | 'recording' = 'inactive';
		mimeType: string;
		timeslice?: number;
		ondataavailable: ((e: { data: Blob }) => void) | null = null;
		onstop: (() => void) | null = null;
		onerror: (() => void) | null = null;
		constructor(
			readonly stream: MediaStream,
			readonly options?: { mimeType?: string }
		) {
			this.mimeType = browser.reports ?? options?.mimeType ?? '';
			made.push(this);
		}
		start(timeslice?: number) {
			this.state = 'recording';
			this.timeslice = timeslice;
		}
		/** A second of sound arrives. */
		hear(bytes: number) {
			this.ondataavailable?.({ data: new Blob([new Uint8Array(bytes)]) });
		}
		stop() {
			if (this.state === 'inactive') return;
			this.state = 'inactive';
			this.hear(3);
			this.onstop?.();
		}
	}
	const getUserMedia = vi.fn(async (constraints: MediaStreamConstraints) => {
		if (browser.deny) throw new DOMException('no', browser.deny);
		expect(constraints).toEqual({ audio: true });
		return stream;
	});
	const env: MicEnv = { getUserMedia, Recorder: FakeRecorder as unknown as MicEnv['Recorder'] };
	return { env, track, made, getUserMedia };
}

describe('openMicrophone', () => {
	it('asks for the type the browser writes best, and gives the whole file under it', async () => {
		const b = fakeBrowser({ writes: ['audio/mp4;codecs=mp4a.40.2', 'audio/webm'] });
		const capture = await openMicrophone(() => {}, b.env);
		const [recorder] = b.made;
		expect(recorder.options).toEqual({ mimeType: 'audio/mp4;codecs=mp4a.40.2' });
		// Bytes come each second, so a recorder that fails keeps what it had.
		expect(recorder.timeslice).toBe(1000);
		recorder.hear(5);
		recorder.hear(7);
		const file = await capture.stop();
		expect(file.size).toBe(15);
		expect(file.type).toBe('audio/mp4');
		expect(b.track.stopped).toBe(true);
	});

	it('lets the browser pick when it writes none of the types asked, and stores what it says', async () => {
		const b = fakeBrowser({ writes: [], reports: 'video/webm;codecs=opus' });
		const capture = await openMicrophone(() => {}, b.env);
		expect(b.made[0].options).toBeUndefined();
		expect((await capture.stop()).type).toBe('audio/webm');
	});

	it('says when the system took the microphone, and the file is still whole', async () => {
		const b = fakeBrowser({ writes: ['audio/webm;codecs=opus'] });
		const ended = vi.fn();
		const capture = await openMicrophone(ended, b.env);
		b.made[0].hear(4);
		b.track.end();
		expect(ended).toHaveBeenCalledOnce();
		const file = await capture.stop();
		expect(file.size).toBe(7);
		expect(await capture.stop()).toBe(file);
	});

	it('throws nothing away but what is cancelled, and lets the microphone go', async () => {
		const b = fakeBrowser({ writes: ['audio/webm'] });
		const capture = await openMicrophone(() => {}, b.env);
		capture.cancel();
		expect(b.made[0].state).toBe('inactive');
		expect(b.track.stopped).toBe(true);
	});

	it('passes on why the browser refused', async () => {
		const b = fakeBrowser({ deny: 'NotAllowedError' });
		await expect(openMicrophone(() => {}, b.env)).rejects.toMatchObject({ name: 'NotAllowedError' });
	});

	it('is not supported where the browser has no microphone or no recorder', async () => {
		await expect(openMicrophone(() => {}, {})).rejects.toMatchObject({ name: 'NotSupportedError' });
		const b = fakeBrowser();
		await expect(openMicrophone(() => {}, { getUserMedia: b.getUserMedia })).rejects.toMatchObject({ name: 'NotSupportedError' });
		expect(b.getUserMedia).not.toHaveBeenCalled();
	});
});

// An audio note being made from the take sheet: the Record and Save press, the time it has run, why
// the microphone did not open. The steps are audioNote.ts, pure; the microphone is
// media/microphone.ts. A press changes the row at once; nothing on screen waits for the
// microphone. When the sheet closes or the page goes to the background, what was heard is kept.
// Make it while the component initialises.

import { t } from '$lib/i18n/messages';
import { openMicrophone, type AudioCapture } from '$lib/media/microphone';
import { IDLE, micIssue, micIssueKey, noteEnded, noteFailed, noteOpened, notePress, type NotePhase, type NoteStep } from './audioNote';
import { elapsedMs, formatElapsed, nextSecondIn } from './record';

export class AudioNoteCapture {
	readonly #save: (file: Blob, at: number) => void;
	readonly #now: () => number;
	#capture: AudioCapture | null = null;

	phase = $state.raw<NotePhase>(IDLE);
	/** Why the microphone did not open, in words. */
	issue = $state<string | null>(null);
	/** The clock, moved each whole second while it runs. */
	now = $state(Date.now());

	/** Add shows; anything else shows Save. */
	readonly busy = $derived(this.phase.kind !== 'idle');
	/** How long the microphone has been heard. */
	readonly elapsed = $derived(this.phase.kind === 'running' ? formatElapsed(elapsedMs({ start: this.phase.since, end: null }, this.now)) : formatElapsed(0));

	/** `save` gets the whole file and the time of the press that began it. */
	constructor(save: (file: Blob, at: number) => void, now: () => number = Date.now) {
		this.#save = save;
		this.#now = now;
		$effect(() => {
			const phase = this.phase;
			if (phase.kind !== 'running') return;
			let timer: ReturnType<typeof setTimeout>;
			const look = () => {
				this.now = this.#now();
				timer = setTimeout(look, nextSecondIn(phase.since, this.now) + 4);
			};
			look();
			return () => clearTimeout(timer);
		});
		// The page goes to the background: iPadOS may take the microphone or the page. Keep what was heard.
		$effect(() => {
			const away = () => document.visibilityState === 'hidden' && this.end();
			document.addEventListener('visibilitychange', away);
			return () => {
				document.removeEventListener('visibilitychange', away);
				this.end();
			};
		});
	}

	/** Record Audio Note, then Save Audio Note. */
	press() {
		this.#step(notePress(this.phase, this.#now()));
	}

	/** It ends with no press: the sheet closed. What was heard is kept. */
	end() {
		this.#step(noteEnded(this.phase));
	}

	#step(step: NoteStep) {
		const before = this.phase;
		this.phase = step.phase;
		if (step.effect === 'open') void this.#open();
		else if (step.effect === 'save' && before.kind === 'running') this.#keep(before.at);
		else if (step.effect === 'drop') this.#drop();
	}

	async #open() {
		this.issue = null;
		try {
			const capture = await openMicrophone(() => this.end());
			this.#capture = capture;
			this.#step(noteOpened(this.phase, this.#now()));
		} catch (error) {
			this.issue = t(micIssueKey(micIssue(error)));
			this.#step(noteFailed());
		}
	}

	#keep(at: number) {
		const capture = this.#capture;
		this.#capture = null;
		if (!capture) return;
		void capture.stop().then((file) => {
			if (file.size > 0) this.#save(file, at);
		});
	}

	#drop() {
		this.#capture?.cancel();
		this.#capture = null;
	}
}

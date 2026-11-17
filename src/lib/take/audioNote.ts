// Audio notes on a take (#89): the name of the file, what the Record and Save press does at each
// step, and why the microphone did not open, in words. An audio note is stored and synced as a
// photo is: a still whose file is audio (library.ts, fpt/versions.ts). The microphone itself is
// `media/microphone.ts`; the state on screen is `audioNotes.svelte.ts`. Pure.
//
// Motion and capture: a press changes what the row says at once. Opening the microphone happens
// behind it, and a Save pressed before it opened is honoured: what it then gives is dropped.

import type { MessageKey } from '$lib/i18n/messages';
import { audioExtension } from '$lib/media/audioFormat';

/** The file's name on the device: `audio-note-2026-11-17T143205Z.m4a`, from the time it began. */
export function audioNoteFileName(type: string, at: number): string {
	const stamp = new Date(at).toISOString().slice(0, 19).replace(/:/g, '');
	return `audio-note-${stamp}Z.${audioExtension(type) ?? 'bin'}`;
}

/**
 * Where an audio note stands. `opening`: asked for the microphone, the browser has not answered;
 * `then` says whether to run or drop what it gives. `running`: the microphone is heard since
 * `since`, what the clock on screen counts from. `at`: the press that began it, the note's time.
 */
export type NotePhase = { kind: 'idle' } | { kind: 'opening'; at: number; then: 'run' | 'drop' } | { kind: 'running'; at: number; since: number };

/** What to do after a step: open the microphone, keep what it gave, throw it away, or nothing. */
export type NoteEffect = 'open' | 'save' | 'drop' | 'none';

export type NoteStep = { phase: NotePhase; effect: NoteEffect };

export const IDLE: NotePhase = { kind: 'idle' };

/** Record Audio Note, then Save Audio Note: one row, one press each. */
export function notePress(phase: NotePhase, at: number): NoteStep {
	if (phase.kind === 'idle') return { phase: { kind: 'opening', at, then: 'run' }, effect: 'open' };
	if (phase.kind === 'running') return { phase: IDLE, effect: 'save' };
	return { phase: { ...phase, then: 'drop' }, effect: 'none' };
}

/** The microphone opened at `now`. Nothing waiting for it, or a Save came first: what it gives is dropped. */
export function noteOpened(phase: NotePhase, now: number): NoteStep {
	if (phase.kind === 'opening' && phase.then === 'run') return { phase: { kind: 'running', at: phase.at, since: now }, effect: 'none' };
	return { phase: phase.kind === 'opening' ? IDLE : phase, effect: 'drop' };
}

/** It ended with no press: the sheet closed, the page went away, the system took the microphone back. What was heard is kept. */
export function noteEnded(phase: NotePhase): NoteStep {
	if (phase.kind === 'running') return { phase: IDLE, effect: 'save' };
	if (phase.kind === 'opening') return { phase: { ...phase, then: 'drop' }, effect: 'none' };
	return { phase, effect: 'none' };
}

/** The microphone would not open: back to Add. */
export function noteFailed(): NoteStep {
	return { phase: IDLE, effect: 'none' };
}

export type MicIssue = 'denied' | 'missing' | 'busy' | 'unsupported' | 'failed';

/** Why the microphone did not open, from the error `getUserMedia` or the port threw. */
export function micIssue(error: unknown): MicIssue {
	const name = error instanceof Error || (typeof error === 'object' && error !== null && 'name' in error) ? String((error as { name: unknown }).name) : '';
	if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
	if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'missing';
	if (name === 'NotReadableError') return 'busy';
	if (name === 'NotSupportedError') return 'unsupported';
	return 'failed';
}

export function micIssueKey(issue: MicIssue): MessageKey {
	return `audio.issue.${issue}`;
}

import { describe, expect, it } from 'vitest';
import { hasMessage } from '$lib/i18n/messages';
import { audioNoteFileName, IDLE, micIssue, micIssueKey, noteEnded, noteFailed, noteOpened, notePress, type NotePhase } from './audioNote';

const AT = Date.parse('2026-11-17T14:32:05.250Z');

describe('audioNoteFileName', () => {
	it('names the file by the time it began and its type', () => {
		expect(audioNoteFileName('audio/mp4', AT)).toBe('audio-note-2026-11-17T143205Z.m4a');
		expect(audioNoteFileName('audio/webm', AT)).toBe('audio-note-2026-11-17T143205Z.webm');
		expect(audioNoteFileName('audio/x-unheard', AT)).toBe('audio-note-2026-11-17T143205Z.bin');
	});
});

describe('the Add and Save press', () => {
	// Nothing waits: the press changes what the row says at once, the microphone opens behind it.
	it('opens the microphone on the first press, at the time of the press', () => {
		expect(notePress(IDLE, AT)).toEqual({ phase: { kind: 'opening', at: AT, then: 'run' }, effect: 'open' });
	});

	// The note keeps the time of the press; its clock counts from when the microphone was heard.
	it('runs once the microphone is open: the note from the press, the clock from then', () => {
		const opening: NotePhase = { kind: 'opening', at: AT, then: 'run' };
		expect(noteOpened(opening, AT + 2500)).toEqual({ phase: { kind: 'running', at: AT, since: AT + 2500 }, effect: 'none' });
	});

	it('saves on the second press', () => {
		expect(notePress({ kind: 'running', at: AT, since: AT }, AT + 12_000)).toEqual({ phase: IDLE, effect: 'save' });
	});

	// The person changed their mind while the browser asked for the microphone: nothing is kept.
	it('drops what the microphone gives when Save came before it opened', () => {
		const pressed = notePress({ kind: 'opening', at: AT, then: 'run' }, AT + 300);
		expect(pressed).toEqual({ phase: { kind: 'opening', at: AT, then: 'drop' }, effect: 'none' });
		expect(noteOpened(pressed.phase, AT + 900)).toEqual({ phase: IDLE, effect: 'drop' });
		// A third press while it still opens changes nothing more.
		expect(notePress(pressed.phase, AT + 600)).toEqual({ phase: pressed.phase, effect: 'none' });
	});

	// The sheet closed, the page went to the background, or the system took the microphone back.
	it('keeps what was heard when it ends without a press', () => {
		expect(noteEnded({ kind: 'running', at: AT, since: AT })).toEqual({ phase: IDLE, effect: 'save' });
		expect(noteEnded({ kind: 'opening', at: AT, then: 'run' })).toEqual({ phase: { kind: 'opening', at: AT, then: 'drop' }, effect: 'none' });
		expect(noteEnded(IDLE)).toEqual({ phase: IDLE, effect: 'none' });
	});

	it('is back to Add when the microphone would not open', () => {
		expect(noteFailed()).toEqual({ phase: IDLE, effect: 'none' });
	});

	it('ignores an opening that comes when nothing waits for it', () => {
		expect(noteOpened(IDLE, AT)).toEqual({ phase: IDLE, effect: 'drop' });
		expect(noteOpened({ kind: 'running', at: AT, since: AT }, AT + 50)).toEqual({ phase: { kind: 'running', at: AT, since: AT }, effect: 'drop' });
	});
});

describe('micIssue', () => {
	const named = (name: string) => Object.assign(new Error(name), { name });

	// The errors getUserMedia throws, by name (DOMException).
	it('says why the microphone did not open', () => {
		expect(micIssue(named('NotAllowedError'))).toBe('denied');
		expect(micIssue(named('SecurityError'))).toBe('denied');
		expect(micIssue(named('NotFoundError'))).toBe('missing');
		expect(micIssue(named('OverconstrainedError'))).toBe('missing');
		expect(micIssue(named('NotReadableError'))).toBe('busy');
		expect(micIssue(named('NotSupportedError'))).toBe('unsupported');
		expect(micIssue(named('AbortError'))).toBe('failed');
		expect(micIssue('nothing like an error')).toBe('failed');
	});

	it('has words for each', () => {
		for (const issue of ['denied', 'missing', 'busy', 'unsupported', 'failed'] as const) expect(hasMessage(micIssueKey(issue))).toBe(true);
	});
});

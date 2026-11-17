import { describe, expect, it } from 'vitest';
import { notesKey, notesView, readNotesOn, shotsToNote, writeNotesOn } from './notes';

describe('the Notes on Shots setting', () => {
	// Kept per project on the device, beside the project's link (links.ts).
	it('is kept per project', () => {
		expect(notesKey('p1')).toBe('notes:p1');
		expect(notesKey('p1')).not.toBe(notesKey('p2'));
	});

	// Off by default: some studios will not want an app writing Notes (#97).
	it('is off unless it was turned on', () => {
		expect(readNotesOn(undefined)).toBe(false);
		expect(readNotesOn('')).toBe(false);
		expect(readNotesOn('nonsense')).toBe(false);
		expect(readNotesOn(writeNotesOn())).toBe(true);
	});

	it('shows off, on, or waiting for Set Up Fields', () => {
		expect(notesView(false, false)).toBe('off');
		expect(notesView(false, true)).toBe('off');
		expect(notesView(true, false)).toBe('on');
		expect(notesView(true, true)).toBe('setup');
	});
});

describe('shotsToNote', () => {
	it('is every Shot the slates reach, each once, in order', () => {
		expect(
			shotsToNote([
				{ slate: 's1', several: [], shots: [9, 7] },
				{ slate: 's2', several: [], shots: [7] },
				{ slate: 's3', several: [], shots: [] }
			])
		).toEqual([7, 9]);
		expect(shotsToNote([])).toEqual([]);
	});
});

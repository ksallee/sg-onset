import { describe, expect, it } from 'vitest';
import type { TextNote } from './drawing';
import { annotatedFile, currentFiles, flattenPlan, markupKey, originalFile, type FileInfo, type Markup } from './markup';

const note: TextNote = { kind: 'text', id: 't1', ink: 'red', at: { x: 10, y: 10 }, size: 20, text: 'Hi' };
const markup = (over: Partial<Markup> = {}): Markup => ({ id: 'm1', stillId: 'p1', width: 400, height: 300, shapes: [note], ...over });
const file = (id: string, createdAt: number, over: Partial<FileInfo> = {}): FileInfo => ({ id, recordId: 'p1', createdAt, ...over });

describe('markupKey', () => {
	it('is the same for the same drawing and changes with any shape', () => {
		expect(markupKey(markup())).toBe(markupKey(markup({ id: 'other' })));
		expect(markupKey(markup())).not.toBe(markupKey(markup({ shapes: [{ ...note, text: 'Ho' }] })));
		expect(markupKey(markup())).toMatch(/^[0-9a-f]{8}$/);
	});
});

describe('originalFile', () => {
	it('is the first file stored that is not a copy', () => {
		const files = [file('a1', 5, { variant: 'annotated' }), file('o2', 3), file('o1', 1)];
		expect(originalFile(files)?.id).toBe('o1');
		expect(originalFile([file('a1', 5, { variant: 'annotated' })])).toBeUndefined();
	});
});

describe('annotatedFile', () => {
	it('is the newest annotated copy made from the drawing as it is now', () => {
		const key = markupKey(markup());
		const files = [file('o1', 1), file('a1', 2, { variant: 'annotated', source: 'old' }), file('a2', 3, { variant: 'annotated', source: key })];
		expect(annotatedFile(markup(), files)?.id).toBe('a2');
		expect(annotatedFile(markup({ shapes: [] }), files)).toBeUndefined();
		expect(annotatedFile(undefined, files)).toBeUndefined();
	});
});

describe('flattenPlan', () => {
	it('asks for a copy when the drawing has none made from it, and drops the stale ones not yet sent', () => {
		const files = [file('o1', 1), file('a1', 2, { variant: 'annotated', source: 'old' }), file('a0', 2, { variant: 'annotated', source: 'older', verifiedAt: 9 })];
		expect(flattenPlan(markup(), files)).toEqual({ make: markupKey(markup()), drop: ['a1'] });
	});
	it('does nothing when the copy is there', () => {
		const files = [file('o1', 1), file('a1', 2, { variant: 'annotated', source: markupKey(markup()) })];
		expect(flattenPlan(markup(), files)).toEqual({ drop: [] });
	});
	it('drops every unsent copy of a drawing wiped clean, and makes none', () => {
		const files = [file('o1', 1), file('a1', 2, { variant: 'annotated', source: 'x' })];
		expect(flattenPlan(markup({ shapes: [] }), files)).toEqual({ drop: ['a1'] });
		expect(flattenPlan(undefined, files)).toEqual({ drop: ['a1'] });
	});
	it('makes no copy of a photo whose own file is gone from the device', () => {
		expect(flattenPlan(markup(), [file('o1', 1, { prunedAt: 5 })])).toEqual({ drop: [] });
		expect(flattenPlan(markup(), [])).toEqual({ drop: [] });
	});
});

describe('currentFiles', () => {
	it('keeps every photo file and only the annotated copies made from the drawing as it is now', () => {
		const key = markupKey(markup());
		const files = [file('o1', 1), file('a1', 2, { variant: 'annotated', source: 'old' }), file('a2', 3, { variant: 'annotated', source: key }), file('q1', 1, { recordId: 'p2' }), file('q2', 2, { recordId: 'p2', variant: 'annotated', source: key })];
		expect(currentFiles(files, [markup()]).map((f) => f.id)).toEqual(['o1', 'a2', 'q1']);
	});
});

import { describe, expect, it } from 'vitest';
import type { Take } from '$lib/model/types';
import { groupTakes } from './groups';
import { groupMark, groupNote, markPatch, notePatch, photoTake, newStill } from './marks';

const take = (id: string, setup: string, rest: Partial<Take> = {}): Take => ({ id, slateId: 's', take: '3', cameraSetupId: setup, ...rest });

describe('markPatch', () => {
	it('circles every camera of the take, and a circled take is not no good', () => {
		const [g] = groupTakes([take('a', 'A', { noGood: true }), take('b', 'B')]);
		expect(markPatch(g, 'circleTake', true)).toEqual([
			{ id: 'a', key: 'circleTake', from: undefined, to: true },
			{ id: 'a', key: 'noGood', from: true, to: undefined },
			{ id: 'b', key: 'circleTake', from: undefined, to: true }
		]);
	});
	it('clears a mark by removing it', () => {
		const [g] = groupTakes([take('a', 'A', { noGood: true })]);
		expect(markPatch(g, 'noGood', false)).toEqual([{ id: 'a', key: 'noGood', from: true, to: undefined }]);
	});
});

describe('groupMark', () => {
	it('is on when every camera has it', () => {
		expect(groupMark(groupTakes([take('a', 'A', { circleTake: true }), take('b', 'B', { circleTake: true })])[0], 'circleTake')).toBe(true);
		expect(groupMark(groupTakes([take('a', 'A', { circleTake: true }), take('b', 'B')])[0], 'circleTake')).toBe(false);
	});
});

describe('notes', () => {
	it('writes the note on every camera; empty clears it', () => {
		const [g] = groupTakes([take('a', 'A', { notes: 'old' }), take('b', 'B')]);
		expect(notePatch(g, ' Boom in frame ').map((c) => [c.id, c.to])).toEqual([
			['a', 'Boom in frame'],
			['b', 'Boom in frame']
		]);
		expect(notePatch(g, '')).toEqual([{ id: 'a', key: 'notes', from: 'old', to: undefined }]);
	});
	it('reads the first note there is', () => {
		expect(groupNote(groupTakes([take('a', 'A'), take('b', 'B', { notes: 'Wire' })])[0])).toBe('Wire');
		expect(groupNote(groupTakes([take('a', 'A')])[0])).toBe('');
	});
});

describe('photos', () => {
	const [g] = groupTakes([take('a', 'A'), take('b', 'B')]);
	it('go on the take of the camera picked, else the first camera', () => {
		expect(photoTake(g, 'B')?.id).toBe('b');
		expect(photoTake(g, 'C')?.id).toBe('a');
		expect(photoTake(undefined, 'A')).toBeUndefined();
	});
	it('are a still record stamped to the second', () => {
		expect(newStill('a', 'st', Date.UTC(2026, 10, 11, 9, 0, 1, 500))).toEqual({ id: 'st', takeId: 'a', capturedAt: '2026-11-11T09:00:01Z' });
	});
});

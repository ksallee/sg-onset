import { describe, expect, it } from 'vitest';
import { tk } from '$lib/i18n/messages';
import { changedFields, changedKey, markSeen, noteChanged, parseChanged, serializeChanged, type Changed } from './changed';

// Kevin, #110: a change read back from Flow PT of an entry this device uses goes in the sync sheet's
// "Changed on another device" list, until seen; opening it marks it seen. Nothing on the take screen.
describe('noteChanged', () => {
	it('lists each entry changed, newest first, with the fields taken', () => {
		const once = noteChanged([], 'lens', [{ id: 'l1', keys: ['focalLength'] }], [], 100);
		const twice = noteChanged(once, 'cameraSetup', [{ id: 'cs1', keys: ['lensId'] }], [], 200);
		expect(twice).toEqual([
			{ table: 'cameraSetup', id: 'cs1', keys: ['lensId'], at: 200 },
			{ table: 'lens', id: 'l1', keys: ['focalLength'], at: 100 }
		]);
	});

	it('keeps one row an entry changed again before it was seen: every field taken, the later time', () => {
		const once = noteChanged([], 'lens', [{ id: 'l1', keys: ['focalLength'] }], [], 100);
		expect(noteChanged(once, 'lens', [{ id: 'l1', keys: ['lensModel', 'focalLength'] }], [], 300)).toEqual([{ table: 'lens', id: 'l1', keys: ['focalLength', 'lensModel'], at: 300 }]);
	});

	it('drops an entry removed since, and leaves the other tables alone', () => {
		const list: Changed[] = [
			{ table: 'lens', id: 'l1', keys: ['focalLength'], at: 100 },
			{ table: 'camera', id: 'l1', keys: ['cameraModel'], at: 100 }
		];
		expect(noteChanged(list, 'lens', [], ['l1'], 200)).toEqual([{ table: 'camera', id: 'l1', keys: ['cameraModel'], at: 100 }]);
	});

	it('gives back the same list when nothing changed', () => {
		const list: Changed[] = [{ table: 'lens', id: 'l1', keys: ['focalLength'], at: 100 }];
		expect(noteChanged(list, 'lens', [], [], 200)).toBe(list);
	});
});

describe('markSeen', () => {
	it('takes the entry off the list', () => {
		const list: Changed[] = [
			{ table: 'lens', id: 'l1', keys: ['focalLength'], at: 100 },
			{ table: 'template', id: 'tp1', keys: ['values'], at: 50 }
		];
		expect(markSeen(list, 'lens', 'l1')).toEqual([{ table: 'template', id: 'tp1', keys: ['values'], at: 50 }]);
		expect(markSeen(list, 'lens', 'l9')).toBe(list);
	});
});

describe('parseChanged and serializeChanged', () => {
	it('reads back what it wrote', () => {
		const list: Changed[] = [{ table: 'lens', id: 'l1', keys: ['focalLength'], at: 100 }];
		expect(parseChanged(serializeChanged(list))).toEqual(list);
	});

	it('reads nothing it cannot read, and drops a row of another table or with no id', () => {
		expect(parseChanged(undefined)).toEqual([]);
		expect(parseChanged('{')).toEqual([]);
		expect(parseChanged(JSON.stringify([{ table: 'take', id: 't1', keys: [], at: 1 }, { table: 'lens', id: '', keys: [], at: 1 }, { table: 'lens', id: 'l1', keys: ['a', 2], at: 'x' }]))).toEqual([
			{ table: 'lens', id: 'l1', keys: ['a'], at: 0 }
		]);
	});

	it('is kept per project, beside the sync link', () => {
		expect(changedKey('p1')).toBe('changed:p1');
	});
});

describe('changedFields', () => {
	it('names the fields as the forms do, a template’s as its editor does', () => {
		expect(changedFields('lens', ['focalLength', 'lensModel'])).toBe(`${tk('field.lens.focalLength')}, ${tk('field.lens.lensModel')}`);
		expect(changedFields('cameraSetup', ['lensId'])).toBe(tk('field.cameraSetup.lensId'));
		expect(changedFields('template', ['name', 'values'])).toBe(`${tk('templates.edit.name')}, ${tk('templates.edit.fields')}`);
		expect(changedFields('referenceKind', ['name'])).toBe(tk('templates.edit.name'));
		expect(changedFields('rig', ['name'])).toBe(tk('templates.edit.name'));
	});
});

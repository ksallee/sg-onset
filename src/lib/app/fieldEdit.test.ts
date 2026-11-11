import { describe, expect, it } from 'vitest';
import { readField } from './fieldEdit';

describe('readField', () => {
	it('reads text as the field says', () => {
		expect(readField('take', 'tilt', '-12', 'metric')).toMatchObject({ ok: true, value: -12 });
		expect(readField('slate', 'sceneNumber', ' 42 ', 'metric')).toMatchObject({ ok: true, value: '42' });
		expect(readField('take', 'lensHeight', "6'", 'imperial')).toMatchObject({ ok: true, value: { m: 1.8288 } });
	});
	it('clears an optional field with empty text', () => {
		expect(readField('slate', 'description', '  ', 'metric')).toMatchObject({ ok: true, value: undefined });
	});
	it('refuses to clear a required field', () => {
		expect(readField('slate', 'slateUID', '', 'metric')).toMatchObject({ ok: false, issue: { key: 'validation.required' } });
	});
	it('gives the issue of a value out of range or of the wrong kind', () => {
		expect(readField('take', 'tilt', '120', 'metric')).toMatchObject({ ok: false, issue: { key: 'validation.max' } });
		expect(readField('take', 'tilt', 'steep', 'metric')).toMatchObject({ ok: false, issue: { key: 'validation.type' } });
	});
	it('reads an end key as its field, never required', () => {
		expect(readField('take', 'tiltEnd', '10', 'metric')).toMatchObject({ ok: true, value: 10 });
		expect(readField('take', 'tiltEnd', '', 'metric')).toMatchObject({ ok: true, value: undefined });
	});
	it('does not know a key the catalogue lacks', () => {
		expect(readField('take', 'nope', '1', 'metric').ok).toBe(false);
	});
});

import { describe, expect, it } from 'vitest';
import { codeKey, codesOf, linkValue, shotChange, shotCodes, shotFilter, shotsOf } from './shots';

describe('codeKey', () => {
	// A text filter is case-blind and strips outer spaces (corpus findings/field_types/text.md).
	it('matches a code as Flow PT does: trimmed, whatever the case', () => {
		expect(codeKey(' smp_012_0010 ')).toBe(codeKey('SMP_012_0010'));
	});
});

describe('shotCodes', () => {
	it('reads the typed codes of a slate, each once, in the order typed', () => {
		expect(shotCodes(['SMP_012_0010', ' smp_012_0010', 'SMP_012_0020', ''])).toEqual(['SMP_012_0010', 'SMP_012_0020']);
	});
	it('reads nothing from a value that is not a list of codes', () => {
		expect(shotCodes(undefined)).toEqual([]);
		expect(shotCodes(null)).toEqual([]);
		expect(shotCodes('SMP_012_0010')).toEqual([]);
		expect(shotCodes([3, 'SMP_012_0010'])).toEqual(['SMP_012_0010']);
	});
});

describe('shotFilter', () => {
	// Shot reads need a project filter of their own: the endpoint is not scoped (entity_types/Shot.md).
	it('keeps the search to the project and the codes', () => {
		expect(shotFilter(55, ['SMP_012_0010'])).toEqual({
			logical_operator: 'and',
			conditions: [
				['project', 'is', { type: 'Project', id: 55 }],
				['code', 'in', ['SMP_012_0010']]
			]
		});
	});
});

describe('shotsOf and codesOf', () => {
	const rows = [
		{ type: 'Shot', id: 9, attributes: { code: 'SMP_042_0010' } },
		{ type: 'Shot', id: 7, attributes: { code: 'SMP_012_0010' } },
		{ type: 'Shot', id: 3, attributes: { code: null } },
		{ type: 'Shot', id: 4, attributes: { code: 'smp_012_0010' } }
	];
	it('keeps the Shots that have a code', () => {
		expect(shotsOf(rows)).toEqual([
			{ id: 9, code: 'SMP_042_0010' },
			{ id: 7, code: 'SMP_012_0010' },
			{ id: 4, code: 'smp_012_0010' }
		]);
	});
	it('lists each code once, in order', () => {
		expect(codesOf(rows)).toEqual(['SMP_012_0010', 'SMP_042_0010']);
	});
	it('orders numbers inside codes as numbers', () => {
		const codes = codesOf([
			{ type: 'Shot', id: 1, attributes: { code: 'SH100' } },
			{ type: 'Shot', id: 2, attributes: { code: 'SH20' } }
		]);
		expect(codes).toEqual(['SH20', 'SH100']);
	});
});

describe('linkValue', () => {
	// The mode goes in the body; a bare list would replace the whole field (recipes/009).
	it('adds or removes in place, by Shot', () => {
		expect(linkValue('add', [7, 9])).toEqual({ multi_entity_update_mode: 'add', value: [{ type: 'Shot', id: 7 }, { type: 'Shot', id: 9 }] });
		expect(linkValue('remove', [8])).toEqual({ multi_entity_update_mode: 'remove', value: [{ type: 'Shot', id: 8 }] });
	});
	it('adds or removes rows of another type: a Set Shot', () => {
		expect(linkValue('add', [300], 'CustomEntity22')).toEqual({ multi_entity_update_mode: 'add', value: [{ type: 'CustomEntity22', id: 300 }] });
	});
});

describe('shotChange', () => {
	it('reads the codes a new slate brings', () => {
		expect(shotChange({ kind: 'create', table: 'slate', recordId: 's1', fields: { slateUID: '12A', vfxShots: ['SMP_012_0010'] } })).toEqual({ link: ['SMP_012_0010'], unlink: [] });
	});
	it('reads the codes an edit takes off and the codes the slate holds', () => {
		expect(
			shotChange({ kind: 'update', table: 'slate', recordId: 's1', changes: { vfxShots: { base: ['SMP_012_0010', 'SMP_042_0010'], value: ['smp_042_0010', 'SMP_012_0020'] } } })
		).toEqual({ link: ['smp_042_0010', 'SMP_012_0020'], unlink: ['SMP_012_0010'] });
		expect(shotChange({ kind: 'update', table: 'slate', recordId: 's1', changes: { vfxShots: { base: ['SMP_012_0010'], value: undefined } } })).toEqual({
			link: [],
			unlink: ['SMP_012_0010']
		});
	});
	it('has nothing to do for a slate with no codes, another field, another table or a delete', () => {
		expect(shotChange({ kind: 'create', table: 'slate', recordId: 's1', fields: { slateUID: '12A' } })).toBeUndefined();
		expect(shotChange({ kind: 'update', table: 'slate', recordId: 's1', changes: { notes: { base: 'a', value: 'b' } } })).toBeUndefined();
		expect(shotChange({ kind: 'create', table: 'take', recordId: 't1', fields: { vfxShots: ['SMP_012_0010'] } })).toBeUndefined();
		expect(shotChange({ kind: 'delete', table: 'slate', recordId: 's1' })).toBeUndefined();
	});
});

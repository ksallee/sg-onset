import { describe, expect, it } from 'vitest';
import { codeKey, codesOf, linkValue, shotChange, shotCodes, shotFilter, shotPlan, shotsOf } from './shots';

const shots = [
	{ id: 7, code: 'SMP_012_0010' },
	{ id: 8, code: 'SMP_012_0020' },
	{ id: 9, code: 'SMP_042_0010' }
];

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

describe('shotPlan', () => {
	const none = { link: [], unlink: [], check: [] };
	const twice = [...shots, { id: 12, code: 'smp_012_0010' }];

	it('links the Shot of each code, and says which codes have none', () => {
		expect(shotPlan({ ...none, link: ['SMP_012_0010', 'smp_042_0010', 'SMP_099_0010'] }, shots)).toEqual({
			add: [7, 9],
			remove: [],
			waiting: ['SMP_099_0010'],
			several: [],
			removing: []
		});
	});

	it('unlinks the Shots of the codes taken off, and says which codes those are', () => {
		expect(shotPlan({ ...none, link: ['SMP_012_0010'], unlink: ['SMP_012_0020', 'SMP_099_0010'] }, shots)).toEqual({
			add: [7],
			remove: [8],
			waiting: [],
			several: [],
			removing: ['SMP_012_0020']
		});
	});

	it('never unlinks a code it links: only the case changed', () => {
		expect(shotPlan({ ...none, link: ['SMP_012_0010'], unlink: ['smp_012_0010'] }, shots)).toEqual({ add: [7], remove: [], waiting: [], several: [], removing: [] });
	});

	// Shot codes are not unique (entity_types/Shot.md): every Shot with the code is linked, and the
	// code is named so someone cleans up (Kevin, #96).
	it('links every Shot that has the code, and names the code', () => {
		expect(shotPlan({ ...none, link: ['SMP_012_0010', 'SMP_042_0010'] }, twice)).toEqual({ add: [7, 9, 12], remove: [], waiting: [], several: ['SMP_012_0010'], removing: [] });
	});

	it('checks a code again without linking it: a Shot a person unlinked stays unlinked', () => {
		expect(shotPlan({ ...none, check: ['SMP_012_0010', 'SMP_042_0010'] }, twice)).toEqual({ add: [], remove: [], waiting: [], several: ['SMP_012_0010'], removing: [] });
	});

	it('waits on a checked code once no Shot has it', () => {
		expect(shotPlan({ ...none, check: ['SMP_099_0010'] }, shots)).toEqual({ add: [], remove: [], waiting: ['SMP_099_0010'], several: [], removing: [] });
	});

	it('waits on every code when no Shot is known', () => {
		expect(shotPlan({ ...none, link: ['SMP_012_0010'], unlink: ['SMP_012_0020'] }, [])).toEqual({ add: [], remove: [], waiting: ['SMP_012_0010'], several: [], removing: [] });
	});
});

describe('linkValue', () => {
	// The mode goes in the body; a bare list would replace the whole field (recipes/009).
	it('adds or removes in place, by Shot', () => {
		expect(linkValue('add', [7, 9])).toEqual({ multi_entity_update_mode: 'add', value: [{ type: 'Shot', id: 7 }, { type: 'Shot', id: 9 }] });
		expect(linkValue('remove', [8])).toEqual({ multi_entity_update_mode: 'remove', value: [{ type: 'Shot', id: 8 }] });
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

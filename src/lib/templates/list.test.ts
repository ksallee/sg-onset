import { describe, expect, it } from 'vitest';
import type { TemplateRecord } from '$lib/model/template';
import { copyName, linkCounts, sortTemplates, templateEditPatch } from './list';

const tpl = (id: string, name: string, scope: 'slate' | 'take'): TemplateRecord => ({ id, projectId: 'p', name, scope, values: {} });

describe('sortTemplates', () => {
	it('by name, as a person counts', () => {
		const list = [tpl('1', 'Night 10', 'take'), tpl('2', 'night 9', 'take'), tpl('3', 'Day', 'slate')];
		expect(sortTemplates(list).map((t) => t.id)).toEqual(['3', '2', '1']);
	});
});

describe('linkCounts', () => {
	it('counts the records linked to each template', () => {
		const counts = linkCounts([{ templateId: 'a' }, { templateId: 'a' }, {}, { templateId: 'b' }]);
		expect(counts.get('a')).toBe(2);
		expect(counts.get('b')).toBe(1);
		expect(counts.get('c')).toBeUndefined();
	});
});

describe('copyName', () => {
	it('adds 2, or steps the number at the end, and skips names in use', () => {
		expect(copyName('Day ext', [])).toBe('Day ext 2');
		expect(copyName('Day ext 2', ['Day ext 2'])).toBe('Day ext 3');
		expect(copyName('Day ext', ['Day ext 2', 'day ext 3'])).toBe('Day ext 4');
	});
	it('gives the name itself when it is free and asked to', () => {
		expect(copyName('Take template', ['Slate template'], true)).toBe('Take template');
		expect(copyName('Take template', ['Take template'], true)).toBe('Take template 2');
	});
});

describe('templateEditPatch', () => {
	it('changes the name and the values that changed, nothing else', () => {
		const t: TemplateRecord = { id: 't', projectId: 'p', name: 'A', scope: 'take', values: { tStop: 2.8 } };
		expect(templateEditPatch(t, 'A', { tStop: 2.8 })).toEqual([]);
		expect(templateEditPatch(t, ' B ', { tStop: 4 })).toEqual([
			{ id: 't', key: 'name', from: 'A', to: 'B' },
			{ id: 't', key: 'values', from: { tStop: 2.8 }, to: { tStop: 4 } }
		]);
	});
});

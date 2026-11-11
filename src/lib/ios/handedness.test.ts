import { describe, expect, it } from 'vitest';
import { formFor, gridAreas, workspaceLayout } from './handedness';

describe('formFor', () => {
	it('is wide on an iPad in landscape', () => {
		expect(formFor(1180)).toBe('wide');
		expect(formFor(1024)).toBe('wide');
	});
	it('is tall on an iPad in portrait', () => {
		expect(formFor(820)).toBe('tall');
		expect(formFor(744)).toBe('tall');
	});
	it('is compact in a phone-width window', () => {
		expect(formFor(390)).toBe('compact');
		expect(formFor(699)).toBe('compact');
	});
});

describe('workspaceLayout', () => {
	it('puts the rail on the right edge for the right hand, the dock beside it, the list far side', () => {
		expect(workspaceLayout('right', 'wide')).toEqual({ form: 'wide', rail: 'right', list: 'side', columns: ['list', 'main', 'dock', 'rail'] });
	});
	it('mirrors every column for the left hand', () => {
		expect(workspaceLayout('left', 'wide')).toEqual({ form: 'wide', rail: 'left', list: 'side', columns: ['rail', 'dock', 'main', 'list'] });
	});
	it('moves the list to a strip on top when tall', () => {
		expect(workspaceLayout('right', 'tall')).toEqual({ form: 'tall', rail: 'right', list: 'top', columns: ['main', 'dock', 'rail'] });
		expect(workspaceLayout('left', 'tall').columns).toEqual(['rail', 'dock', 'main']);
	});
	it('stacks when compact: one column, rail along the foot, the hand picks its side', () => {
		expect(workspaceLayout('right', 'compact')).toEqual({ form: 'compact', rail: 'bottom-right', list: 'top', columns: ['main'] });
		expect(workspaceLayout('left', 'compact').rail).toBe('bottom-left');
	});
});

describe('gridAreas', () => {
	it('is one row of columns when wide', () => {
		expect(gridAreas(workspaceLayout('left', 'wide'))).toBe('"rail dock main list"');
	});
	it('lays the list strip over everything but the rail when tall', () => {
		expect(gridAreas(workspaceLayout('right', 'tall'))).toBe('"list list rail" "main dock rail"');
		expect(gridAreas(workspaceLayout('left', 'tall'))).toBe('"rail list list" "rail dock main"');
	});
	it('is one stack when compact, rail last', () => {
		expect(gridAreas(workspaceLayout('right', 'compact'))).toBe('"list" "main" "dock" "rail"');
	});
});

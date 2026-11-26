import { describe, expect, it } from 'vitest';
import { TABLES } from '$lib/store/tables';
import { nameKey, recordTitle } from './titles';

describe('nameKey', () => {
	it('is the required field of each scope', () => {
		expect(Object.fromEntries(TABLES.map((t) => [t, nameKey(t)]))).toEqual({
			project: 'name',
			shootDay: 'shootDate',
			lightingSetup: 'label',
			cameraSetup: 'cameraLabel',
			slate: 'slateUID',
			take: 'take',
			camera: 'cameraModel',
			lens: 'lensModel',
			reference: 'name',
			still: undefined
		});
	});
	it('is nothing for a table the model does not know', () => {
		expect(nameKey('outbox')).toBeUndefined();
	});
});

describe('recordTitle', () => {
	it('reads the name', () => {
		expect(recordTitle('slate', { id: 's', slateUID: ' 42A ' })).toBe('42A');
		expect(recordTitle('take', { id: 't', take: '3' })).toBe('3');
		expect(recordTitle('still', { id: 'p', caption: 'Slate' })).toBe('Slate');
		expect(recordTitle('reference', { id: 'r', slateId: 's', name: 'HDRI_0412' })).toBe('HDRI_0412');
		// A template and a reference kind are named by `name` (#110: they sync, and a change of one can need a person).
		expect(recordTitle('template', { id: 'tp', name: ' Day ext ' })).toBe('Day ext');
		expect(recordTitle('referenceKind', { id: 'k', name: 'Drone scan' })).toBe('Drone scan');
		expect(recordTitle('rig', { id: 'g', name: 'Russian arm' })).toBe('Russian arm');
	});
	it('is empty when there is none', () => {
		expect(recordTitle('slate', { id: 's' })).toBe('');
		expect(recordTitle('slate', undefined)).toBe('');
		expect(recordTitle('still', { id: 'p' })).toBe('');
	});
});

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
	});
	it('is empty when there is none', () => {
		expect(recordTitle('slate', { id: 's' })).toBe('');
		expect(recordTitle('slate', undefined)).toBe('');
		expect(recordTitle('still', { id: 'p' })).toBe('');
	});
});

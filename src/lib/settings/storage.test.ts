import { describe, expect, it } from 'vitest';
import { storageUse } from './storage';

describe('storageUse', () => {
	it('formats what is used and what may be', () => {
		expect(storageUse({ usage: 12_400_000, quota: 2_000_000_000 })).toEqual({ used: '12.4 MB', quota: '2 GB' });
	});
	it('is nothing when the browser does not say', () => {
		expect(storageUse(undefined)).toBeUndefined();
		expect(storageUse({ usage: 5 })).toBeUndefined();
	});
});

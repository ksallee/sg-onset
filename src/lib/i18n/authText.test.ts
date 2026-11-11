import { describe, expect, it } from 'vitest';
import { failureText } from './authText';

describe('failureText', () => {
	it('says what is wrong with the address', () => {
		expect(failureText('bad-site', 'port')).toBe('Leave out the port.');
		expect(failureText('bad-site', 'nonsense')).toBe('That is not a site address.');
		expect(failureText('bad-site')).toBe('That is not a site address.');
	});
	it('has a line for every failure, and none for cancelling', () => {
		for (const code of ['not-allowed', 'gone', 'timeout', 'offline', 'unreachable', 'refused'] as const) {
			expect(failureText(code).length).toBeGreaterThan(10);
		}
		expect(failureText('cancelled')).toBe('');
	});
});

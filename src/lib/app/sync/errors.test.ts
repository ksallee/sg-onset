import { describe, expect, it } from 'vitest';
import { TransportError } from '$lib/outbox/transport';
import { syncError, syncErrorText } from './errors';

describe('syncError', () => {
	it('keeps the kind of a transport error, and calls anything else a refusal', () => {
		expect(syncError(new TransportError('unreachable'))).toEqual({ kind: 'unreachable', message: 'unreachable' });
		expect(syncError(new Error('Permission denied'))).toEqual({ kind: 'refused', message: 'Permission denied' });
		expect(syncError('odd')).toEqual({ kind: 'refused', message: 'odd' });
	});
});

describe('syncErrorText', () => {
	it('says in words what went wrong', () => {
		expect(syncErrorText({ kind: 'unreachable' })).toBe('Flow PT could not be reached.');
		expect(syncErrorText({ kind: 'unauthorized' })).toBe('The session ended. Sign in again.');
		expect(syncErrorText({ kind: 'failed', message: 'HTTP 503' })).toBe('Flow PT refused: HTTP 503');
		expect(syncErrorText({ kind: 'refused', message: 'Permission denied' })).toBe('Flow PT refused: Permission denied');
		expect(syncErrorText({ kind: 'timeout' })).toBe('Flow PT could not be reached.');
	});
});

import { describe, expect, it } from 'vitest';
import { onTakeover } from './update';

describe('onTakeover', () => {
	it('does nothing on a first visit: the worker that takes over is the first one', () => {
		expect(onTakeover({ hadWorker: false, edited: false })).toBe('ignore');
		expect(onTakeover({ hadWorker: false, edited: true })).toBe('ignore');
	});
	it('reloads at once when a new deploy takes over and nothing was done in this visit', () => {
		expect(onTakeover({ hadWorker: true, edited: false })).toBe('reload');
	});
	it('waits for the next navigation once an edit was made: nothing moves under a person at work', () => {
		expect(onTakeover({ hadWorker: true, edited: true })).toBe('later');
	});
});

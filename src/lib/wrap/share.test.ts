import { describe, expect, it } from 'vitest';
import { handOverMode, shareOutcome } from './share';

const file = new File(['x'], 'a.zip', { type: 'application/zip' });

describe('handOverMode', () => {
	it('shares where the browser takes files', () => {
		expect(handOverMode({ share: async () => undefined, canShare: () => true }, file)).toBe('share');
	});
	it('downloads where it has no share, or no file share', () => {
		expect(handOverMode({}, file)).toBe('download');
		expect(handOverMode({ share: async () => undefined }, file)).toBe('download');
		expect(handOverMode({ share: async () => undefined, canShare: () => false }, file)).toBe('download');
	});
	it('downloads when canShare throws', () => {
		expect(
			handOverMode(
				{
					share: async () => undefined,
					canShare: () => {
						throw new TypeError('no');
					}
				},
				file
			)
		).toBe('download');
	});
});

describe('shareOutcome', () => {
	it('reads the share sheet closing as a cancel', () => {
		expect(shareOutcome(new DOMException('x', 'AbortError'))).toBe('cancelled');
	});
	it('reads a lost tap as a reason to ask for one', () => {
		expect(shareOutcome(new DOMException('x', 'NotAllowedError'))).toBe('needsTap');
	});
	it('falls back to a download on anything else', () => {
		expect(shareOutcome(new DOMException('x', 'DataError'))).toBe('download');
		expect(shareOutcome(new Error('x'))).toBe('download');
	});
});

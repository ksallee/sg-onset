import { describe, expect, it } from 'vitest';
import { shareMode } from './share';

describe('shareMode', () => {
	it('shares the file when the share sheet takes files', () => {
		expect(shareMode({ share: true, canShareFiles: true })).toBe('share');
	});
	it('downloads when the share sheet cannot take this file', () => {
		expect(shareMode({ share: true, canShareFiles: false })).toBe('download');
	});
	it('downloads without a share sheet', () => {
		expect(shareMode({ share: false, canShareFiles: false })).toBe('download');
		expect(shareMode({ share: false, canShareFiles: true })).toBe('download');
	});
});

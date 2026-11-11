import { describe, expect, it } from 'vitest';
import { crc32 } from './crc32';

const bytes = (text: string) => new TextEncoder().encode(text);

describe('crc32', () => {
	it('matches the check value of the standard', () => {
		expect(crc32(bytes('123456789'))).toBe(0xcbf43926);
	});

	it('is zero for nothing', () => {
		expect(crc32(new Uint8Array())).toBe(0);
	});

	it('carries on from a previous chunk', () => {
		const whole = crc32(bytes('hello, world'));
		expect(crc32(bytes(', world'), crc32(bytes('hello')))).toBe(whole);
	});

	it('matches known values', () => {
		expect(crc32(bytes('The quick brown fox jumps over the lazy dog'))).toBe(0x414fa339);
		expect(crc32(new Uint8Array(32))).toBe(0x190a55ad);
		expect(crc32(new Uint8Array(32).fill(0xff))).toBe(0xff6cab0b);
	});
});

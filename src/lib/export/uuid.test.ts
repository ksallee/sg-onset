import { describe, expect, it } from 'vitest';
import { sha1Hex, uuidV5 } from './uuid';

describe('sha1Hex', () => {
	it('matches the published test vectors', () => {
		expect(sha1Hex(new TextEncoder().encode('abc'))).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
		expect(sha1Hex(new Uint8Array())).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709');
		expect(sha1Hex(new TextEncoder().encode('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))).toBe('84983e441c3bd26ebaae4aa1f95129e5e54670f1');
	});
});

describe('uuidV5', () => {
	it('matches RFC 9562 for the DNS namespace and www.example.com', () => {
		expect(uuidV5('6ba7b810-9dad-11d1-80b4-00c04fd430c8', 'www.example.com')).toBe('2ed6657d-e927-568b-95e1-2665a8aea6a2');
	});

	it('is the same for the same input and different for another name', () => {
		const ns = '6f1c0d2e-0000-4000-8000-000000000042';
		expect(uuidV5(ns, 'A')).toBe(uuidV5(ns, 'A'));
		expect(uuidV5(ns, 'A')).not.toBe(uuidV5(ns, 'B'));
		expect(uuidV5(ns, 'A')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
	});

	it('reads a namespace that is not a UUID as text', () => {
		expect(uuidV5('s9', 'A')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5/);
		expect(uuidV5('s9', 'A')).not.toBe(uuidV5('s10', 'A'));
	});
});

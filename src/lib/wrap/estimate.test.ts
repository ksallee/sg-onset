import { describe, expect, it } from 'vitest';
import { HUGE_BYTES, LARGE_BYTES, sizeVerdict, zipSize } from './estimate';

describe('zipSize', () => {
	it('adds the headers of each entry to its bytes', () => {
		// Local header 30 + name, data descriptor 16, central header 46 + name; end record 22.
		expect(zipSize([{ path: 'a.csv', size: 100 }])).toBe(100 + 30 + 5 + 16 + 46 + 5 + 22);
	});
	it('counts a name in UTF-8 bytes', () => {
		expect(zipSize([{ path: 'é', size: 0 }]) - zipSize([{ path: 'e', size: 0 }])).toBe(2);
	});
	it('adds the zip64 records past 4 GB', () => {
		const big = 5e9;
		expect(zipSize([{ path: 'a', size: big }])).toBeGreaterThan(big + 30 + 1 + 16 + 46 + 1 + 22);
	});
	it('is the end record alone for nothing', () => {
		expect(zipSize([])).toBe(22);
	});
});

describe('sizeVerdict', () => {
	it('is fine under the first threshold', () => {
		expect(sizeVerdict(10e6, { onDisk: true })).toEqual({ level: 'ok', noRoom: false, inMemory: false });
	});
	it('is large past 250 MB: too big for Mail', () => {
		expect(LARGE_BYTES).toBe(250e6);
		expect(sizeVerdict(LARGE_BYTES + 1, { onDisk: true }).level).toBe('large');
	});
	it('is huge past 2 GB', () => {
		expect(HUGE_BYTES).toBe(2e9);
		expect(sizeVerdict(HUGE_BYTES + 1, { onDisk: true }).level).toBe('huge');
	});
	it('says when the device has no room for the zip', () => {
		expect(sizeVerdict(100e6, { onDisk: true, free: 50e6 }).noRoom).toBe(true);
		// A margin: the zip and the photos it copies sit side by side.
		expect(sizeVerdict(100e6, { onDisk: true, free: 105e6 }).noRoom).toBe(true);
		expect(sizeVerdict(100e6, { onDisk: true, free: 500e6 }).noRoom).toBe(false);
	});
	it('says when the zip has to be held in memory, and calls that huge sooner', () => {
		expect(sizeVerdict(10e6, { onDisk: false })).toEqual({ level: 'ok', noRoom: false, inMemory: true });
		expect(sizeVerdict(600e6, { onDisk: false }).level).toBe('huge');
	});
});

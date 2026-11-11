import { describe, expect, it } from 'vitest';
import type { Take } from '$lib/model/types';
import { sortTakes, takeRows } from './takeRows';

const setups = [
	{ id: 'A', projectId: 'p', cameraLabel: 'A' },
	{ id: 'B', projectId: 'p', cameraLabel: 'B' }
];
const lenses = [
	{ id: 'prime', projectId: 'p', lensModel: '32 mm', focalLength: 32 },
	{ id: 'zoom', projectId: 'p', lensModel: '24-290', focalLength: 24, focalLengthMax: 290 }
];
const take = (id: string, rest: Partial<Take>): Take => ({ id, slateId: 's', ...rest });

describe('sortTakes', () => {
	it('is the order shot, then the take number, with unstarted takes last', () => {
		const takes = [
			take('c', { take: '10' }),
			take('b', { take: '2', startedAt: '2026-11-11T10:05:00.000Z' }),
			take('a', { take: '1', startedAt: '2026-11-11T10:00:00.000Z' }),
			take('d', { take: '9' })
		];
		expect(sortTakes(takes).map((t) => t.id)).toEqual(['a', 'b', 'd', 'c']);
	});
});

describe('takeRows', () => {
	it('gives the camera letter and the focal length of the lens for a prime', () => {
		const [row] = takeRows([take('t', { take: '1', cameraSetupId: 'A', lensId: 'prime' })], setups, lenses);
		expect(row).toMatchObject({ camera: 'A', focal: '32' });
	});
	it('gives what was typed for a zoom, with its end when it moved', () => {
		const rows = takeRows(
			[
				take('t1', { take: '1', startedAt: '2026-11-11T10:00:00.000Z', cameraSetupId: 'B', lensId: 'zoom', focalLength: 135 }),
				take('t2', { take: '2', startedAt: '2026-11-11T10:05:00.000Z', cameraSetupId: 'B', lensId: 'zoom', focalLength: 150, focalLengthEnd: 85 })
			],
			setups,
			lenses
		);
		expect(rows.map((r) => r.focal)).toEqual(['135', '150–85']);
	});
	it('leaves blank what is not known', () => {
		expect(takeRows([take('t', { take: '1' })], setups, lenses)[0]).toMatchObject({ camera: '', focal: '' });
	});
});

import { describe, expect, it } from 'vitest';
import { flatten } from './selection';
import { day3, input, project, t42A1A } from './testData';
import { wrapPlan, type PhotoBlob } from './wrapPackage';

const blobs: PhotoBlob[] = [
	{ id: 'b1', recordId: 'st1', type: 'image/jpeg', size: 100, createdAt: 2 },
	{ id: 'b1thumb', recordId: 'st1', type: 'image/jpeg', size: 10, createdAt: 3 },
	{ id: 'b2', recordId: 'st2', type: 'image/heic', size: 200, createdAt: 1 },
	{ id: 'b3', recordId: 'st3', type: 'image/jpeg', size: 300, createdAt: 4, prunedAt: 9 }
];

describe('wrapPlan', () => {
	const plan = () => wrapPlan(flatten(input(), { shootDayIds: ['d3'] }), { project, shootDays: [day3], blobs });

	it('roots everything in one folder named for the project and day', () => {
		expect(plan().root).toBe('Night-Train_2026-11-10-day03');
		for (const e of plan().entries) expect(e.path.startsWith('Night-Train_2026-11-10-day03/')).toBe(true);
	});

	it('lists the four exports first, then the photos', () => {
		const e = plan().entries;
		expect(e.slice(0, 4).map((x) => [x.kind, x.path])).toEqual([
			['crif', 'Night-Train_2026-11-10-day03/Night-Train_2026-11-10-day03_camera-report.csv'],
			['plainCsv', 'Night-Train_2026-11-10-day03/Night-Train_2026-11-10-day03_all-fields.csv'],
			['ale', 'Night-Train_2026-11-10-day03/Night-Train_2026-11-10-day03_editorial.ale'],
			['json', 'Night-Train_2026-11-10-day03/Night-Train_2026-11-10-day03_data.json']
		]);
		expect(e[0]).toMatchObject({ mime: 'text/csv' });
		expect(e[2]).toMatchObject({ mime: 'text/plain' });
	});

	it('lays photos out by slate and take, named as CRIF, numbered per slate and camera in shot order', () => {
		const photos = plan().entries.filter((x) => x.kind === 'photo');
		expect(photos.map((p) => p.path.split('/').slice(1).join('/'))).toEqual(['photos/42A/take-1/42A-A-reference-1.heic', 'photos/42A/take-1/42A-A-reference-2.jpg', 'photos/42A/take-2/42A-A-reference-3.jpg']);
		expect(photos[0]).toMatchObject({ kind: 'photo', blobId: 'b2', stillId: 'st2', takeId: t42A1A.id, mime: 'image/heic', size: 200, pruned: false });
	});

	it('takes the first file of a photo, and marks one whose bytes left the device', () => {
		const photos = plan().entries.filter((x) => x.kind === 'photo');
		expect(photos.map((p) => (p.kind === 'photo' ? p.blobId : ''))).not.toContain('b1thumb');
		expect(photos[2]).toMatchObject({ blobId: 'b3', pruned: true });
	});

	it('names the photos that have no file at all', () => {
		const p = wrapPlan(flatten(input(), { shootDayIds: ['d3'] }), { project, shootDays: [day3], blobs: blobs.filter((b) => b.recordId !== 'st3') });
		expect(p.missingPhotos).toEqual(['st3']);
	});

	it('leaves out the photos on request', () => {
		const p = wrapPlan(flatten(input()), { project, shootDays: [day3], blobs, photos: false });
		expect(p.entries.map((e) => e.kind)).toEqual(['crif', 'plainCsv', 'ale', 'json']);
	});
});
